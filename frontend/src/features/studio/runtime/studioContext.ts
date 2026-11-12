import { createContext, type ReactNode } from "react";
import type { StudioController, StudioSnapshot } from "./studioController";

export type StudioView = { snapshot: StudioSnapshot; actions: StudioController["actions"]; robotMode: boolean;
  outputLabel: string; toggleOutput(): void; connection: ReactNode };
export const StudioContext = createContext<StudioView | null>(null);
