"use client";

import { Icon } from "./StudioShell";
import { INTERFACE_SIZE, QUEUE_WIDTH } from "./runtime/preferences";
import { useStudio } from "./runtime/useStudio";

export function StudioAppearanceControls() {
  const { snapshot: { preferences: p }, actions: a } = useStudio();
  return <div className="studio-appearance-controls">
    <button className="studio-theme-toggle" aria-label={`Switch to ${p.theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${p.theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => a.setTheme(p.theme === "dark" ? "light" : "dark")}>
      <Icon name={p.theme === "dark" ? "sun" : "moon"} size={17} /><span>{p.theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
    <div className="studio-size-controls" role="group" aria-label="Interface size">
      <button aria-label="Decrease interface size" title="Smaller interface" disabled={p.interfaceScale <= INTERFACE_SIZE.min}
        onClick={() => a.setInterfaceScale(p.interfaceScale - INTERFACE_SIZE.step)}>A−</button>
      <output aria-live="polite">{p.interfaceScale}%</output>
      <button aria-label="Increase interface size" title="Larger interface" disabled={p.interfaceScale >= INTERFACE_SIZE.max}
        onClick={() => a.setInterfaceScale(p.interfaceScale + INTERFACE_SIZE.step)}>A+</button>
    </div>
  </div>;
}

export function StudioAppearanceSettings() {
  const { snapshot: { preferences: p }, actions: a } = useStudio();
  return <section className="studio-panel studio-settings-panel" aria-label="Appearance preferences">
    <h2>Appearance & layout</h2>
    <div className="studio-setting">
      <div><h3>Theme</h3><p>Choose the look that suits your space.</p></div>
      <div className="studio-segmented" role="group" aria-label="Colour theme">
        <button aria-pressed={p.theme === "light"} onClick={() => a.setTheme("light")}><Icon name="sun" size={16} /> Light</button>
        <button aria-pressed={p.theme === "dark"} onClick={() => a.setTheme("dark")}><Icon name="moon" size={16} /> Dark</button>
      </div>
    </div>
    <div className="studio-setting">
      <div><h3><label htmlFor="studio-interface-size">Interface size</label></h3><p>Resize text and controls together. {INTERFACE_SIZE.default}% is the default.</p></div>
      <div className="studio-size-slider"><span>A</span><input id="studio-interface-size" type="range"
        min={INTERFACE_SIZE.min} max={INTERFACE_SIZE.max} step={INTERFACE_SIZE.step} value={p.interfaceScale}
        aria-valuetext={`${p.interfaceScale} percent`} onChange={(event) => a.setInterfaceScale(Number(event.target.value))} />
        <output htmlFor="studio-interface-size">{p.interfaceScale}%</output></div>
    </div>
    <div className="studio-setting">
      <div><h3>Player layout</h3><p>Drag the divider beside the queue to change its width on a computer.</p></div>
      <button className="studio-reset-layout" onClick={() => { a.setInterfaceScale(INTERFACE_SIZE.default); a.setQueueWidth(QUEUE_WIDTH.default); }}>Reset sizing</button>
    </div>
  </section>;
}
