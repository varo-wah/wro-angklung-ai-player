"use client";

import type { RackInstrument } from "@/lib/types";
import { AngklungTube } from "./AngklungTube";

type AngklungRackProps = {
  instruments: RackInstrument[];
  activeInstrumentIds: Set<string>;
};

export function AngklungRack({ instruments, activeInstrumentIds }: AngklungRackProps) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-950">Virtual Angklung Rack</h2>
        <span className="text-sm text-slate-600">{instruments.length} instruments</span>
      </div>
      <div className="overflow-x-auto rounded bg-slate-100 p-5">
        <div className="relative flex min-h-64 min-w-max items-end gap-5 border-b-8 border-stone-800 px-4 pb-6">
          <div className="absolute left-2 right-2 top-7 h-3 rounded bg-stone-800" />
          {instruments.length === 0 ? (
            <div className="flex h-44 w-full items-center justify-center text-sm text-slate-500">
              Upload an actuator schedule to render the rack.
            </div>
          ) : (
            instruments.map((instrument) => (
              <AngklungTube
                key={`${instrument.instrument_id}-${instrument.actuator_channel}`}
                instrument={instrument}
                active={activeInstrumentIds.has(instrument.instrument_id)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
