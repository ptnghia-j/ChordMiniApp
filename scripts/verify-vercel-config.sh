#!/bin/bash

# Vercel Configuration Verification Script
# This script helps verify that your Vercel project configuration is correct

echo "🔍 Vercel Configuration Verification"
echo "===================================="

# Check if we're in the right directory
if [ ! -f ".vercel/project.json" ]; then
    echo "❌ Error: .vercel/project.json not found. Run this from the project root."
    exit 1
fi

# Read local configuration
echo "📁 Local Configuration (.vercel/project.json):"
LOCAL_PROJECT_ID=$(cat .vercel/project.json | grep -o '"projectId":"[^"]*"' | cut -d'"' -f4)
LOCAL_ORG_ID=$(cat .vercel/project.json | grep -o '"orgId":"[^"]*"' | cut -d'"' -f4)

echo "   Project ID: $LOCAL_PROJECT_ID"
echo "   Org ID: $LOCAL_ORG_ID"
echo ""

# Check Vercel CLI connection
echo "🌐 Vercel CLI Status:"
if command -v vercel &> /dev/null; then
    echo "   ✅ Vercel CLI installed"
    
    # Check if logged in
    if vercel whoami &> /dev/null; then
        CURRENT_USER=$(vercel whoami 2>/dev/null)
        echo "   ✅ Logged in as: $CURRENT_USER"
        
        # Check project access
        if vercel project inspect chord-mini-app &> /dev/null; then
            echo "   ✅ Can access project: chord-mini-app"
        else
            echo "   ❌ Cannot access project: chord-mini-app"
        fi
    else
        echo "   ❌ Not logged in to Vercel CLI"
        echo "   Run: vercel login"
    fi
else
    echo "   ❌ Vercel CLI not installed"
    echo "   Run: npm install -g vercel"
fi

echo ""
echo "📋 GitHub Actions Configuration Required:"
echo "   Go to: https://github.com/ptnghia-j/ChordMiniApp/settings/secrets/actions"
echo "   Set these secrets:"
echo "   VERCEL_PROJECT_ID = $LOCAL_PROJECT_ID"
echo "   VERCEL_ORG_ID = $LOCAL_ORG_ID"
echo "   VERCEL_TOKEN = [Your Vercel API Token from https://vercel.com/account/tokens]"

echo ""
echo "🧪 Test Commands:"
echo "   Test local pull: vercel pull --yes --environment=production"
echo "   Test build: vercel build --prod"
echo "   Test deploy: vercel deploy --prebuilt --prod"

echo ""
echo "✅ Configuration verification complete!"
