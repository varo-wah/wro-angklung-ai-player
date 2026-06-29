"use client";

import type { RackInstrument } from "@/lib/types";

type AngklungTubeProps = {
  instrument: RackInstrument;
  active: boolean;
};

export function AngklungTube({ instrument, active }: AngklungTubeProps) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className={active ? "animate-shake-tube" : ""}>
        <div className="relative h-32 w-14 rounded-t-full border border-amber-700 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-900 shadow-[0_12px_28px_rgba(0,0,0,0.55)] sm:h-36 sm:w-16">
          <div className="absolute left-2 top-4 h-24 w-3 rounded-full bg-amber-100/75 sm:h-28 sm:w-3.5" />
          <div className="absolute right-3 top-6 h-20 w-2.5 rounded-full bg-amber-950/20 sm:h-24" />
          <div className="absolute bottom-3 left-1.5 right-1.5 h-2.5 rounded bg-stone-900/55" />
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-bold text-slate-50 sm:text-sm">{instrument.note}</div>
        <div className="text-[10px] text-slate-400 sm:text-xs">ch {instrument.actuator_channel}</div>
      </div>
    </div>
  );
}
