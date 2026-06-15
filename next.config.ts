import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid React's dev-only double-invoke of effects, which fires every
  // useEffect (and therefore every data fetch) twice in development.
  reactStrictMode: false,
};

export default nextConfig;
