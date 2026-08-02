import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "*.plex.tv" },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3440, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/webp"],
  },
};

export default nextConfig;
