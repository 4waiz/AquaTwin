import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "A physics-informed, self-calibrating digital twin for resilient and safe seawater desalination. By Team Kanban for the Khalifa University–UNESCO Global Water Hackathon 2026.";

export const metadata: Metadata = {
  metadataBase: new URL("https://aquatwin.kanbanstudios.ae"),
  title: { default: "AquaTwin · Desalination digital twin", template: "%s · AquaTwin" },
  description: DESCRIPTION,
  applicationName: "AquaTwin",
  authors: [{ name: "Team Kanban", url: "https://kanbanstudios.ae/team-kanban" }],
  openGraph: {
    type: "website",
    siteName: "AquaTwin",
    title: "AquaTwin · Desalination digital twin",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "AquaTwin · Desalination digital twin", description: DESCRIPTION },
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
const introGate = `(function(){try{var th=localStorage.getItem('aquatwin.theme');document.documentElement.dataset.theme=th==='light'?'light':'dark';}catch(e){}try{var q=new URLSearchParams(location.search);var f=q.get('intro')==='1';var n=q.get('intro')==='0';var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;var p=sessionStorage.getItem('aquatwin.intro.v1')==='1';if(!n&&!r&&(f||(!p&&location.pathname==='/'))){document.documentElement.dataset.intro='pending';}}catch(e){}})();`;

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
