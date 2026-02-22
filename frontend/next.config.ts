import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || 'https://portaldcp-production.up.railway.app';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Configuração para produção
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
