"use client";

import type { RackInstrument } from "@/lib/types";

type AngklungTubeProps = {
  instrument: RackInstrument;
  active: boolean;
};

export function AngklungTube({ instrument, active }: AngklungTubeProps) {
  return (
    <div className="flex min-w-[112px] flex-col items-center gap-2">
      <div className={active ? "animate-shake-tube" : ""}>
        <div className="relative h-44 w-20 rounded-t-full border border-amber-800 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-800 shadow-md">
          <div className="absolute left-3 top-5 h-32 w-4 rounded-full bg-amber-100/75" />
          <div className="absolute right-4 top-8 h-28 w-3 rounded-full bg-amber-950/20" />
          <div className="absolute bottom-4 left-2 right-2 h-3 rounded bg-stone-900/55" />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-950">{instrument.note}</div>
        <div className="text-xs text-slate-600">{instrument.instrument_id}</div>
        <div className="text-xs text-slate-500">channel {instrument.actuator_channel}</div>
      </div>
    </div>
  );
}
