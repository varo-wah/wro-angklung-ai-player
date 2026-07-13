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
  onGenerate?: () => void;
  embedded?: boolean;
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
  onGenerate,
  embedded = false,
}: PlaybackControlsProps) {
  const progress = totalDurationSeconds > 0 ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100) : 0;

  const controls = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">Simulation</h3>
        <div className="text-xs font-medium text-slate-400">
          {elapsedSeconds.toFixed(2)}s / {totalDurationSeconds.toFixed(2)}s
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="rounded bg-emerald-400 px-2 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState === "playing"} onClick={onPlay}>
          Play Simulation
        </button>
        <button className="rounded bg-lime-300 px-2 py-2 text-xs font-semibold text-slate-950 hover:bg-lime-200 disabled:bg-slate-800 disabled:text-slate-500" disabled={disabled || playbackState !== "playing"} onClick={onPause}>
          Pause
        </button>
        <button className="rounded border border-white/15 bg-white/8 px-2 py-2 text-xs font-semibold text-slate-100 hover:border-white/30 disabled:text-slate-600" disabled={disabled && playbackState !== "playing"} onClick={onStop}>
          Stop
        </button>
      </div>
      {onGenerate ? (
        <button
          className="mt-3 w-full rounded bg-lime-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-200"
          onClick={onGenerate}
          type="button"
        >
          Generate
        </button>
      ) : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="rounded border border-white/15 bg-white/5 px-2 py-2 text-[11px] font-semibold text-slate-200 hover:border-white/30 disabled:text-slate-600" disabled={disabled} onClick={onReset}>
          Reset
        </button>
        <button className="rounded border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-semibold text-slate-500" disabled title="Future hardware control">
          Play on Robot
        </button>
        <button className="rounded bg-red-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-red-400" onClick={onEmergencyStop ?? onReset}>
          E-Stop
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-lime-300 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </>
  );

  if (embedded) {
    return <div className="mt-4 border-t border-white/10 pt-4">{controls}</div>;
  }

  return <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">{controls}</section>;
}
