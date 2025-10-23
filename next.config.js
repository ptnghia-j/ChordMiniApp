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
      // Simplified bundle splitting strategy to reduce fragmentation
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 30000, // Increased from 10000 to align with webpack defaults
        cacheGroups: {
          // Framework: React core (priority 60)
          'framework-react': {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'framework-react',
            chunks: 'all',
            priority: 60,
            enforce: true,
          },
          // Framework: Next.js (priority 55)
          'framework-next': {
            test: /[\\/]node_modules[\\/]next[\\/]/,
            name: 'framework-next',
            chunks: 'all',
            priority: 55,
            enforce: true,
          },
          // Vendor: Firebase (consolidated all Firebase packages, priority 40)
          'vendor-firebase': {
            test: /[\\/]node_modules[\\/](@firebase\/|firebase\/)[\\/]/,
            name: 'vendor-firebase',
            chunks: 'all',
            priority: 40,
            enforce: true,
          },
          // Vendor: UI libraries (priority 35)
          'vendor-ui': {
            test: /[\\/]node_modules[\\/](@heroui|@headlessui\/react|@heroicons|@radix-ui\/|react-icons)[\\/]/,
            name: 'vendor-ui',
            chunks: 'all',
            priority: 35,
          },
          // Vendor: Chart.js and related (priority 34)
          'vendor-charts': {
            test: /[\\/]node_modules[\\/](chart\.js|chartjs-.*|@kurkle|react-chartjs-2)[\\/]/,
            name: 'vendor-charts',
            chunks: 'all',
            priority: 34,
          },
          // Vendor: Audio libraries (priority 33)
          'vendor-audio': {
            test: /[\\/]node_modules[\\/](tone|smplr|music-metadata|@distube\/ytdl-core|ytdl-core|lamejs)[\\/]/,
            name: 'vendor-audio',
            chunks: 'all',
            priority: 33,
          },
          // Vendor: State management (priority 32)
          'vendor-state': {
            test: /[\\/]node_modules[\\/](@tanstack\/react-query|zustand)[\\/]/,
            name: 'vendor-state',
            chunks: 'all',
            priority: 32,
          },
          // Vendor: Utility libraries (priority 31)
          'vendor-utils': {
            test: /[\\/]node_modules[\\/](lodash|date-fns|uuid|crypto-js|clsx)[\\/]/,
            name: 'vendor-utils',
            chunks: 'all',
            priority: 31,
          },
          // Styles: CSS files (priority 20)
          styles: {
            name: 'styles',
            test: /\.css$/,
            chunks: 'all',
            enforce: true,
            priority: 20,
          },
          // Vendors: Catchall for remaining node_modules (priority 10)
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
            minChunks: 2,
          },
        },
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
