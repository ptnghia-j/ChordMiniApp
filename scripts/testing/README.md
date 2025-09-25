# Testing Scripts

This folder contains development and testing scripts for ChordMiniApp.

## downr.org Pipeline Testing

### Core Testing Scripts
- `test-downr-extensive-robustness.js` - **Main robustness testing suite** (moved to root for production use)
- `test-downr-integration.js` - Integration testing with ChordMiniApp services
- `test-downr-production-pipeline.js` - Production pipeline testing
- `test-downr-concurrent-stress.js` - Concurrent request stress testing

### Format and Compatibility Testing
- `test-downr-audio-format.js` - Audio format testing
- `test-downr-compatibility.js` - Service compatibility testing
- `test-downr-format-compatibility.js` - Format compatibility testing
- `test-opus-format.js` - Opus format specific testing

### Performance Testing
- `test-downr-vs-ytdlp-performance.js` - Performance comparison testing
- `test-downr-simple.js` - Simple downr.org testing
- `test-downr-pipeline-simple.js` - Simple pipeline testing
- `test-downr-realworld-music.js` - Real-world music testing

## API and Service Testing

### API Testing
- `test-api-config.js` - API configuration testing
- `test-api-endpoints.sh` - API endpoint testing
- `test-analyze-page.js` - Analysis page testing
- `test-audio-pipeline.js` - Audio pipeline testing

### Backend Testing
- `test-python-backend-direct.js` - Direct Python backend testing
- `test-rate-limiting.js` - Rate limiting testing
- `test-performance.js` - General performance testing

### Integration Testing
- `test-middleware-integration.js` - Middleware integration testing
- `test-ci-environment.sh` - CI environment testing

## Usage

### Running Individual Tests
```bash
# Run specific test
node scripts/testing/test-downr-integration.js

# Run shell script tests
bash scripts/testing/test-api-endpoints.sh
```

### Running Test Suites
```bash
# Run comprehensive robustness testing (from root)
node scripts/test-downr-extensive-robustness.js

# Run complete robustness suite (from root)
node scripts/run-complete-robustness-suite.js
```

## Test Categories

### 🔬 **Development Testing**
Scripts for active development and debugging

### 🧪 **Integration Testing** 
Scripts for testing service integration

### 📊 **Performance Testing**
Scripts for performance analysis and benchmarking

### 🔍 **Compatibility Testing**
Scripts for testing format and service compatibility

## Notes

- Most scripts require the Next.js development server to be running (`npm run dev`)
- Some scripts require the Python backend to be running (`scripts/start_python_backend.sh`)
- Test results are typically logged to console and/or saved to JSON files
- Scripts are organized by functionality and testing scope
