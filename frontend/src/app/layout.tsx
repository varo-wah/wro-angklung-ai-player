import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WRO Angklung Simulator",
  description: "Browser simulator for actuator_schedule.v1 angklung playback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
