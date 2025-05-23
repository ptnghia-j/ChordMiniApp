import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '**',
      },
    ],
  },
  // Increase the serverless function timeout
  serverRuntimeConfig: {
    // Will only be available on the server side
    PROJECT_ROOT: __dirname,
  },
  // Ensure we can handle large files in API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    largePageDataBytes: 128 * 1000 * 1000, // 128MB
  },
  serverExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static', 'https', 'http', 'url', 'stream', 'crypto'],
  webpack: (config) => {
    // Add polyfills for node modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      url: require.resolve('url/'),
      crypto: require.resolve('crypto-browserify'),
    };
    return config;
  },
};

export default nextConfig;
