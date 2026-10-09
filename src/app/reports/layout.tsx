import type { Metadata } from "next";

// Pages are client components, so each route's tab title lives in its segment layout.
export const metadata: Metadata = { title: "Reports" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
