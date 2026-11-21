"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RobotSession } from "@/hooks/useRobotSession";
import type { RobotTransportMode } from "@/lib/robotTransport";
import type { ArduinoConnectionState } from "@/lib/arduinoSerial";
import { Icon } from "./StudioShell";

const transportNames = { usb: "Arduino USB", "esp32-usb": "ESP32 USB", esp32: "ESP32 Wi-Fi" };
export type StudioDeviceProps = {
  session: RobotSession;
  instrument: ArduinoConnectionState;
  mode: RobotTransportMode;
  changeMode(mode: RobotTransportMode): void;
  enableHost(): Promise<void>;
  connect(): Promise<void>;
  stop(): void;
};

export function StudioDevices({ session, instrument, mode, changeMode, enableHost, connect, stop }: StudioDeviceProps) {
  const [local, setLocal] = useState(false);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setLocal(["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)); }, []);
  const host = session.role === "host";
  const online = session.status.hostOnline;
  const paired = session.role === "remote" && online;
  const connected = instrument.status === "connected";
  const active = connected && instrument.outputMode === "active";
  const macState = online ? "Online" : session.serverAvailable ? "Offline" : session.error ? "Unavailable" : "Checking…";
  const instrumentState = session.status.virtualPlayback ? "Mac speakers" : active ? "Active" : connected ? "Dry run" : instrument.status === "connecting" ? "Connecting…" : "Disconnected";
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed. Try again."); }
    finally { setBusy(false); }
  }

  return <div className="devices-page">
    <header className="performance-heading"><div><h1>Devices</h1>
      <p>The Mac plays the angklung. Your phone controls its player and queue.</p>
    </div></header>
    <div className="devices-layout">
      <section className="device-pair-card" aria-label="Phone remote">
        <div className="device-card-title"><Icon name="phone" size={23} /><h2>Phone remote</h2></div>
        {host ? <>
          <img className="device-qr" src="/phone-pairing.png" width="156" height="156" alt="Scan to open phone pairing" />
          <h3>Scan to connect</h3>
          <p>Scan with your phone camera, or visit <b>angklobot.web.app</b> and tap <b>Pair a phone</b>. Enter this code when prompted.</p>
          <span className="device-field-label">Mac pairing code</span>
          <output aria-label="Mac pairing code" className="device-code">{session.code}</output>
        </> : paired ? <>
          <h3>Phone paired</h3><p>You’re connected to the Mac’s session. Open the player to choose a song or change the queue.</p>
          <Link className="device-primary" href="/studio?output=robot">Open player <Icon name="arrow" size={17} /></Link>
        </> : local && !online ? <>
          <h3>Connect your phone</h3><p>Enable the controller on this Mac to show a QR code and a six-digit pairing code. Keep this tab open while using your phone.</p>
          <button className="device-primary" disabled={busy || !session.serverAvailable} onClick={() => void perform(enableHost)}>Enable Mac controller <Icon name="arrow" size={17} /></button>
        </> : <>
          <h3>Join the Mac</h3>
          <p>{online ? "Enter the six-digit code shown in Devices on the Mac." : "On the Mac, open Studio → Devices and enable the Mac controller. The code will appear there."}</p>
          <form onSubmit={event => { event.preventDefault(); if (online && digits.length === 6) void perform(() => session.pair(digits)); }}>
            <label className="device-field-label" htmlFor="phone-code">Mac pairing code</label>
            <input id="phone-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={digits}
              onChange={event => setDigits(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            <button className="device-primary" disabled={busy || !online || digits.length !== 6}>Pair device <Icon name="arrow" size={17} /></button>
          </form>
        </>}
      </section>
      <section className="device-session" aria-label="Mac session">
        <div className="device-card-title"><Icon name="device" size={23} /><h2>Mac session</h2></div>
        <dl><div><dt>Mac controller</dt><dd data-online={online}>{macState}</dd></div>
          <div><dt>Instrument output</dt><dd data-online={active}>{instrumentState}</dd></div></dl>
        {host && <>
          <label className="device-field-label" htmlFor="device-transport">Instrument connection</label>
          <select id="device-transport" value={mode} disabled={busy || connected || instrument.status === "connecting"}
            onChange={event => changeMode(event.target.value as RobotTransportMode)}>
            {Object.entries(transportNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          {!connected && <button className="performance-primary" disabled={busy} onClick={() => void perform(connect)}>Connect {transportNames[mode]}</button>}
          <p role="status">{instrument.message}</p>
        </>}
        {(paired || host) && <div className="device-session-actions">
          <button className="device-stop" onClick={stop}><Icon name="stop" size={14} /> Stop robot</button>
          {host && <button disabled={busy} onClick={() => void perform(session.releaseHost)}>Disable remote control</button>}
        </div>}
      </section>
    </div>
    {(session.error || error) && <p className="studio-alert" role="alert">{error || session.error}</p>}
  </div>;
}
