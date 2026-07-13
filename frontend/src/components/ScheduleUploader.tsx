"use client";

type ScheduleUploaderProps = {
  onLoad: (fileText: string, fileName: string) => void;
};

export function ScheduleUploader({ onLoad }: ScheduleUploaderProps) {
  return (
    <label className="flex cursor-pointer flex-col gap-3 rounded border border-white/10 bg-black/35 p-4 shadow-sm transition hover:border-lime-300/60">
      <span className="text-sm font-semibold text-slate-100">Upload actuator_schedule.v1 JSON</span>
      <input
        className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-lime-300 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-lime-200"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          file.text().then((text) => onLoad(text, file.name));
        }}
      />
    </label>
  );
}
