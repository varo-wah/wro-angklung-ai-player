"use client";

import type { ActuatorCommand } from "@/lib/types";

type TimelineViewProps = {
  commands: ActuatorCommand[];
  activeCommandIds: Set<string>;
};

export function TimelineView({ commands, activeCommandIds }: TimelineViewProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Timeline</h2>
      <div className="max-h-72 overflow-auto rounded border border-white/10">
        <table className="w-full min-w-[620px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-black text-slate-100">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Instrument</th>
              <th className="px-3 py-2">Channel</th>
              <th className="px-3 py-2">Dur</th>
              <th className="px-3 py-2">Str</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => {
              const active = activeCommandIds.has(command.command_id);
              return (
                <tr key={command.command_id} className={active ? "bg-amber-300/18 text-amber-50" : "odd:bg-white/5 even:bg-white/[0.03] text-slate-300"}>
                  <td className="px-3 py-2 font-mono">{command.start_time_seconds.toFixed(3)}s</td>
                  <td className="px-3 py-2 font-semibold">{command.note}</td>
                  <td className="px-3 py-2">{command.instrument_id}</td>
                  <td className="px-3 py-2">{command.actuator_channel}</td>
                  <td className="px-3 py-2">{command.duration_seconds.toFixed(3)}s</td>
                  <td className="px-3 py-2">{command.strength.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
