#!/bin/bash

# Fixed Appwrite YT-DLP Deployment Script
# This script uses the correct Appwrite CLI syntax

set -e

echo "🚀 Deploying Enhanced YT-DLP Function to Appwrite"
echo "================================================="

# Configuration
PROJECT_ID="68d48e41000a72457eb6"
FUNCTION_ID="68d49cd300092b56014f"
ENDPOINT="https://sfo.cloud.appwrite.io/v1"

# Check if we're in the right directory
if [ ! -f "yt-dlp-server/main.py" ]; then
    echo "❌ Error: yt-dlp-server/main.py not found"
    echo "Please run this script from the ChordMiniApp root directory"
    exit 1
fi

# Check if Appwrite CLI is installed
if ! command -v appwrite &> /dev/null; then
    echo "❌ Appwrite CLI is not installed"
    echo "Install it with: npm install -g appwrite-cli"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Step 1: Set the client configuration
echo "🔧 Setting Appwrite client configuration..."
appwrite client \
    --endpoint "$ENDPOINT" \
    --project-id "$PROJECT_ID"

if [ $? -ne 0 ]; then
    echo "❌ Failed to set client configuration"
    exit 1
fi

echo "✅ Client configuration set successfully"
echo ""

# Step 2: Check if logged in
echo "🔐 Checking authentication..."
if ! appwrite account get &> /dev/null; then
    echo "❌ Not logged in to Appwrite"
    echo "Please run: appwrite login"
    exit 1
fi

echo "✅ Authentication verified"
echo ""

# Step 3: Navigate to yt-dlp-server directory
echo "📁 Navigating to yt-dlp-server directory..."
cd yt-dlp-server

# Step 4: Create the deployment
echo "📦 Creating new deployment..."
echo "   Function ID: $FUNCTION_ID"
echo "   Code: . (current directory)"
echo "   Entrypoint: main.py"
echo "   Activate: true"
echo ""

appwrite functions create-deployment \
    --function-id "$FUNCTION_ID" \
    --code "." \
    --entrypoint "main.py" \
    --activate true

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment created successfully!"
    echo ""
    echo "🎉 Enhanced YT-DLP function deployed with:"
    echo "   ✅ Multiple extraction strategies (primary, mobile, web)"
    echo "   ✅ Enhanced browser headers and User-Agent"
    echo "   ✅ Automatic fallback between strategies"
    echo "   ✅ Better error handling for bot detection"
    echo ""
    echo "⏳ Waiting 10 seconds for deployment to propagate..."
    sleep 10
    
    echo "🧪 Running test suite to verify improvements..."
    cd ../scripts
    node test-appwrite-ytdlp.js
    
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Please check the error messages above and try again."
    echo ""
    echo "🔧 Troubleshooting tips:"
    echo "   1. Make sure you're logged in: appwrite login"
    echo "   2. Check your internet connection"
    echo "   3. Verify the function ID is correct"
    echo "   4. Try deploying via Appwrite Console as alternative"
    exit 1
fi

echo ""
echo "🔗 Useful Links:"
echo "   📊 Appwrite Console: https://cloud.appwrite.io/console/project-$PROJECT_ID"
echo "   📋 Function Dashboard: https://cloud.appwrite.io/console/project-$PROJECT_ID/functions/function-$FUNCTION_ID"
echo "   📈 Execution Logs: Monitor for strategy switching and success improvements"
echo ""
echo "🎯 Expected Results:"
echo "   📈 Success rate should improve from 33% to 70%+"
echo "   ✅ Previously failing video (SlPhMPnQ58k) should now work"
echo "   🔄 You should see strategy switching in the logs"
