import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ANGKLOBOT_DIST_DIR || ".next",
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
