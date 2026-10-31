"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { QUEUE_WIDTH } from "./runtime/preferences";

export function QueueResizeHandle({ width, onPreview, onCommit }: {
  width: number;
  onPreview: (width: number | null) => void;
  onCommit: (width: number) => void;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; current: number; id: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState<number>(QUEUE_WIDTH.max);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const columns = handle.current?.parentElement?.parentElement;
    if (!columns) return;
    // Keep at least 380px for songs and the 28px gutter. CSS uses the same bounds.
    const measure = () => setMaxWidth(Math.max(QUEUE_WIDTH.min, Math.min(QUEUE_WIDTH.max, columns.clientWidth - 408)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(columns);
    return () => observer.disconnect();
  }, []);
  const clamp = (value: number) => Math.round(Math.max(QUEUE_WIDTH.min, Math.min(maxWidth, value)));
  const displayedWidth = clamp(width);
  const finish = (event: PointerEvent<HTMLDivElement>, save: boolean) => {
    if (drag.current?.id !== event.pointerId) return;
    const next = drag.current.current;
    drag.current = null;
    setDragging(false);
    if (save) onCommit(next);
    onPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={handle} role="separator" tabIndex={0} className={`performance-queue-resize${dragging ? " is-dragging" : ""}`}
    aria-label="Resize queue" aria-orientation="vertical" aria-controls="studio-playback-queue"
    aria-valuemin={QUEUE_WIDTH.min} aria-valuemax={maxWidth} aria-valuenow={displayedWidth}
    aria-valuetext={`${displayedWidth} pixels wide`} title="Drag to resize queue · Arrow keys to adjust · Double-click to reset"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: displayedWidth, current: displayedWidth, id: event.pointerId };
      setDragging(true);
    }}
    onPointerMove={(event) => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current.current = clamp(drag.current.width + drag.current.x - event.clientX);
      onPreview(drag.current.current);
    }}
    onPointerUp={(event) => finish(event, true)} onPointerCancel={(event) => finish(event, false)}
    onLostPointerCapture={(event) => finish(event, false)}
    onDoubleClick={() => onCommit(QUEUE_WIDTH.default)}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 40 : 10;
      const next = event.key === "ArrowLeft" ? displayedWidth + step : event.key === "ArrowRight" ? displayedWidth - step
        : event.key === "Home" ? QUEUE_WIDTH.min : event.key === "End" ? maxWidth : null;
      if (next === null) return;
      event.preventDefault();
      onCommit(clamp(next));
    }}><span /></div>;
}
