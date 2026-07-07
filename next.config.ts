import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads (PDFs can be big)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  reactStrictMode: true,
};

export default nextConfig;
