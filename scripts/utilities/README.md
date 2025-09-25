# Utility Scripts

This folder contains utility scripts for maintenance, optimization, and administrative tasks.

## Cache Management

### Firebase Cache Management
- `delete-cache.js` - Delete Firebase cache entries
- `delete-cache-admin.js` - Administrative cache deletion
- `delete-translation-cache.js` - Delete translation cache
- `quick-cache-delete.sh` - Quick cache deletion script

### Data Management
- `investigate-firestore-data.js` - Investigate Firestore data
- `run-regeneration.js` - Run data regeneration tasks
- `regenerate-synchronized-chords.ts` - Regenerate synchronized chord data

## Performance Optimization

### Bundle Optimization
- `advanced-bundle-optimization.js` - Advanced bundle optimization
- `analyze-bundle.js` - Bundle analysis
- `remove-unused-deps.js` - Remove unused dependencies

### Performance Analysis
- `optimize-performance.js` - General performance optimization
- `desktop-performance-optimization.js` - Desktop-specific optimization
- `pagespeed-optimization.js` - PageSpeed optimization

## Content Processing

### Media Processing
- `convert-images-to-webp.js` - Convert images to WebP format

### Data Export
- `export-cookies.js` - Export cookies utility
- `generate-analysis-index.js` - Generate analysis index

## Usage

### Cache Management
```bash
# Quick cache deletion
bash scripts/utilities/quick-cache-delete.sh

# Delete specific cache types
node scripts/utilities/delete-cache.js
node scripts/utilities/delete-translation-cache.js
```

### Performance Optimization
```bash
# Analyze bundle
node scripts/utilities/analyze-bundle.js

# Optimize performance
node scripts/utilities/optimize-performance.js

# Remove unused dependencies
node scripts/utilities/remove-unused-deps.js
```

### Data Management
```bash
# Investigate Firestore data
node scripts/utilities/investigate-firestore-data.js

# Regenerate synchronized chords
npx ts-node scripts/utilities/regenerate-synchronized-chords.ts
```

### Content Processing
```bash
# Convert images to WebP
node scripts/utilities/convert-images-to-webp.js
```

## Categories

### 🗄️ **Cache Management**
Scripts for managing Firebase and application caches

### ⚡ **Performance Optimization**
Scripts for optimizing application performance

### 📊 **Data Management**
Scripts for managing and processing application data

### 🔧 **Content Processing**
Scripts for processing media and content files

### 📤 **Export Utilities**
Scripts for exporting data and configurations

## Notes

- Most utility scripts can be run independently
- Some scripts may require Firebase authentication
- Cache management scripts should be used carefully in production
- Performance optimization scripts may modify build configurations
- Always backup data before running data management scripts
