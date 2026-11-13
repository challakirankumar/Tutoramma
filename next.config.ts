import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

// Exposes Cloudflare bindings (local D1, Durable Objects) to `next dev` via getCloudflareContext().
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
