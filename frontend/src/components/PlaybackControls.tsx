"use client";

import { useState } from "react";
import type { RobotTransportMode } from "@/lib/robotTransport";

import type { ArduinoConnectionState } from "@/lib/arduinoSerial";
import type { PlaybackState } from "@/lib/types";

type PlaybackControlsProps = {
  arduinoConnection: ArduinoConnectionState;
  transportMode?: RobotTransportMode;
  transportChanging?: boolean;
  onTransportChange?: (mode: RobotTransportMode) => Promise<void>;
  previewMuted?: boolean;
  onPreviewMutedChange?: (muted: boolean) => void;
  disabled: boolean;
  remoteControl?: boolean;
  physicalControl?: boolean;
  playbackState: PlaybackState;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onStop: () => void;
  onReset: () => void;
  onEmergencyStop?: () => void;
  onConnectArduino: () => void;
  onDisconnectArduino: () => void;
  onGenerate?: () => void;
  embedded?: boolean;
};

export function PlaybackControls({
  arduinoConnection,
  transportMode = "usb", transportChanging = false, onTransportChange,
  previewMuted = false,
  onPreviewMutedChange,
  disabled,
  remoteControl = false,
  physicalControl = false,
  playbackState,
  elapsedSeconds,
  totalDurationSeconds,
  onPlay,
  onPause,
  onSeek,
  onStop,
  onReset,
  onEmergencyStop,
  onConnectArduino,
  onDisconnectArduino,
  onGenerate,
  embedded = false,
}: PlaybackControlsProps) {
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  function commitSeek(seconds: number) {
    setSeekDraft(null);
    onSeek(seconds);
  }
  const arduinoConnected = arduinoConnection.status === "connected";
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectionLabel = transportMode === "esp32-usb" ? "ESP32 USB" : transportMode === "esp32" ? "ESP32" : "Arduino";
  async function connectAction() {
    setConnectionError(null);
    try { await (arduinoConnection.status === "connected" ? onDisconnectArduino() : onConnectArduino()); }
    catch (error) { setConnectionError(error instanceof Error ? error.message : "Connection failed."); }
  }
  const arduinoBusy = arduinoConnection.status === "connecting";
  const arduinoUnsupported = arduinoConnection.status === "unsupported";
  const playLabel = arduinoConnected
    ? arduinoConnection.outputMode === "active"
      ? `Play + ${connectionLabel}`
      : `Play + ${connectionLabel} (Dry Run)`
    : physicalControl ? remoteControl ? "Mac unavailable" : `Connect ${connectionLabel} to play` : "Play Simulation";

  const controls = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Playback</h3>
          <p className={`mt-0.5 text-[10px] font-semibold ${arduinoConnected ? (arduinoConnection.outputMode === "active" ? "text-emerald-300" : "text-amber-200") : "text-slate-500"}`}>
            {arduinoConnection.message}
          </p>
        </div>
        <div className="text-xs font-medium text-slate-400">
          {(seekDraft ?? elapsedSeconds).toFixed(2)}s / {totalDurationSeconds.toFixed(2)}s
        </div>
      </div>
      {onTransportChange && <div className="mb-3">
        <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
          Robot connection
          <select aria-label="Robot connection type" value={transportMode}
            disabled={remoteControl || transportChanging || arduinoBusy || playbackState === "playing"}
            onChange={event => {
              setConnectionError(null);
              void onTransportChange(event.target.value as RobotTransportMode).catch(error => setConnectionError(error instanceof Error ? error.message : "Could not switch connection."));
            }}
            className="rounded border border-white/20 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-50">
            <option value="usb">Arduino USB</option>
            <option value="esp32">ESP32 Wi-Fi</option>
            <option value="esp32-usb">ESP32 USB</option>
          </select>
        </label>
        {transportMode === "esp32" && <p className="mt-2 text-[11px] text-slate-400">Keep the Mac and ESP32 on the same Wi-Fi. If a song falls behind, playback stops; use USB for faster arrangements.</p>}
        {connectionError && <p role="alert" className="mt-2 text-xs text-amber-200">{connectionError}</p>}
      </div>}
      <div className="grid grid-cols-3 gap-2">
        <button className="rounded bg-emerald-400 px-2 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState === "playing" || (physicalControl && !arduinoConnected)} onClick={onPlay}>
          {playLabel}
        </button>
        <button className="rounded bg-lime-300 px-2 py-2 text-xs font-semibold text-slate-950 hover:bg-lime-200 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState !== "playing"} onClick={onPause}>
          Pause
        </button>
        <button className="rounded border border-white/15 bg-white/8 px-2 py-2 text-xs font-semibold text-slate-100 hover:border-white/30 disabled:text-slate-600" disabled={disabled && playbackState !== "playing"} onClick={onStop}>
          Stop
        </button>
      </div>
      {onGenerate ? (
        <button
          className="mt-3 w-full rounded bg-lime-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-200"
          onClick={onGenerate}
          type="button"
        >
          Generate
        </button>
      ) : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="rounded border border-white/15 bg-white/5 px-2 py-2 text-[11px] font-semibold text-slate-200 hover:border-white/30 disabled:text-slate-600" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        <button
          className={`rounded border px-2 py-2 text-[11px] font-semibold ${arduinoConnected ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-white/15 bg-white/5 text-slate-200 hover:border-white/30"}`}
          disabled={remoteControl || arduinoBusy || arduinoUnsupported || transportChanging}
          onClick={() => void connectAction()}
          title={arduinoUnsupported ? arduinoConnection.message : undefined}
          type="button"
        >
          {remoteControl ? "Controlled by Mac" : arduinoBusy || transportChanging ? "Connecting…" : arduinoConnected ? `Disconnect ${connectionLabel}` : `Connect ${connectionLabel}`}
        </button>
        <button className="rounded bg-red-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-red-400" onClick={onEmergencyStop ?? onReset}>
          E-Stop
        </button>
      </div>
      {onPreviewMutedChange && (
        <button type="button" aria-pressed={previewMuted}
          className="mt-3 rounded border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
          title="Silences virtual angklung audio on this browser only. Robot playback and rack animation continue."
          onClick={() => onPreviewMutedChange(!previewMuted)}>
          {previewMuted ? "Unmute virtual angklung" : "Mute virtual angklung"}
        </button>
      )}
      <div className="mt-3">
        <input type="range" aria-label="Playback position" min={0} max={totalDurationSeconds || 0} step={0.1}
          disabled={disabled || totalDurationSeconds <= 0}
          value={Math.min(seekDraft ?? elapsedSeconds, totalDurationSeconds)}
          aria-valuetext={`${(seekDraft ?? elapsedSeconds).toFixed(1)} seconds of ${totalDurationSeconds.toFixed(1)} seconds`}
          className="h-6 w-full cursor-pointer accent-lime-300 disabled:opacity-40"
          onChange={event => setSeekDraft(Number(event.target.value))}
          onPointerUp={event => commitSeek(Number(event.currentTarget.value))}
          onPointerCancel={() => setSeekDraft(null)}
          onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitSeek(Number(event.currentTarget.value)); }}
          onBlur={event => { if (seekDraft !== null) commitSeek(Number(event.currentTarget.value)); }} />
        <p className="text-[11px] text-slate-400">Choose a position, then press Play to continue from there.</p>
      </div>
    </>
  );

  if (embedded) {
    return <div className="mt-4 border-t border-white/10 pt-4">{controls}</div>;
  }

  return <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">{controls}</section>;
}
