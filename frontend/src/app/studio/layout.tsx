import type { Metadata } from "next";
import { StudioWorkspace } from "@/features/studio/StudioWorkspace";
import "./studio.css";
import "./performance.css";
import "./appearance.css";

export const metadata: Metadata = {
  title: "Angklobot Studio",
  description: "Explore your angklung library and shape your next performance.",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudioWorkspace>{children}</StudioWorkspace>;
}
