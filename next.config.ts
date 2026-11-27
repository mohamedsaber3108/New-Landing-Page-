import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HTML depends on the usam-locale cookie (server-rendered <html lang dir> and
  // page text), so no shared cache may store it or serve one visitor's
  // language to another. One rule for every page; API routes, build assets
  // (/_next/) and public files are excluded and keep their own caching.
  async headers() {
    return [
      {
        source: "/:path((?!api/|_next/|brand/|favicon|file\\.svg|globe\\.svg|window\\.svg).*)",
        headers: [
          { key: "Vary", value: "Cookie" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
