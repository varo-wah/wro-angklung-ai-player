"use client";

import type { RackInstrument } from "@/lib/types";

type AngklungTubeProps = {
  instrument: RackInstrument;
  active: boolean;
  compact?: boolean;
  revealIndex?: number;
};

export function AngklungTube({ instrument, active, compact = false, revealIndex = 0 }: AngklungTubeProps) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1.5 motion-safe:animate-tube-in ${active ? "scale-105 drop-shadow-[0_0_14px_rgba(190,242,100,0.85)]" : "scale-100"}`}
      style={{ animationDelay: `${Math.min(revealIndex * 24, 320)}ms` }}
    >
      <div className={active ? "animate-shake-tube" : "transition-transform duration-200"}>
        <div className={`relative rounded-t-full border border-amber-700 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-900 shadow-[0_12px_28px_rgba(0,0,0,0.55)] ${compact ? "h-16 w-8" : "h-32 w-14 sm:h-36 sm:w-16"}`}>
          <div className={`absolute rounded-full bg-amber-100/75 ${compact ? "left-1 top-2 h-12 w-1.5" : "left-2 top-4 h-24 w-3 sm:h-28 sm:w-3.5"}`} />
          <div className={`absolute rounded-full bg-amber-950/20 ${compact ? "right-1.5 top-3 h-10 w-1" : "right-3 top-6 h-20 w-2.5 sm:h-24"}`} />
          <div className={`absolute left-1.5 right-1.5 rounded bg-stone-900/55 ${compact ? "bottom-1.5 h-1.5" : "bottom-3 h-2.5"}`} />
        </div>
      </div>
      <div className="text-center">
        <div className={compact ? "text-[11px] font-bold text-slate-50" : "text-xs font-bold text-slate-50 sm:text-sm"}>{instrument.note}</div>
        <div className={compact ? "text-[9px] text-slate-500" : "text-[10px] text-slate-400 sm:text-xs"}>ch {instrument.actuator_channel}</div>
      </div>
    </div>
  );
}
