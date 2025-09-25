# Scripts Directory Overview

This directory contains production-ready scripts and organized development utilities for ChordMiniApp.

## 📁 Directory Structure

```
scripts/
├── SCRIPTS_OVERVIEW.md                 # This file
├── README.md                           # Cache management documentation
├── cache-management-guide.md           # Cache management guide
├── testing/                            # Development and testing scripts
├── utilities/                          # Utility and maintenance scripts
└── [production scripts]                # Production-ready scripts in root
```

## 🚀 Production Scripts (Root Level)

### Core Testing Suite
- `test-downr-extensive-robustness.js` - **Main robustness testing suite** (100% success rate)
- `run-complete-robustness-suite.js` - Complete robustness testing orchestrator

### Deployment and CI/CD
- `build-and-push.sh` - Build and push Docker images
- `setup-ci-cd.sh` - Set up CI/CD pipeline
- `setup-vercel-first-time.sh` - First-time Vercel setup
- `post-deployment-verification.sh` - Post-deployment verification checks
- `pre-deployment-checklist.sh` - Pre-deployment checklist and validation

### Infrastructure Validation
- `validate-docker-setup.sh` - Validate Docker configuration
- `verify-vercel-config.sh` - Verify Vercel configuration
- `security-check.sh` - Security vulnerability checks

### Backend Management
- `start-local-backend.sh` - Start local Python backend for development
- `start_python_backend.sh` - Alternative Python backend startup script

## 📂 Organized Subdirectories

### `testing/` - Development Testing Scripts
Contains all development and testing scripts organized by functionality:
- downr.org pipeline testing
- API and service testing  
- Performance and compatibility testing
- Integration testing

See [`testing/README.md`](testing/README.md) for detailed documentation.

### `utilities/` - Maintenance and Utility Scripts
Contains utility scripts for maintenance and optimization:
- Cache management utilities
- Performance optimization tools
- Data management scripts
- Content processing utilities

See [`utilities/README.md`](utilities/README.md) for detailed documentation.

## 🎯 Migration from Appwrite to downr.org

### ✅ **Completed Migration**
- **Removed**: All Appwrite-related scripts and dependencies
- **Implemented**: Complete downr.org pipeline integration
- **Organized**: Scripts into logical categories for better maintenance
- **Retained**: Only production-relevant and current testing scripts

### 🧪 **Testing Infrastructure**
- **Main Suite**: `test-downr-extensive-robustness.js` (100% success rate)
- **Integration**: Full API endpoint testing
- **Performance**: Comprehensive performance validation
- **Compatibility**: Format and service compatibility testing

## 🚀 Quick Start

### Production Testing
```bash
# Run main robustness testing suite
node scripts/test-downr-extensive-robustness.js

# Run complete robustness suite
node scripts/run-complete-robustness-suite.js
```

### Development Testing
```bash
# Run integration tests
node scripts/testing/test-downr-integration.js

# Run performance tests
node scripts/testing/test-performance.js
```

### Deployment
```bash
# Pre-deployment checks
bash scripts/pre-deployment-checklist.sh

# Build and push
bash scripts/build-and-push.sh

# Post-deployment verification
bash scripts/post-deployment-verification.sh
```

### Utilities
```bash
# Cache management
bash scripts/utilities/quick-cache-delete.sh

# Performance optimization
node scripts/utilities/optimize-performance.js
```

## 📋 Script Categories

### 🏭 **Production-Ready** (Root Level)
Scripts that are essential for production deployment and monitoring

### 🧪 **Development Testing** (testing/)
Scripts for active development, debugging, and testing

### 🔧 **Utilities** (utilities/)
Scripts for maintenance, optimization, and administrative tasks

## 🔧 Dependencies

- **Node.js** and npm
- **Docker** (for deployment scripts)
- **Python 3.x** (for backend scripts)
- **Firebase** authentication (for cache management)

## 📝 Notes

- Run scripts from project root unless specified otherwise
- Some scripts require development server (`npm run dev`)
- Cache management scripts should be used carefully in production
- All Appwrite-related scripts have been removed after migration to downr.org
