"use client";

import { StudioShell } from "./StudioShell";
import { StudioProvider } from "./runtime/useStudio";

export function StudioWorkspace({ children }: { children: React.ReactNode }) {
  return <StudioProvider><StudioShell>{children}</StudioShell></StudioProvider>;
}
