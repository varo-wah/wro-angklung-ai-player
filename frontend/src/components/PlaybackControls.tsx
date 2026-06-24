"use client";

import type { PlaybackState } from "@/lib/types";

type PlaybackControlsProps = {
  disabled: boolean;
  playbackState: PlaybackState;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
};

export function PlaybackControls({
  disabled,
  playbackState,
  elapsedSeconds,
  totalDurationSeconds,
  onPlay,
  onPause,
  onStop,
  onReset,
}: PlaybackControlsProps) {
  const progress = totalDurationSeconds > 0 ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100) : 0;

  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300" disabled={disabled || playbackState === "playing"} onClick={onPlay}>
          Play
        </button>
        <button className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300" disabled={disabled || playbackState !== "playing"} onClick={onPause}>
          Pause
        </button>
        <button className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300" disabled={disabled} onClick={onStop}>
          Stop
        </button>
        <button className="rounded border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 disabled:text-slate-300" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        <div className="ml-auto text-sm font-medium text-slate-700">
          {elapsedSeconds.toFixed(2)}s / {totalDurationSeconds.toFixed(2)}s
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-sky-700 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
