import type { Metadata } from "next";
import { AngklungSystemProvider } from "@/components/AngklungSystemProvider";
import "./globals.css";

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
        <AngklungSystemProvider>{children}</AngklungSystemProvider>
      </body>
    </html>
  );
}
