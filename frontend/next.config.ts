import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || 'https://portaldcp-production.up.railway.app';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Transpila pacotes ESM que precisam de tratamento especial no webpack
  transpilePackages: ['@tiptap/y-tiptap', 'y-protocols', 'yjs'],
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
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
