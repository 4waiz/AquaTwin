import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AquaTwin — Desalination digital twin",
  description:
    "A physics-informed, self-calibrating digital twin for resilient and safe seawater desalination. Team Kanban — Khalifa University–UNESCO Global Water Hackathon 2026.",
};

export const viewport: Viewport = {
  themeColor: "#04060a",
  colorScheme: "dark",
};

/**
 * Runs before first paint: if the intro will play on this load, gate the
 * interface (opacity only, no layout) so it can be revealed in sequence.
 * Mirrors the decision in TwinHost; never gates when reduced motion is set.
 */
const introGate = `(function(){try{var q=new URLSearchParams(location.search);var f=q.get('intro')==='1';var n=q.get('intro')==='0';var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;var p=sessionStorage.getItem('aquatwin.intro.v1')==='1';if(!n&&!r&&(f||(!p&&location.pathname==='/'))){document.documentElement.dataset.intro='pending';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introGate }} />
      </head>
      <body className="h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
