"use client";

type ScheduleUploaderProps = {
  onLoad: (fileText: string, fileName: string) => void;
};

export function ScheduleUploader({ onLoad }: ScheduleUploaderProps) {
  return (
    <label className="flex cursor-pointer flex-col gap-3 rounded border border-slate-300 bg-white p-4 shadow-sm transition hover:border-sky-500">
      <span className="text-sm font-semibold text-slate-900">Upload actuator_schedule.v1 JSON</span>
      <input
        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-800"
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
