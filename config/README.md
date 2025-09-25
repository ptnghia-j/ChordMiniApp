# Configuration Files

This directory contains configuration files that have been organized for better project structure.

## Files

### Build & Bundle Configuration
- `bundle-optimization.json` - Bundle optimization settings
- `package.optimized.json` - Optimized package configuration
- `webpack-optimizations.js` - Webpack optimization settings

### Testing Configuration
- `jest.config.js` - Main Jest configuration
- `jest.config.analyze-page.js` - Jest configuration for page analysis
- `jest.setup.js` - Jest setup file

### Infrastructure Configuration
- `redis.conf` - Redis server configuration

## Usage

These files are referenced from the root directory and build tools. The paths have been updated in:
- `package.json` - Jest commands now use `--config config/jest.config.js`
- Jest configuration files have been updated to use relative paths

## Note

Core build tool configuration files like `next.config.js`, `tailwind.config.js`, `tsconfig.json`, and `postcss.config.js` remain in the root directory as they are expected there by the respective build tools.
