"use client";

import type { ActuatorCommand } from "@/lib/types";

type TimelineViewProps = {
  commands: ActuatorCommand[];
  activeCommandIds: Set<string>;
};

export function TimelineView({ commands, activeCommandIds }: TimelineViewProps) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">Timeline</h2>
      <div className="max-h-80 overflow-auto rounded border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-900 text-white">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Instrument</th>
              <th className="px-3 py-2">Channel</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Strength</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => {
              const active = activeCommandIds.has(command.command_id);
              return (
                <tr key={command.command_id} className={active ? "bg-sky-100" : "odd:bg-white even:bg-slate-50"}>
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
