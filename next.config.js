const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Keep the native binary outside the bundler; Vercel must copy it into the function.
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/identify-song': ['./node_modules/ffmpeg-static/**/*'],
    '/api/analyze-multimodal': ['./node_modules/ffmpeg-static/**/*'],
  },
}

module.exports = nextConfig
