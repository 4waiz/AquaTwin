import type { MetadataRoute } from "next";
import { TAGLINE } from "@/lib/brand";

// Static export: the manifest is written once at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AquaTwin · Desalination digital twin",
    short_name: "AquaTwin",
    description: TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#04060a",
    theme_color: "#04060a",
    icons: [
      { src: "/brand/aquatwin-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/aquatwin-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/aquatwin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
