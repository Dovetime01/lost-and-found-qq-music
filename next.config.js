const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
}

module.exports = nextConfig
