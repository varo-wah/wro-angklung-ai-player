import type { Metadata, Viewport } from "next";
import { LegacySystemBoundary } from "@/components/LegacySystemBoundary";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "AI Angklung Performance System",
  description: "Guest song assistant and operator console for actuator_schedule.v1 angklung playback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LegacySystemBoundary>{children}</LegacySystemBoundary>
      </body>
    </html>
  );
}
