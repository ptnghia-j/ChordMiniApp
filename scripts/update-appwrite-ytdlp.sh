#!/bin/bash

# Update Appwrite YT-DLP Function with Bot Detection Bypass
# This script updates the existing Appwrite function with enhanced bot detection bypass

set -e

echo "🔄 Updating Appwrite YT-DLP Function with Bot Detection Bypass"
echo "=============================================================="

# Configuration
PROJECT_ID="68d48e41000a72457eb6"
FUNCTION_ID="68d49cd300092b56014f"
FUNCTION_NAME="YouTube Audio Extractor (Enhanced)"

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

# Check if logged in
if ! appwrite account get &> /dev/null; then
    echo "❌ Not logged in to Appwrite"
    echo "Please run: appwrite login"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Set the correct project
echo "🔧 Setting Appwrite project..."
appwrite client --endpoint https://sfo.cloud.appwrite.io/v1 --project-id $PROJECT_ID

# Navigate to yt-dlp-server directory
cd yt-dlp-server

echo "📦 Updating function deployment..."

# Update the function with new code
appwrite functions updateDeployment \
    --function-id="$FUNCTION_ID" \
    --code="." \
    --activate=true

if [ $? -eq 0 ]; then
    echo "✅ Function updated successfully!"
    echo ""
    echo "📊 Function Details:"
    echo "   🆔 Function ID: $FUNCTION_ID"
    echo "   📍 Endpoint: https://sfo.cloud.appwrite.io/v1"
    echo "   🎯 Project: $PROJECT_ID"
    echo ""
    echo "🔧 Enhancements Added:"
    echo "   ✅ Enhanced browser headers to mimic real browsers"
    echo "   ✅ Multiple extraction strategies (primary, mobile, web fallback)"
    echo "   ✅ Improved YouTube client selection"
    echo "   ✅ Better error handling for bot detection"
    echo "   ✅ Automatic fallback between strategies"
    echo ""
    echo "🧪 Testing the updated function..."
    
    # Go back to scripts directory and run test
    cd ../scripts
    
    echo "⏳ Waiting 10 seconds for deployment to propagate..."
    sleep 10
    
    echo "🚀 Running test suite..."
    node test-appwrite-ytdlp.js
    
else
    echo "❌ Function update failed"
    echo "Please check the Appwrite console for details"
    exit 1
fi

echo ""
echo "🎉 Update completed!"
echo ""
echo "🔗 Useful Links:"
echo "   📊 Appwrite Console: https://cloud.appwrite.io/console/project-$PROJECT_ID"
echo "   📋 Function Logs: https://cloud.appwrite.io/console/project-$PROJECT_ID/functions/function-$FUNCTION_ID"
echo "   📖 Function Executions: https://cloud.appwrite.io/console/project-$PROJECT_ID/functions/function-$FUNCTION_ID/executions"
echo ""
echo "💡 If bot detection issues persist:"
echo "   1. Check function logs for specific error patterns"
echo "   2. Consider implementing cookie-based authentication"
echo "   3. Monitor YouTube's bot detection patterns"
echo "   4. Use rate limiting to avoid triggering detection"
