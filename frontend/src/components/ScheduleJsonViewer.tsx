"use client";

import type { ActuatorSchedule } from "@/lib/types";

type ScheduleJsonViewerProps = {
  schedule: ActuatorSchedule | null;
};

export function ScheduleJsonViewer({ schedule }: ScheduleJsonViewerProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">JSON Preview</h2>
      <pre className="max-h-96 overflow-auto rounded border border-white/10 bg-black/70 p-4 text-xs leading-relaxed text-emerald-100">
        {schedule ? JSON.stringify(schedule, null, 2) : "No schedule loaded."}
      </pre>
    </section>
  );
}
