import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is static and all modelling runs in the browser, so the app is
  // exported as plain files (out/) and served from Cloudflare (wrangler.jsonc).
  output: "export",
  // The route indicator would sit over the sidebar footer (Team Kanban link);
  // compile and runtime errors are still surfaced.
  devIndicators: false,
};

export default nextConfig;
