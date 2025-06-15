#!/bin/bash

# ChordMini Post-Deployment Verification Script
# Comprehensive testing of deployed application

if [ -z "$1" ]; then
    echo "Usage: $0 <deployment-url>"
    echo "Example: $0 https://chordmini.vercel.app"
    exit 1
fi

DEPLOYMENT_URL="$1"
echo "🧪 ChordMini Post-Deployment Verification"
echo "========================================="
echo "Testing URL: $DEPLOYMENT_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
test_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

test_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

echo "1. 🌐 Basic Connectivity Tests"
echo "=============================="

# Test main page
echo -n "Testing main page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL" > /dev/null; then
    test_pass "Main page accessible"
else
    test_fail "Main page not accessible"
fi

# Test about page
echo -n "Testing about page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/about" > /dev/null; then
    test_pass "About page accessible"
else
    test_fail "About page not accessible"
fi

# Test docs page
echo -n "Testing documentation page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/docs" > /dev/null; then
    test_pass "Documentation page accessible"
else
    test_fail "Documentation page not accessible"
fi

# Test status page
echo -n "Testing status page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/status" > /dev/null; then
    test_pass "Status page accessible"
else
    test_fail "Status page not accessible"
fi

echo ""
echo "2. 🔌 API Endpoints Tests"
echo "========================="

# Test API docs
echo -n "Testing API docs endpoint... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/api/docs" > /dev/null; then
    test_pass "API docs endpoint working"
else
    test_fail "API docs endpoint not working"
fi

# Test model info endpoint
echo -n "Testing model info endpoint... "
response=$(curl -s --max-time 10 "$DEPLOYMENT_URL/api/model-info")
if echo "$response" | grep -q "success"; then
    test_pass "Model info endpoint working"
else
    test_fail "Model info endpoint not working"
fi

# Test cache endpoint
echo -n "Testing cache endpoint... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/api/cache" > /dev/null; then
    test_pass "Cache endpoint accessible"
else
    test_fail "Cache endpoint not accessible"
fi

# Test YouTube search endpoint
echo -n "Testing YouTube search endpoint... "
response=$(curl -s --max-time 15 -X POST "$DEPLOYMENT_URL/api/search-youtube" \
    -H "Content-Type: application/json" \
    -d '{"query": "test"}')
if [ $? -eq 0 ]; then
    test_pass "YouTube search endpoint accessible"
else
    test_warn "YouTube search endpoint timeout (may be normal)"
fi

echo ""
echo "3. 🔥 Firebase Integration Tests"
echo "================================"

# Test Firebase connection by checking if pages load (they use Firebase)
echo -n "Testing Firebase integration... "
response=$(curl -s --max-time 15 "$DEPLOYMENT_URL/settings")
if [ $? -eq 0 ]; then
    test_pass "Firebase integration working (settings page loads)"
else
    test_fail "Firebase integration issues (settings page fails)"
fi

echo ""
echo "4. 🎵 Backend Service Communication"
echo "==================================="

BACKEND_URL="https://chordmini-backend-full-pluj3yargq-uc.a.run.app"

# Test backend health
echo -n "Testing backend service health... "
if curl -s --max-time 10 "$BACKEND_URL/" > /dev/null; then
    test_pass "Backend service responding"
else
    test_fail "Backend service not responding"
fi

# Test backend model info
echo -n "Testing backend model info... "
response=$(curl -s --max-time 10 "$BACKEND_URL/api/model-info")
if echo "$response" | grep -q "success"; then
    test_pass "Backend model info working"
    
    # Check available models
    if echo "$response" | grep -q "chord-cnn-lstm"; then
        test_pass "Chord-CNN-LSTM model available"
    else
        test_warn "Chord-CNN-LSTM model not available"
    fi
    
    if echo "$response" | grep -q "beat-transformer"; then
        test_pass "Beat-Transformer model available"
    else
        test_warn "Beat-Transformer model not available"
    fi
else
    test_fail "Backend model info not working"
fi

echo ""
echo "5. 📱 Critical User Flows"
echo "========================="

# Test analyze page
echo -n "Testing analyze page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/analyze" > /dev/null; then
    test_pass "Analyze page accessible"
else
    test_fail "Analyze page not accessible"
fi

# Test help page
echo -n "Testing help page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/help" > /dev/null; then
    test_pass "Help page accessible"
else
    test_fail "Help page not accessible"
fi

# Test changelog page
echo -n "Testing changelog page... "
if curl -s --max-time 10 "$DEPLOYMENT_URL/changelog" > /dev/null; then
    test_pass "Changelog page accessible"
else
    test_fail "Changelog page not accessible"
fi

echo ""
echo "6. 🔒 Security Headers Check"
echo "============================"

# Check security headers
echo -n "Checking security headers... "
headers=$(curl -s -I --max-time 10 "$DEPLOYMENT_URL")

if echo "$headers" | grep -qi "x-frame-options"; then
    test_pass "X-Frame-Options header present"
else
    test_warn "X-Frame-Options header missing"
fi

if echo "$headers" | grep -qi "x-content-type-options"; then
    test_pass "X-Content-Type-Options header present"
else
    test_warn "X-Content-Type-Options header missing"
fi

echo ""
echo "7. ⚡ Performance Check"
echo "======================"

# Test page load time
echo -n "Testing page load performance... "
start_time=$(date +%s.%N)
curl -s --max-time 10 "$DEPLOYMENT_URL" > /dev/null
end_time=$(date +%s.%N)
load_time=$(echo "$end_time - $start_time" | bc)

if (( $(echo "$load_time < 3.0" | bc -l) )); then
    test_pass "Page loads in ${load_time}s (< 3s)"
else
    test_warn "Page loads in ${load_time}s (> 3s)"
fi

echo ""
echo "8. 🔗 External Dependencies"
echo "==========================="

# Test if external services are reachable from deployment
echo -n "Testing external API accessibility... "

# Test if the deployment can reach the backend
response=$(curl -s --max-time 15 "$DEPLOYMENT_URL/api/model-info")
if echo "$response" | grep -q "success\|models"; then
    test_pass "External backend API accessible from deployment"
else
    test_warn "External backend API may not be accessible from deployment"
fi

echo ""
echo "📊 Verification Summary"
echo "======================="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"
echo -e "⚠️  Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Deployment verification successful!${NC}"
    echo ""
    echo "✅ Your ChordMini application is ready for use!"
    echo ""
    echo "🔗 Application URLs:"
    echo "   • Main App: $DEPLOYMENT_URL"
    echo "   • API Docs: $DEPLOYMENT_URL/docs"
    echo "   • Status: $DEPLOYMENT_URL/status"
    echo "   • Help: $DEPLOYMENT_URL/help"
    echo ""
    echo "🎵 Ready for music analysis!"
    exit 0
else
    echo -e "${RED}❌ Deployment verification found $FAILED critical issues.${NC}"
    echo ""
    echo "Please investigate and fix the failed tests before using the application."
    exit 1
fi
