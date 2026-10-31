import type { Metadata } from "next";
import { StudioProvider } from "@/features/studio/runtime/useStudio";
import { StudioShell } from "@/features/studio/StudioShell";
import "./studio.css";
import "./performance.css";

export const metadata: Metadata = {
  title: "Angklobot Studio",
  description: "Explore your angklung library and shape your next performance.",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StudioProvider>
      <StudioShell>{children}</StudioShell>
    </StudioProvider>
  );
}
