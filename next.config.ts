import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  api: {
    // Increase the body parser size limit to handle large requests
    bodyParser: {
      sizeLimit: '10mb',
    },
    // Increase the response limit for large audio files
    responseLimit: false,
    // Set a large value for externalResolver to prevent timeouts
    externalResolver: true,
  },
  // Increase the serverless function timeout
  serverRuntimeConfig: {
    // Will only be available on the server side
    PROJECT_ROOT: __dirname,
  },
  // Ensure we can handle large files in API routes
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static', 'https', 'http', 'url', 'stream', 'crypto'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
    largePageDataBytes: 128 * 1000 * 1000, // 128MB
  },
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
