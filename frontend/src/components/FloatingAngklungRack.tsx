"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { RackInstrument } from "@/lib/types";
import { AngklungRack } from "./AngklungRack";

type FloatingAngklungRackProps = {
  instruments: RackInstrument[];
  activeInstrumentIds: Set<string>;
};

const DEFAULT_RACK_SIZE = { width: 760, height: 350 };
const MIN_RACK_SIZE = { width: 420, height: 260 };

type ResizeStart = {
  pointerX: number;
  pointerY: number;
  width: number;
  height: number;
};

function clampRackSize(width: number, height: number) {
  return {
    width: Math.min(Math.max(width, MIN_RACK_SIZE.width), window.innerWidth - 32),
    height: Math.min(Math.max(height, MIN_RACK_SIZE.height), window.innerHeight - 32),
  };
}

export function FloatingAngklungRack({ instruments, activeInstrumentIds }: FloatingAngklungRackProps) {
  const [isMinimized, setIsMinimized] = useState(true);
  const [rackSize, setRackSize] = useState(DEFAULT_RACK_SIZE);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<ResizeStart | null>(null);
  const activeCount = instruments.filter((instrument) => activeInstrumentIds.has(instrument.instrument_id)).length;

  useEffect(() => {
    function resizeFromWindow(event: PointerEvent) {
      const start = resizeStartRef.current;
      if (!start) {
        return;
      }

      setRackSize(clampRackSize(start.width + start.pointerX - event.clientX, start.height + start.pointerY - event.clientY));
    }

    function stopWindowResize() {
      if (!resizeStartRef.current) {
        return;
      }
      resizeStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
    }

    window.addEventListener("pointermove", resizeFromWindow);
    window.addEventListener("pointerup", stopWindowResize);
    window.addEventListener("pointercancel", stopWindowResize);
    return () => {
      window.removeEventListener("pointermove", resizeFromWindow);
      window.removeEventListener("pointerup", stopWindowResize);
      window.removeEventListener("pointercancel", stopWindowResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const rack = event.currentTarget.closest("aside");
    if (!rack) {
      return;
    }

    const bounds = rack.getBoundingClientRect();
    resizeStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: bounds.width,
      height: bounds.height,
    };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 64 : 24;
    const directions: Record<string, { width: number; height: number }> = {
      ArrowLeft: { width: step, height: 0 },
      ArrowRight: { width: -step, height: 0 },
      ArrowUp: { width: 0, height: step },
      ArrowDown: { width: 0, height: -step },
    };
    const direction = directions[event.key];
    if (!direction) {
      return;
    }

    event.preventDefault();
    setRackSize((current) => clampRackSize(current.width + direction.width, current.height + direction.height));
  }

  if (isMinimized) {
    return (
      <button
        aria-expanded="false"
        className="fixed bottom-4 right-4 z-40 flex h-12 animate-rack-dock-in items-center gap-3 rounded border border-lime-300/35 bg-[#0a0e14] px-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.65)] hover:-translate-y-0.5 hover:border-lime-300/60 motion-reduce:animate-none"
        onClick={() => setIsMinimized(false)}
        title="Expand virtual rack"
        type="button"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${activeCount > 0 ? "animate-pulse bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.9)]" : "bg-slate-600"}`} />
        <span>
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Virtual Rack</span>
          <span className="block text-xs font-semibold text-slate-100">{activeCount} active / {instruments.length} instruments</span>
        </span>
        <span className="ml-1 text-lg leading-none text-lime-300" aria-hidden="true">+</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Floating virtual angklung rack"
      className={`fixed bottom-4 right-4 z-40 animate-rack-panel-in overflow-hidden rounded-lg bg-[#0a0e14]/95 shadow-[0_24px_90px_rgba(0,0,0,0.75)] backdrop-blur motion-reduce:animate-none ${
        isResizing ? "select-none border border-lime-300/70" : "border border-lime-300/25"
      }`}
      style={{
        width: `min(${rackSize.width}px, calc(100vw - 2rem))`,
        height: `min(${rackSize.height}px, calc(100vh - 2rem))`,
      }}
    >
      <button
        aria-label="Resize virtual rack"
        className="absolute left-1.5 top-1.5 z-10 flex h-9 w-9 cursor-nwse-resize touch-none items-center justify-center rounded border border-transparent text-lg text-slate-500 hover:border-lime-300/30 hover:bg-lime-300/10 hover:text-lime-200 focus:border-lime-300/60 focus:text-lime-200"
        onDoubleClick={() => setRackSize(DEFAULT_RACK_SIZE)}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        title="Drag to resize; double-click to reset"
        type="button"
      >
        <span aria-hidden="true">&#8598;</span>
      </button>
      <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 pl-12 pr-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${activeCount > 0 ? "animate-pulse bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.9)]" : "bg-slate-600"}`} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-50">Virtual Angklung Rack</h2>
            <p className="truncate text-[11px] text-slate-400">G3-C6 / {activeCount} active / {instruments.length} instruments</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-[10px] text-slate-500 sm:block">
            {Math.round(rackSize.width)} x {Math.round(rackSize.height)}
          </span>
          <button
            aria-expanded="true"
            aria-label="Minimize virtual rack"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 text-xl leading-none text-slate-300 hover:border-white/25 hover:text-white"
            onClick={() => setIsMinimized(true)}
            title="Minimize virtual rack"
            type="button"
          >
            &minus;
          </button>
        </div>
      </div>
      <div className="h-[calc(100%_-_3rem)] overflow-auto p-3">
        <AngklungRack activeInstrumentIds={activeInstrumentIds} compact instruments={instruments} />
      </div>
    </aside>
  );
}
