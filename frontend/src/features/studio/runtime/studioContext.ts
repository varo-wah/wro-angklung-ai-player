import { createContext, type ReactNode } from "react";
import type { StudioController, StudioSnapshot } from "./studioController";

export type StudioView = { snapshot: StudioSnapshot; actions: StudioController["actions"]; robotMode: boolean;
  manual?: { begin(channel: number): Promise<number | null>; pulse(request: number): Promise<boolean>; stop(): void };
  sweep?: { run(): void; busy: boolean; message: string };
  outputLabel: string; toggleOutput(): void; connection: ReactNode };
export const StudioContext = createContext<StudioView | null>(null);
