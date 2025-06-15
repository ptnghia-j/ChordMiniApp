#!/bin/bash

# Test yt-dlp deployment script
# This script tests the yt-dlp functionality after deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if URL is provided
if [ -z "$1" ]; then
    log_error "Usage: $0 <deployment-url>"
    log_info "Example: $0 https://your-app.vercel.app"
    exit 1
fi

DEPLOYMENT_URL="$1"
log_info "Testing yt-dlp functionality on: $DEPLOYMENT_URL"

echo ""
echo "🔍 yt-dlp Deployment Test Suite"
echo "==============================="

# Test 1: Check if diagnostic endpoint is accessible
echo ""
log_info "Test 1: Diagnostic Endpoint Accessibility"
echo "----------------------------------------"

DIAGNOSTIC_URL="${DEPLOYMENT_URL}/api/debug-ytdlp"
log_info "Testing: $DIAGNOSTIC_URL"

if curl -s -f "$DIAGNOSTIC_URL" > /dev/null; then
    log_success "Diagnostic endpoint is accessible"
    
    # Get diagnostic results
    DIAGNOSTIC_RESULT=$(curl -s "$DIAGNOSTIC_URL")
    
    # Check if yt-dlp is available
    YTDLP_AVAILABLE=$(echo "$DIAGNOSTIC_RESULT" | jq -r '.tests.ytdlpAvailable.success // false')
    
    if [ "$YTDLP_AVAILABLE" = "true" ]; then
        log_success "yt-dlp is available in deployment"
        
        # Get version
        YTDLP_VERSION=$(echo "$DIAGNOSTIC_RESULT" | jq -r '.tests.versionCheck.version // "unknown"')
        log_info "yt-dlp version: $YTDLP_VERSION"
        
        # Get validated path
        YTDLP_PATH=$(echo "$DIAGNOSTIC_RESULT" | jq -r '.tests.validatedPath.path // "unknown"')
        log_info "yt-dlp path: $YTDLP_PATH"
    else
        log_error "yt-dlp is NOT available in deployment"
        echo "Diagnostic details:"
        echo "$DIAGNOSTIC_RESULT" | jq '.tests'
    fi
else
    log_error "Diagnostic endpoint is not accessible"
    echo "This might be due to authentication protection or deployment issues"
fi

# Test 2: YouTube Search Functionality
echo ""
log_info "Test 2: YouTube Search Functionality"
echo "-----------------------------------"

SEARCH_URL="${DEPLOYMENT_URL}/api/search-youtube"
log_info "Testing: $SEARCH_URL"

SEARCH_PAYLOAD='{"query": "test song"}'
SEARCH_RESPONSE=$(curl -s -X POST "$SEARCH_URL" \
    -H "Content-Type: application/json" \
    -d "$SEARCH_PAYLOAD" \
    -w "HTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$SEARCH_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$HTTP_STATUS" = "200" ]; then
    log_success "YouTube search endpoint responded successfully"
    
    # Check if results were returned
    RESULTS_COUNT=$(echo "$SEARCH_BODY" | jq '.results | length // 0')
    if [ "$RESULTS_COUNT" -gt 0 ]; then
        log_success "Found $RESULTS_COUNT search results"
    else
        log_warning "No search results returned"
        echo "Response: $SEARCH_BODY"
    fi
elif [ "$HTTP_STATUS" = "401" ]; then
    log_warning "Search endpoint requires authentication (HTTP 401)"
    log_info "This is expected for protected deployments"
else
    log_error "YouTube search failed (HTTP $HTTP_STATUS)"
    echo "Response: $SEARCH_BODY"
fi

# Test 3: Audio Extraction Functionality
echo ""
log_info "Test 3: Audio Extraction Functionality"
echo "-------------------------------------"

EXTRACT_URL="${DEPLOYMENT_URL}/api/extract-audio"
log_info "Testing: $EXTRACT_URL"

EXTRACT_PAYLOAD='{"videoId": "dQw4w9WgXcQ", "streamOnly": true}'
EXTRACT_RESPONSE=$(curl -s -X POST "$EXTRACT_URL" \
    -H "Content-Type: application/json" \
    -d "$EXTRACT_PAYLOAD" \
    -w "HTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$EXTRACT_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
EXTRACT_BODY=$(echo "$EXTRACT_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$HTTP_STATUS" = "200" ]; then
    log_success "Audio extraction endpoint responded successfully"
    
    # Check if audio URL was returned
    AUDIO_URL=$(echo "$EXTRACT_BODY" | jq -r '.audioUrl // ""')
    if [ -n "$AUDIO_URL" ] && [ "$AUDIO_URL" != "null" ]; then
        log_success "Audio URL extracted successfully"
        log_info "Audio URL: ${AUDIO_URL:0:100}..."
    else
        log_warning "No audio URL returned"
        echo "Response: $EXTRACT_BODY"
    fi
elif [ "$HTTP_STATUS" = "401" ]; then
    log_warning "Audio extraction endpoint requires authentication (HTTP 401)"
    log_info "This is expected for protected deployments"
else
    log_error "Audio extraction failed (HTTP $HTTP_STATUS)"
    echo "Response: $EXTRACT_BODY"
fi

# Summary
echo ""
echo "📊 Test Summary"
echo "==============="

if [ "$YTDLP_AVAILABLE" = "true" ]; then
    log_success "✅ yt-dlp is available in the deployment"
else
    log_error "❌ yt-dlp is NOT available in the deployment"
fi

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then
    log_success "✅ API endpoints are accessible"
else
    log_error "❌ API endpoints have issues"
fi

echo ""
log_info "🔧 Next Steps:"
if [ "$YTDLP_AVAILABLE" != "true" ]; then
    echo "1. Check Vercel build logs for yt-dlp download issues"
    echo "2. Verify the buildCommand in vercel.json is working"
    echo "3. Check if yt-dlp binary is included in the deployment"
fi

if [ "$HTTP_STATUS" = "401" ]; then
    echo "1. Remove authentication protection from the deployment"
    echo "2. Or test with proper authentication credentials"
fi

echo "3. Monitor Vercel function logs for runtime errors"
echo "4. Test with different video IDs if extraction fails"

echo ""
log_info "For detailed diagnostics, visit: ${DEPLOYMENT_URL}/api/debug-ytdlp"
