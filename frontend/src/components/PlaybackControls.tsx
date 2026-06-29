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
  onEmergencyStop?: () => void;
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
  onEmergencyStop,
}: PlaybackControlsProps) {
  const progress = totalDurationSeconds > 0 ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100) : 0;

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState === "playing"} onClick={onPlay}>
          Play Simulation
        </button>
        <button className="rounded bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState !== "playing"} onClick={onPause}>
          Pause
        </button>
        <button className="rounded border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-white/30 disabled:text-slate-600" disabled={disabled} onClick={onStop}>
          Stop
        </button>
        <button className="rounded border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/30 disabled:text-slate-600" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        <button className="rounded border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-500" disabled title="Future hardware control">
          Play on Robot
        </button>
        <button className="rounded bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled} onClick={onEmergencyStop ?? onReset}>
          Emergency Stop
        </button>
        <div className="ml-auto text-sm font-medium text-slate-300">
          {elapsedSeconds.toFixed(2)}s / {totalDurationSeconds.toFixed(2)}s
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
