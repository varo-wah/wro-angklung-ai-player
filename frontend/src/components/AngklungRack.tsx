"use client";

import type { RackInstrument } from "@/lib/types";
import { AngklungTube } from "./AngklungTube";

type AngklungRackProps = {
  instruments: RackInstrument[];
  activeInstrumentIds: Set<string>;
  compact?: boolean;
};

export function AngklungRack({ instruments, activeInstrumentIds, compact = false }: AngklungRackProps) {
  const activeCount = instruments.filter((instrument) => activeInstrumentIds.has(instrument.instrument_id)).length;

  return (
    <section className={compact ? "min-w-0" : "rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]"}>
      {!compact ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Virtual Angklung Rack</h2>
          <p className="mt-1 text-xs text-slate-400">18-note G3-C6 physical rack map, arranged as a compact actuator board.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-lime-300/30 bg-lime-300/10 px-2 py-1 text-sm font-semibold text-lime-100">
            {instruments.length} instruments
          </span>
          <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-sm font-semibold text-emerald-100">
            {activeCount} active
          </span>
        </div>
      </div> : null}
      <div className={compact ? "rounded border border-white/10 bg-black/45 p-2" : "rounded border border-white/10 bg-black/45 p-4"}>
        <div className={`relative grid border-stone-950 ${compact ? "grid-cols-6 gap-x-2 gap-y-4 border-b-4 px-2 pb-3 pt-7 sm:grid-cols-9" : "grid-cols-3 gap-x-3 gap-y-7 border-b-8 px-3 pb-5 pt-10 sm:grid-cols-6 lg:grid-cols-9"}`}>
          <div className={`absolute left-3 right-3 rounded bg-stone-950 shadow-[0_0_18px_rgba(132,204,22,0.2)] ${compact ? "top-5 h-2" : "top-7 h-3"}`} />
          <div className={`absolute left-3 right-3 top-[calc(50%+0.3rem)] hidden rounded bg-stone-950 shadow-[0_0_18px_rgba(132,204,22,0.16)] ${compact ? "h-2 sm:block" : "h-3 lg:block"}`} />
          {instruments.map((instrument, index) => (
            <AngklungTube
              key={`${instrument.instrument_id}-${instrument.actuator_channel}`}
              instrument={instrument}
              active={activeInstrumentIds.has(instrument.instrument_id)}
              compact={compact}
              revealIndex={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
