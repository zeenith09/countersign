/** @type {import('next').NextConfig} */
import { readEnv } from './src/lib/config/env.mjs'

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    agentUpgrade: 'security',
  },
  output: 'standalone',
  distDir: readEnv('NEXT_DIST_DIR') ?? '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
