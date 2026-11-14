"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRobotSession } from "@/hooks/useRobotSession";
import { RobotSessionStatus } from "@/components/RobotSessionStatus";
import { ArduinoSerialController } from "@/lib/arduinoSerial";
import { Esp32Transport } from "@/lib/esp32Transport";
import { Esp32UsbLink } from "@/lib/esp32UsbLink";
import type { RobotTransport, RobotTransportMode } from "@/lib/robotTransport";
import { OFFLINE_ROBOT, type RobotAction } from "@/lib/robotSession";
import { createSyncTabId, normalizeSnapshot, SYSTEM_SYNC_LIBRARY_VERSION, type SyncedSystemSnapshot } from "@/lib/systemSync";
import { StudioContext, type StudioView } from "./studioContext";
import type { StudioController } from "./studioController";

async function execute(player: StudioController, action: RobotAction) {
  switch (action.type) {
    case "select": await player.selectSong(action.songId); break;
    case "playSong": await player.playSong(action.songId); break;
    case "play": await player.play(); break;
    case "seek": player.seek(action.seconds); break;
    case "pause": player.pause(); break;
    case "stop": case "estop": case "cancel": case "reset": player.stop(); break;
    case "addToQueue": player.addToQueue(action.songId); break;
    case "moveInQueue": player.moveInQueue(action.key, action.direction); break;
    case "playQueueEntry": await player.playQueueEntry(action.key); break;
    case "removeFromQueue": player.removeFromQueue(action.key); break;
    case "setRepeat": player.setRepeat(action.repeat); break;
    case "setShuffle": player.setShuffle(action.shuffle); break;
    case "next": case "previous": case "clearQueue": await player[action.type](); break;
    case "savePlaylist": case "deletePlaylist": case "playPlaylist": await player[action.type](action.name); break;
    case "setVolume": player.setVolume(action.volume); break;
    case "settings": player.setTempo(action.settings.tempo); player.setMode(action.settings.mode); break;
    default: throw new Error("This command is unavailable in Studio.");
  }
  if ((action.type === "play" || action.type === "playSong") && player.getSnapshot().playback !== "playing")
    throw new Error(player.getSnapshot().error || "Playback could not start.");
  return { ok: true, value: true };
}

