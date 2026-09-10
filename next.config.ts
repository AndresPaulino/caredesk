import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores lockfiles in parent directories.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
