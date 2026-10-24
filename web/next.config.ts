import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["shared"],
  devIndicators: false,
  async redirects() {
    return [{ source: "/token/:address(0x[0-9a-fA-F]{40})", destination: `/token/${process.env.NEXT_PUBLIC_CHAIN_ID || "31337"}/:address`, permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