export function StudioRobotSession({ runtime, view, children }: { runtime: StudioController; view: StudioView; children: ReactNode }) {
  const [arduino, setArduino] = useState(OFFLINE_ROBOT.arduino);
  const [mirror, setMirror] = useState<SyncedSystemSnapshot | null>(null);
  const [error, setError] = useState("");
  const [sweeping, setSweeping] = useState(false);
  const [sweepMessage, setSweepMessage] = useState("");
  const [mode, setMode] = useState<RobotTransportMode>("usb");
  const transport = useRef<RobotTransport | null>(null);
  const alive = useRef(true);
  const [sourceTabId] = useState(createSyncTabId);
  const session = useRobotSession({
    arduino, halt: () => runtime.stop(), interrupt: () => {},
    applySnapshot: setMirror,
    execute: command => execute(runtime, command.action),
    snapshot: () => {
      const s = runtime.getSnapshot();
      const snapshot = normalizeSnapshot({ libraryVersion: SYSTEM_SYNC_LIBRARY_VERSION, sourceTabId, updatedAt: Date.now(),
        selectedSongId: s.selectedSongId || "", sourceLabel: s.song?.title || "", elapsedSeconds: s.positionSeconds,
        playbackState: s.playback === "idle" || s.playback === "ended" ? "stopped" : s.playback,
        schedule: s.schedule, safetyReport: s.safety })!;
      return { ...snapshot, studio: { playlists: s.preferences.playlists, volume: s.preferences.volume, queue: s.queue, queueIndex: s.queueIndex, shuffle: s.shuffle, repeat: s.repeat,
        playback: s.playback, tempo: s.preferences.tempo, mode: s.preferences.mode, error: s.error } };
    },
  });
  useEffect(() => {
    alive.current = true;
    try { const saved = localStorage.getItem("angklobot.transport"); if (saved === "esp32" || saved === "esp32-usb") setMode(saved); } catch {}
    return () => {
      alive.current = false;
      runtime.setRobot(null);
      const device = transport.current;
      transport.current = null;
      if (device?.connected) void device.disconnect().catch(() => {});
    };
  }, [runtime]);
  async function connect(authorizedOnly = false) {
    if (session.credentials.current.role !== "host") throw new Error("Enable the Mac controller first.");
    let device = transport.current;
    if (!device) {
      const changed = (state: typeof arduino) => {
        if (!alive.current || transport.current !== device) return;
        setArduino(state);
        if (state.status === "error" || state.status === "disconnected") runtime.stop();
      };
      device = mode === "usb" ? new ArduinoSerialController(changed) : new Esp32Transport(changed, mode === "esp32-usb" ? new Esp32UsbLink() : undefined);
      transport.current = device;
    }
    if (authorizedOnly) {
      if (mode !== "usb" || !await device.reconnectAuthorized()) return;
    } else await device.connect();
    if (!alive.current || session.credentials.current.role !== "host") { await device.disconnect(); return; }
    if (device.connected) runtime.setRobot(device, mode !== "usb");
  }

  useEffect(() => {
    if (session.role === "host" || !transport.current) return;
    const device = transport.current;
    transport.current = null;
    runtime.setRobot(null);
    setArduino(OFFLINE_ROBOT.arduino);
    if (device.connected) void device.disconnect().catch(() => {});
  }, [runtime, session.role]);

  const remote = session.role === "remote";
  const ready = remote ? session.status.hostOnline && session.status.arduino.status === "connected" && !!mirror?.studio
    : session.role === "host" && arduino.status === "connected" && !!transport.current?.connected;
  async function send(action: RobotAction) {
    try {
      if (!ready) throw new Error("Enable and connect the Mac controller, or pair with a Mac running Studio.");
      setError("");
      if (remote) await session.send(action);
      else {
        if (["stop", "estop", "pause", "seek"].includes(action.type)) session.cancelQueued();
        await execute(runtime, action);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Robot command failed."); }
  }
  const local = view.snapshot;
  const shared = remote && mirror?.studio ? mirror : null;
  const s = shared?.studio ? { ...local, ...shared.studio, selectedSongId: shared.selectedSongId,
    song: local.song?.id === shared.selectedSongId ? local.song : null, schedule: shared.schedule, safety: shared.safetyReport,
    songStatus: shared.schedule ? "ready" as const : "idle" as const, positionSeconds: shared.elapsedSeconds,
    durationSeconds: shared.schedule?.timing.total_duration_seconds ?? 0, validationErrors: [],
    preferences: { ...local.preferences, playlists: shared.studio.playlists ?? [], volume: shared.studio.volume ?? 100, mode: shared.studio.mode, tempo: shared.studio.tempo } } : local;

  async function switchOutput() {
    if (session.credentials.current.role === "host") {
      try { await session.releaseHost(); } catch (err) {
        setError(err instanceof Error ? err.message : "Could not release the Mac controller.");
        return;
      }
    }
    view.toggleOutput();
  }
  const actions: StudioView["actions"] = { ...view.actions,
    play: () => send({type:"play"}), pause: () => void send({type:"pause"}), stop: () => void send({type:"stop"}),
    selectSong: songId => send({type:"select",songId}), playSong: songId => send({type:"playSong",songId}),
    seek: seconds => void send({type:"seek",seconds}), next: () => send({type:"next"}), previous: () => send({type:"previous"}),
    addToQueue: songId => void send({type:"addToQueue",songId}), removeFromQueue: key => void send({type:"removeFromQueue",key}),
    clearQueue: () => void send({type:"clearQueue"}), playQueueEntry: key => send({type:"playQueueEntry",key}),
    moveInQueue: (key,direction) => void send({type:"moveInQueue",key,direction}), setShuffle: shuffle => void send({type:"setShuffle",shuffle}),
    setRepeat: repeat => void send({type:"setRepeat",repeat}),
    savePlaylist: name => void send({type:"savePlaylist",name}),
    deletePlaylist: name => void send({type:"deletePlaylist",name}),
    playPlaylist: name => send({type:"playPlaylist",name}),
    setVolume: volume => void send({type:"setVolume",volume}),
    setTempo: tempo => void send({type:"settings",settings:{tempo,mode:s.preferences.mode,strength:0.6}}),
    setMode: mode => void send({type:"settings",settings:{mode,tempo:s.preferences.tempo,strength:0.6}}),
    clearError: () => { setError(""); view.actions.clearError(); },
  };
  async function runSweep() {
    if (session.credentials.current.role !== "host" || !ready || mode !== "usb" || sweeping) return;
    session.cancelQueued();
    setSweeping(true);
    setSweepMessage("Sweeping the rack…");
    try { await runtime.runSweep(); setSweepMessage("Sweep complete."); }
    catch (err) { setSweepMessage(err instanceof Error ? err.message : "Sweep failed."); }
    finally { setSweeping(false); }
  }
  const connection = <div className="studio-controller">
    <h2>Mac controller</h2>
    {session.role === "host" && <label>Connection <select aria-label="Robot transport" value={mode} disabled={arduino.status === "connecting" || arduino.status === "connected"}
      onChange={event => { transport.current = null; setMode(event.target.value as RobotTransportMode); }}>
      <option value="usb">Arduino USB</option><option value="esp32-usb">ESP32 USB</option><option value="esp32">ESP32 Wi-Fi</option>
    </select></label>}
    <RobotSessionStatus session={session} onEnableHost={async () => { await session.enableHost(); await connect(true); }} onConnect={() => connect()}
      connectionLabel={mode === "usb" ? "Arduino USB" : mode === "esp32" ? "ESP32 Wi-Fi" : "ESP32 USB"} onStop={() => void send({type:"estop"})}/>
    {session.role === "remote" && !shared && <small role="status">Waiting for the Mac Studio player. Open Studio on the Mac to share its queue.</small>}
    {session.role === "host" && <small role="status">{arduino.message}</small>}
  </div>;
  return <StudioContext.Provider value={{ ...view, robotMode:true, toggleOutput: () => void switchOutput(), outputLabel:"Angklung robot", connection, actions,
    manual: session.role === "host" && ready && mode === "usb" ? {
      begin: channel => { session.cancelQueued(); return runtime.beginManualNote(channel); },
      pulse: (request, power) => runtime.pulseManualNote(request, power), stop: () => runtime.stop(),
    } : undefined,
    sweep: session.role === "host" && ready && mode === "usb" ? { run: runSweep, busy: sweeping, message: sweepMessage } : undefined,
    snapshot:{...s, error:error || s.error, schedule:ready ? s.schedule : null} }}>{children}</StudioContext.Provider>;
}
