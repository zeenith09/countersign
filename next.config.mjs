/** @type {import('next').NextConfig} */
import { readEnv } from './src/lib/config/env.mjs'

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    agentUpgrade: 'security',
  },
  output: 'standalone',
  distDir: readEnv('NEXT_DIST_DIR') ?? '.next',
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
