import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "@google/adk",
    "@solana/kit",
    "firebase-admin",
  ],
};

export default nextConfig;
