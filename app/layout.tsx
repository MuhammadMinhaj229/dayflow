import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DayFlow — Personal Command Center",
  description: "A calm, connected space to plan your day and move your projects forward.",
  manifest: "/manifest.webmanifest",
  applicationName: "DayFlow",
};
export const viewport: Viewport = { themeColor: "#090b10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
