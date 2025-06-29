/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // Server external packages
  serverExternalPackages: [],

  // Transpile ES modules that need to be converted to CommonJS
  transpilePackages: ['@music.ai/sdk'],

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Modern JavaScript compilation
  compiler: {
    // Remove console.logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },

  // Target modern browsers to reduce bundle size
  experimental: {
    optimizePackageImports: ['firebase', '@firebase/app', '@firebase/firestore', '@firebase/auth'],
  },

  // Image optimization
  images: {
    domains: [
      'img.youtube.com',
      'i.ytimg.com',
      'yt3.ggpht.com',
      'firebasestorage.googleapis.com',
      'lh3.googleusercontent.com'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: '**.youtube.com',
      },
      {
        protocol: 'https',
        hostname: '**.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.ggpht.com',
      }
    ],
  },

  // Headers for security and CORS
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
      {
        // Suppress Google Ads CORS errors from YouTube embeds
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "connect-src 'self' https://*.googleapis.com https://*.youtube.com https://*.ytimg.com https://*.ggpht.com https://quicktube.app https://chordmini-backend-full-191567167632.us-central1.run.app https://lrclib.net https://api.genius.com https://vercel.com https://*.vercel.com https://blob.vercel-storage.com https://*.blob.vercel-storage.com https://api.vercel.com; frame-src 'self' https://www.youtube.com https://youtube.com https://*.firebaseapp.com;",
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/github',
        destination: 'https://github.com/ptnghia-j/ChordMiniApp',
        permanent: false,
      },
    ];
  },

  // Rewrites for API proxying
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-191567167632.us-central1.run.app'}/:path*`,
      },
    ];
  },

  // Webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Performance optimizations
    if (!dev && !isServer) {
      // Advanced bundle splitting for better caching and loading
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 10000, // Reduced from 20000 for better granularity
        maxSize: 150000, // Reduced from 244000 to prevent large chunks
        maxAsyncSize: 200000,
        maxInitialSize: 100000,
        cacheGroups: {
          // React core - separate from other framework code
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 50,
            enforce: true,
          },
          // Next.js framework
          nextjs: {
            test: /[\\/]node_modules[\\/]next[\\/]/,
            name: 'nextjs',
            chunks: 'all',
            priority: 45,
            enforce: true,
          },
          // Firebase core
          firebaseCore: {
            test: /[\\/]node_modules[\\/](@firebase\/app|firebase\/app)[\\/]/,
            name: 'firebase-core',
            chunks: 'all',
            priority: 40,
            enforce: true,
          },
          // Firebase services (split into smaller chunks)
          firebaseFirestore: {
            test: /[\\/]node_modules[\\/](@firebase\/firestore|firebase\/firestore)[\\/]/,
            name: 'firebase-firestore',
            chunks: 'all',
            priority: 35,
            enforce: true,
          },
          firebaseAuth: {
            test: /[\\/]node_modules[\\/](@firebase\/auth|firebase\/auth)[\\/]/,
            name: 'firebase-auth',
            chunks: 'all',
            priority: 35,
            enforce: true,
          },
          firebaseStorage: {
            test: /[\\/]node_modules[\\/](@firebase\/storage|firebase\/storage)[\\/]/,
            name: 'firebase-storage',
            chunks: 'all',
            priority: 35,
            enforce: true,
          },
          // Framer Motion - separate chunk for animations
          framerMotion: {
            test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
            name: 'framer-motion',
            chunks: 'all',
            priority: 30,
            enforce: true,
          },
          // Chart.js - separate chunk for visualizations
          chartjs: {
            test: /[\\/]node_modules[\\/](chart\.js|chartjs-.*|@kurkle)[\\/]/,
            name: 'chartjs',
            chunks: 'all',
            priority: 25,
            enforce: true,
          },
          // Audio processing libraries
          audioLibs: {
            test: /[\\/]node_modules[\\/](@music\.ai|ytdl-core|@distube|music-metadata)[\\/]/,
            name: 'audio-libs',
            chunks: 'all',
            priority: 20,
            enforce: true,
          },
          // UI component libraries
          uiLibs: {
            test: /[\\/]node_modules[\\/](@headlessui|@heroicons|react-icons)[\\/]/,
            name: 'ui-libs',
            chunks: 'all',
            priority: 18,
          },
          // Utility libraries
          utils: {
            test: /[\\/]node_modules[\\/](lodash|date-fns|uuid|crypto-js|clsx)[\\/]/,
            name: 'utils',
            chunks: 'all',
            priority: 15,
          },
          // React Query and state management
          stateManagement: {
            test: /[\\/]node_modules[\\/](@tanstack\/react-query|zustand)[\\/]/,
            name: 'state-management',
            chunks: 'all',
            priority: 12,
          },
          // Default vendor chunk for remaining libraries
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 5,
            minChunks: 2,
            maxSize: 100000, // Keep vendor chunks smaller
          },
        },
      };

      // Enhanced tree shaking optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      config.optimization.providedExports = true;

      // Module concatenation for better performance
      config.optimization.concatenateModules = true;
    }

    // Handle audio files
    config.module.rules.push({
      test: /\.(mp3|wav|ogg|flac)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/audio/',
          outputPath: 'static/audio/',
        },
      },
    });

    // Fix for @music.ai/sdk ES module bundling issues
    if (isServer) {
      // Ensure @music.ai/sdk is properly bundled for server-side rendering
      config.externals = config.externals || [];

      // Don't externalize @music.ai/sdk - bundle it instead
      if (Array.isArray(config.externals)) {
        config.externals = config.externals.filter(external => {
          if (typeof external === 'string') {
            return !external.includes('@music.ai/sdk');
          }
          return true;
        });
      }
    }

    // Handle ES modules properly
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    };

    return config;
  },

  // Output configuration for static export (if needed)
  output: 'standalone',

  // Disable x-powered-by header
  poweredByHeader: false,

  // Compression
  compress: true,

  // Generate ETags for caching
  generateEtags: true,

  // Page extensions
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],

  // Trailing slash configuration
  trailingSlash: false,

  // React strict mode
  reactStrictMode: true,



  // TypeScript configuration
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
  },
};

module.exports = withBundleAnalyzer(nextConfig);
