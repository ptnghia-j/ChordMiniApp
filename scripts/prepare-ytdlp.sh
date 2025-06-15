#!/bin/bash

# Script to download and prepare yt-dlp binary for Vercel deployment
# This ensures yt-dlp is available in the serverless environment

set -e

echo "🔧 Preparing yt-dlp binary for Vercel deployment..."

# Create bin directory if it doesn't exist
mkdir -p bin

# Download yt-dlp binary
echo "📥 Downloading yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp

# Make it executable
echo "🔐 Setting executable permissions..."
chmod +x bin/yt-dlp

# Verify the binary works
echo "✅ Verifying yt-dlp binary..."
if ./bin/yt-dlp --version; then
    echo "✅ yt-dlp binary is ready for deployment!"
    echo "📦 Binary location: $(pwd)/bin/yt-dlp"
    echo "📏 Binary size: $(du -h bin/yt-dlp | cut -f1)"
else
    echo "❌ yt-dlp binary verification failed!"
    exit 1
fi

echo "🎉 yt-dlp preparation complete!"
