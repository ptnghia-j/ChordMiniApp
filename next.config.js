/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // Enable standalone output for Docker deployments
  output: 'standalone',

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
    nextScriptWorkers: false,
  },

  // Image optimization
  images: {
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
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'yt3.ggpht.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 's3.us-east-1.amazonaws.com',
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
        // Enhanced CORS and CSP headers to handle YouTube embeds and Google Ads
        source: '/:path*',
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
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          {
            key: 'Content-Security-Policy',
            value: "connect-src 'self' blob: https://*.googleapis.com https://*.youtube.com https://www.youtube-nocookie.com https://*.ytimg.com https://*.ggpht.com https://*.google.com https://*.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://tpc.googlesyndication.com https://securepubads.g.doubleclick.net https://partner.googleadservices.com https://googleadservices.com https://quicktube.app https://chordmini-backend-191567167632.us-central1.run.app https://lrclib.net https://api.genius.com https://vercel.com https://*.vercel.com https://blob.vercel-storage.com https://*.blob.vercel-storage.com https://api.vercel.com https://gleitz.github.io https://*.vocalremover.org; worker-src 'self' blob:; frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://*.firebaseapp.com https://s3.us-east-1.amazonaws.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com; img-src 'self' data: https://*.googleapis.com https://*.youtube.com https://*.ytimg.com https://*.ggpht.com https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com https://pagead2.googlesyndication.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://www.youtube-nocookie.com https://*.googleapis.com https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com https://gleitz.github.io;",
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
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
        destination: `${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001'}/:path*`,
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

      
        // CSS optimization for PageSpeed Insights
        config.optimization.splitChunks.cacheGroups.styles = {
          name: 'styles',
          test: /\.css$/,
          chunks: 'all',
          enforce: true,
          priority: 20,
        };
        
        // Minimize CSS chunks to prevent render blocking
        config.optimization.splitChunks.cacheGroups.criticalCSS = {
          name: 'critical-css',
          test: /\.(css|scss|sass)$/,
          chunks: 'initial',
          enforce: true,
          priority: 30,
          maxSize: 50000, // 50KB limit for critical CSS
        };
        // Advanced bundle optimization for desktop performance
      config.optimization.splitChunks.maxSize = 120000; // Reduced from 150000
      config.optimization.splitChunks.maxInitialSize = 80000; // Reduced from 100000

      // More aggressive chunk splitting for React ecosystem
      config.optimization.splitChunks.cacheGroups.reactVendor = {
        test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
        name: 'react-vendor',
        chunks: 'all',
        priority: 60,
        enforce: true,
        maxSize: 80000,
      };

      config.optimization.splitChunks.cacheGroups.nextVendor = {
        test: /[\\/]node_modules[\\/]next[\\/]/,
        name: 'next-vendor',
        chunks: 'all',
        priority: 55,
        enforce: true,
        maxSize: 100000,
      };

      // Enhanced tree shaking optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      config.optimization.providedExports = true;

      // Module concatenation for better performance
      config.optimization.concatenateModules = true;

      // Fix source map generation issues for production
      config.devtool = 'hidden-source-map'; // Use hidden source maps to avoid browser warnings

      // Ensure proper source map handling for webpack chunks
      config.output = config.output || {};
      config.output.devtoolModuleFilenameTemplate = function (info) {
        const rel = info.resourcePath.replace(process.cwd(), '.');
        return `webpack://chordmini/${rel}`;
      };
      config.output.devtoolFallbackModuleFilenameTemplate = function (info) {
        return `webpack://chordmini/${info.resourcePath}?${info.hash}`;
      };
    } else {
      // Development source maps
      config.devtool = 'eval-source-map';
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

  // Output configuration for Vercel deployment
  // output: 'standalone', // Commented out for standard Vercel deployment

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

  // Source map configuration - Fixed for production deployment
  productionBrowserSourceMaps: true, // Enable source maps in production for better debugging



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
