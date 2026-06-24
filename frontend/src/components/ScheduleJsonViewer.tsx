"use client";

import type { ActuatorSchedule } from "@/lib/types";

type ScheduleJsonViewerProps = {
  schedule: ActuatorSchedule | null;
};

export function ScheduleJsonViewer({ schedule }: ScheduleJsonViewerProps) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">JSON Preview</h2>
      <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
        {schedule ? JSON.stringify(schedule, null, 2) : "No schedule loaded."}
      </pre>
    </section>
  );
}
