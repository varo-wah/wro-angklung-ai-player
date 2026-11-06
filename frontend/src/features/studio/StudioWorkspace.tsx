"use client";

import { usePathname } from "next/navigation";
import { AngklungSystemProvider } from "@/components/AngklungSystemProvider";
import { StudioShell } from "./StudioShell";
import { StudioProvider } from "./runtime/useStudio";

// Exactly one player owns output. Switching workspaces disposes the previous player.
export function StudioWorkspace({ children }: { children: React.ReactNode }) {
  return usePathname() === "/studio/device"
    ? <AngklungSystemProvider>{children}</AngklungSystemProvider>
    : <StudioProvider><StudioShell>{children}</StudioShell></StudioProvider>;
}
