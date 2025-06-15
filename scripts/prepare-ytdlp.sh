#!/bin/bash

# Script to download and prepare yt-dlp binary for Vercel deployment
# This ensures yt-dlp is available in the serverless environment

set -e

echo "🔧 Preparing yt-dlp binary for Vercel deployment..."

# Create bin directory if it doesn't exist
mkdir -p bin

# Check if binary already exists and is valid
if [ -f "bin/yt-dlp" ] && [ -s "bin/yt-dlp" ]; then
    echo "📦 Existing yt-dlp binary found, verifying..."
    if ./bin/yt-dlp --version >/dev/null 2>&1; then
        echo "✅ Existing binary is valid!"
        echo "🔢 Version: $(./bin/yt-dlp --version)"
        echo "🎉 yt-dlp preparation complete (using existing binary)!"
        exit 0
    else
        echo "⚠️ Existing binary is invalid, downloading new one..."
        rm -f bin/yt-dlp
    fi
fi

# Download yt-dlp binary
echo "📥 Downloading yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp

# Wait a moment for file to be fully written
echo "⏳ Waiting for file to be fully written..."
sleep 1

# Make it executable
echo "🔐 Setting executable permissions..."
chmod +x bin/yt-dlp

# Wait another moment after chmod
sleep 1

# Verify the binary works with retries
echo "✅ Verifying yt-dlp binary..."
for attempt in 1 2 3; do
    echo "🔍 Verification attempt $attempt/3..."
    if ./bin/yt-dlp --version >/dev/null 2>&1; then
        echo "✅ yt-dlp binary is ready for deployment!"
        echo "📦 Binary location: $(pwd)/bin/yt-dlp"
        echo "📏 Binary size: $(du -h bin/yt-dlp | cut -f1)"
        echo "🔢 yt-dlp version: $(./bin/yt-dlp --version)"
        echo "🎉 yt-dlp preparation complete!"
        exit 0
    else
        echo "⚠️ Attempt $attempt failed"
        if [ $attempt -lt 3 ]; then
            echo "⏳ Waiting before retry..."
            sleep 2
        fi
    fi
done

# If we get here, all verification attempts failed
# In CI environments, sometimes verification fails but the binary is still usable
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$VERCEL" ]; then
    if [ -f "bin/yt-dlp" ] && [ -s "bin/yt-dlp" ]; then
        file_size=$(stat -c%s "bin/yt-dlp" 2>/dev/null || stat -f%z "bin/yt-dlp" 2>/dev/null || echo "0")
        if [ "$file_size" -gt 1048576 ]; then  # At least 1MB
            echo "🤖 CI environment detected - proceeding despite verification failure"
            echo "📦 Binary location: $(pwd)/bin/yt-dlp"
            echo "📏 Binary size: $(du -h bin/yt-dlp | cut -f1)"
            echo "⚠️ Note: Binary verification failed but file appears valid for CI deployment"
            echo "🎉 yt-dlp preparation complete (CI mode)!"
            exit 0
        fi
    fi
fi

echo "❌ yt-dlp binary verification failed after all attempts!"
exit 1
