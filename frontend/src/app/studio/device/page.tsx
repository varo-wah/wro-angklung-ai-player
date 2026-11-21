"use client";

import { useStudio } from "@/features/studio/runtime/useStudio";

import { StudioDevices } from "@/features/studio/StudioDevices";

export default function DevicesPage() {
  const { devices } = useStudio();
  return devices ? <StudioDevices {...devices} /> : <p role="status">Checking devices…</p>;
}
