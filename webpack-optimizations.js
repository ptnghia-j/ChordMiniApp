
// Additional webpack optimizations for unused JavaScript removal
module.exports = {
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Remove unused polyfills
      config.resolve.alias = {
        ...config.resolve.alias,
        'core-js/modules': false,
        'regenerator-runtime': false,
      };

      // Exclude unused modules
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^./locale$/,
          contextRegExp: /moment$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^(analytics|performance|messaging|remote-config)$/,
          contextRegExp: /@firebase/,
        })
      );

      // Optimize imports
      config.optimization.providedExports = true;
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      
      // Remove dead code more aggressively
      config.optimization.innerGraph = true;
      config.optimization.mangleExports = true;
    }
    
    return config;
  }
};