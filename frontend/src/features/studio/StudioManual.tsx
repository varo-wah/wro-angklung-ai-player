"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildFullAngklungRack } from "@/lib/instrumentMap";
import { useStudio } from "./runtime/useStudio";

export function StudioManual() {
  const { manual, calibration, robotMode, toggleOutput, actions } = useStudio();
  const [calibrating, setCalibrating] = useState(false);
  const [ceilings, setCeilings] = useState<(number | null)[] | null>(null);
  const [tested, setTested] = useState<{ channel: number; power: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
  useEffect(() => {
    let cancelled = false;
    setCeilings(null); setTested(null);
    if (calibrating && calibrationRef.current) {
      setCalibrationMessage("Reading saved note ceilings…");
      void calibrationRef.current.read().then(values => {
        if (!cancelled) { setCeilings(values); setCalibrationMessage(""); }
      }).catch(err => { if (!cancelled) setCalibrationMessage(err.message); });
    }
    return () => { cancelled = true; };
  }, [calibrating, !!calibration]);
  async function saveCeiling(reset = false) {
    if (!tested || !calibrationRef.current || !ceilings || saving) return;
    release(); setSaving(true); setCalibrationMessage("");
    try {
      await calibrationRef.current.save(tested.channel, reset ? null : tested.power);
      setCeilings(await calibrationRef.current.read());
      setCalibrationMessage(reset ? "Original song calibration restored." : `Saved ${tested.power}% as this note’s fortissimo ceiling on the Arduino.`);
    } catch (err) { setCalibrationMessage(err instanceof Error ? err.message : "Could not save calibration."); }
    finally { setSaving(false); }
  }
  const controls = useRef(manual);
  controls.current = manual;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const [active, setActive] = useState<number | null>(null);
  const [power, setPower] = useState(30);
  const [powerEntry, setPowerEntry] = useState<string | null>(null);
  const powerRef = useRef(power);
  powerRef.current = power;
  const [error, setError] = useState("");

  function release() {
    ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (holding.current) controls.current?.stop();
    holding.current = false;
    setActive(null);
  }

  useEffect(() => {
    const hide = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release);
    window.addEventListener("pagehide", release);
    document.addEventListener("visibilitychange", hide);
    return () => {
      release();
      window.removeEventListener("blur", release);
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => { if (!manual) release(); }, [!!manual]);

  async function press(channel: number) {
    if (!controls.current || holding.current || saving) return;
    holding.current = true;
    const current = ++generation.current;
    setActive(channel);
    setError("");
    try {
      const request = await controls.current.begin(channel);
      if (current !== generation.current) return;
      if (request === null) { release(); return; }
      const pulse = async () => {
        if (current !== generation.current) return;
        try {
          const testedPower = powerRef.current;
          const continued = await controls.current?.pulse(request, testedPower);
          if (current !== generation.current) return;
          if (!continued) { release(); return; }
          setTested({ channel, power: testedPower });
          if (current === generation.current) timer.current = setTimeout(() => void pulse(), 120);
        } catch (err) {
          if (current === generation.current) {
            release(); setError(err instanceof Error ? err.message : "Motor stopped.");
          }
        }
      };
      await pulse();
    } catch (err) {
      if (current === generation.current) {
        release(); setError(err instanceof Error ? err.message : "Could not start motor.");
      }
    }
  }

  return <>
    <div className="studio-page-heading"><div>
      <p className="studio-eyebrow">PLAY THE RACK</p><h1>Manual notes</h1>
      <p>Hold a note to play its motor. Release to stop. One motor at a time.</p>
    </div></div>
    <section className="studio-panel studio-settings-panel" aria-label="Manual motor controls">
      {!robotMode && <button onClick={toggleOutput}>Switch to angklung robot</button>}
      {!manual && <p role="status">On the Mac, open <Link href="/studio/device">Devices</Link>, enable the controller, and connect Arduino USB to play manual notes.</p>}
      <label><input type="checkbox" checked={calibrating} disabled={saving} onChange={event => { release(); setCalibrating(event.target.checked); }} /> Calibration mode</label>
      {calibrating && <section className="studio-calibration-panel" aria-label="Fortissimo calibration">
        <h2>Set each note’s fortissimo (ff)</h2>
        <p>Test a note at the power you want, release it, then save. At full song strength and 100% player volume, that note will use this ceiling. Softer dynamics stay below it.</p>
        <p>Saved on the Arduino across restarts. Manual testing stays at raw power. Untested notes keep their existing calibration.</p>
        <p>{tested ? `Last test: ${buildFullAngklungRack()[tested.channel].note} at ${tested.power}%` : "Hold a note below to test its power first."}</p>
        <button disabled={!calibration || !ceilings || !tested || tested.power !== power || active !== null || saving}
          onClick={() => void saveCeiling()}>{saving ? "Saving…" : "Set tested power as song ff max"}</button>
        <button disabled={!calibration || !ceilings || !tested || ceilings[tested.channel] === null || active !== null || saving}
          onClick={() => void saveCeiling(true)}>Restore this note’s original default</button>
        <p role="status">{calibrationMessage}</p>
      </section>}
      <p>Pressing a note stops the current song. Use a mouse, touch, or hold Space or Enter on a focused button.</p>
      <label>Motor power: {power}%
        <input aria-label="Manual motor power" type="range" min="0" max="100" step="1" disabled={!manual || saving}
          value={power} onChange={event => { setPower(Number(event.target.value)); setPowerEntry(null); }} />
      </label>
      <label className="studio-manual-power-entry">Type motor power (%)
        <input aria-label="Motor power percent" type="number" inputMode="numeric" min={0} max={100} step={1}
          disabled={!manual || saving} value={powerEntry ?? power}
          onChange={event => {
            const text = event.target.value;
            setPowerEntry(text);
            const value = Number(text);
            if (text !== "" && Number.isInteger(value) && value >= 0 && value <= 100) setPower(value);
          }}
          onBlur={() => {
            const value = Number(powerEntry);
            if (powerEntry !== null && powerEntry !== "" && Number.isFinite(value))
              setPower(Math.max(0, Math.min(100, Math.round(value))));
            setPowerEntry(null);
          }}
          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
      </label>
      <p>Direct PWM power: 100% is full motor output, independent of song volume and note calibration. This is not measured RPM.</p>
      <div className="studio-manual-grid">
        {buildFullAngklungRack().map(({ note, actuator_channel: channel }) =>
          <button key={channel} type="button" disabled={!manual || saving} aria-label={`Hold ${note}, motor ${channel + 1}`}
            aria-pressed={active === channel} className="studio-manual-note"
            onPointerDown={event => {
              if (event.button !== 0 || holding.current) return;
              event.preventDefault(); event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId); void press(channel);
            }}
            onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
            onContextMenu={event => event.preventDefault()}
            onKeyDown={event => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault(); if (!event.repeat) void press(channel);
              }
            }}
            onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); release(); } }}>
            <strong>{note}</strong><span>Motor {channel + 1} · CH {channel}</span>
            {calibrating && <small>{ceilings ? ceilings[channel] === null ? "Song ff: original default" : `Song ff max: ${ceilings[channel]}%` : "Song ff: not loaded"}</small>}
          </button>)}
      </div>
      <button onClick={() => { release(); actions.stop(); }}>Stop all motors</button>
      <p role="status">{error || (active !== null ? "Playing while held" : "Ready when connected")}</p>
    </section>
  </>;
}
