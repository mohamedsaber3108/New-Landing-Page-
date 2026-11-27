import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // HTML cache headers (Vary: Cookie, Cache-Control: private, no-store) live in
  // proxy.ts: vinext did not apply a headers() rule here to App Router pages.
};

export default nextConfig;
