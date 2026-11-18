import type { NextConfig } from "next";

import { securityHeaders } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // A6: cabeçalhos de segurança em todas as rotas (CSP sem nonces; ver src/config/security-headers.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({
            nodeEnv: process.env.NODE_ENV,
            vercelEnv: process.env.VERCEL_ENV,
          }),
        ],
      },
    ];
  },
  partialPrefetching: true,
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
