"use client";

import { useEffect, useRef, useState } from "react";
import { buildFullAngklungRack } from "@/lib/instrumentMap";
import { useStudio } from "./runtime/useStudio";

export function StudioManual() {
  const { manual, robotMode, toggleOutput, actions } = useStudio();
  const controls = useRef(manual);
  controls.current = manual;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const [active, setActive] = useState<number | null>(null);
  const [power, setPower] = useState(30);
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
    if (!controls.current || holding.current) return;
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
          if (!await controls.current?.pulse(request, powerRef.current)) { release(); return; }
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
      {!manual && <p role="status">Enable the Mac controller and connect Arduino USB above. Manual notes are available on that Mac; phone and ESP32 control are not supported here yet.</p>}
      <p>Pressing a note stops the current song. Use a mouse, touch, or hold Space or Enter on a focused button.</p>
      <label>Motor power: {power}%
        <input aria-label="Manual motor power" type="range" min="0" max="100" step="1" disabled={!manual}
          value={power} onChange={event => setPower(Number(event.target.value))} />
      </label>
      <p>Direct PWM power: 100% is full motor output, independent of song volume and note calibration. This is not measured RPM.</p>
      <div className="studio-manual-grid">
        {buildFullAngklungRack().map(({ note, actuator_channel: channel }) =>
          <button key={channel} type="button" disabled={!manual} aria-label={`Hold ${note}, motor ${channel + 1}`}
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
          </button>)}
      </div>
      <button onClick={() => { release(); actions.stop(); }}>Stop all motors</button>
      <p role="status">{error || (active !== null ? "Playing while held" : "Ready when connected")}</p>
    </section>
  </>;
}
