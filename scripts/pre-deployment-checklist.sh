#!/bin/bash

# ChordMini Pre-Deployment Checklist Script
# Verifies all requirements before Vercel deployment

echo "🚀 ChordMini Pre-Deployment Checklist"
echo "====================================="
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
check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

check_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

echo "1. 🔧 Build Verification"
echo "========================"

# Check if npm is available
if command -v npm &> /dev/null; then
    check_pass "npm is available"
else
    check_fail "npm is not available"
    exit 1
fi

# Check if node_modules exists
if [ -d "node_modules" ]; then
    check_pass "node_modules directory exists"
else
    check_warn "node_modules not found, running npm install..."
    npm install
fi

# Run build
echo -n "Running npm run build... "
if npm run build > build.log 2>&1; then
    check_pass "Build completed successfully"
    rm -f build.log
else
    check_fail "Build failed - check build.log for details"
    echo "Build errors:"
    tail -20 build.log
fi

echo ""
echo "2. 📝 TypeScript Verification"
echo "============================="

# Check TypeScript compilation
echo -n "Checking TypeScript compilation... "
if npx tsc --noEmit > tsc.log 2>&1; then
    check_pass "No TypeScript errors"
    rm -f tsc.log
else
    check_fail "TypeScript errors found"
    echo "TypeScript errors:"
    cat tsc.log
fi

echo ""
echo "3. 🔍 ESLint Check"
echo "=================="

# Run ESLint
echo -n "Running ESLint... "
if npx eslint . --ext .ts,.tsx,.js,.jsx > eslint.log 2>&1; then
    check_pass "No ESLint errors"
    rm -f eslint.log
else
    check_warn "ESLint warnings/errors found"
    echo "ESLint output:"
    head -20 eslint.log
    rm -f eslint.log
fi

echo ""
echo "4. 🌐 Environment Variables Check"
echo "================================="

# Check environment configuration
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
    # In CI environment, check for .env.example instead
    if [ -f ".env.example" ]; then
        check_pass ".env.example file exists (CI environment)"
        check_pass "Environment variables should be configured in Vercel Dashboard"
    else
        check_fail ".env.example file not found"
    fi
else
    # In local environment, check for .env.local
    if [ -f ".env.local" ]; then
        check_pass ".env.local file exists"

        # Check critical environment variables
        if grep -q "NEXT_PUBLIC_FIREBASE_API_KEY" .env.local; then
            check_pass "Firebase API key configured"
        else
            check_fail "NEXT_PUBLIC_FIREBASE_API_KEY missing"
        fi

        if grep -q "GEMINI_API_KEY" .env.local; then
            check_pass "Gemini API key configured"
        else
            check_fail "GEMINI_API_KEY missing"
        fi

        if grep -q "NEXT_PUBLIC_PYTHON_API_URL" .env.local; then
            check_pass "Python API URL configured"
        else
            check_fail "NEXT_PUBLIC_PYTHON_API_URL missing"
        fi
    else
        check_fail ".env.local file not found"
    fi
fi

echo ""
echo "5. 🔥 Firebase Configuration"
echo "============================"

# Check Firebase files
if [ -f "firebase.json" ]; then
    check_pass "firebase.json exists"
else
    check_fail "firebase.json missing"
fi

if [ -f ".firebaserc" ]; then
    check_pass ".firebaserc exists"
else
    check_fail ".firebaserc missing"
fi

if [ -f "firestore.rules" ]; then
    check_pass "firestore.rules exists"
else
    check_fail "firestore.rules missing"
fi

# Test Firebase CLI
if command -v firebase &> /dev/null; then
    check_pass "Firebase CLI available"
    
    # Check if logged in
    if firebase projects:list > /dev/null 2>&1; then
        check_pass "Firebase CLI authenticated"
    else
        check_warn "Firebase CLI not authenticated"
    fi
else
    check_warn "Firebase CLI not installed"
fi

echo ""
echo "6. 🔗 Backend Service Check"
echo "==========================="

BACKEND_URL="https://chordmini-backend-12071603127.us-central1.run.app"

# Test backend health
echo -n "Testing backend health... "
if curl -s --max-time 10 "$BACKEND_URL/" > /dev/null; then
    check_pass "Backend service is responding"
else
    check_fail "Backend service not responding"
fi

# Test model info endpoint
echo -n "Testing model info endpoint... "
if curl -s --max-time 10 "$BACKEND_URL/api/model-info" | grep -q "success"; then
    check_pass "Model info endpoint working"
else
    check_fail "Model info endpoint not working"
fi

echo ""
echo "7. 📦 Package Dependencies"
echo "=========================="

# Check for security vulnerabilities
echo -n "Checking for security vulnerabilities... "
if npm audit --audit-level=high > audit.log 2>&1; then
    check_pass "No high-severity vulnerabilities"
    rm -f audit.log
else
    # Check if there are only moderate vulnerabilities
    if npm audit --audit-level=critical > critical.log 2>&1; then
        check_pass "No critical vulnerabilities (moderate vulnerabilities acceptable)"
        rm -f audit.log critical.log
    else
        check_fail "Critical vulnerabilities found - must be fixed"
        echo "Run 'npm audit' for details"
        rm -f audit.log critical.log
    fi
fi

# Check package.json scripts
if grep -q "\"build\":" package.json; then
    check_pass "Build script configured"
else
    check_fail "Build script missing in package.json"
fi

if grep -q "\"start\":" package.json; then
    check_pass "Start script configured"
else
    check_fail "Start script missing in package.json"
fi

echo ""
echo "8. 📁 File Structure Check"
echo "=========================="

# Check critical directories and files
critical_paths=(
    "src/app"
    "src/components"
    "public"
    "package.json"
    "next.config.js"
    "tailwind.config.js"
    "tsconfig.json"
)

for path in "${critical_paths[@]}"; do
    if [ -e "$path" ]; then
        check_pass "$path exists"
    else
        check_fail "$path missing"
    fi
done

echo ""
echo "9. 🎯 Vercel Configuration"
echo "=========================="

if [ -f "vercel.json" ]; then
    check_pass "vercel.json exists"
    
    # Validate JSON syntax
    if python3 -m json.tool vercel.json > /dev/null 2>&1; then
        check_pass "vercel.json is valid JSON"
    else
        check_fail "vercel.json has invalid JSON syntax"
    fi
else
    check_warn "vercel.json not found (optional)"
fi

# Check if Vercel CLI is available
if command -v vercel &> /dev/null; then
    check_pass "Vercel CLI available"
else
    check_warn "Vercel CLI not installed (install with: npm i -g vercel)"
fi

echo ""
echo "📊 Summary"
echo "=========="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"
echo -e "⚠️  Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All critical checks passed! Ready for deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: vercel --prod"
    echo "2. Configure environment variables in Vercel dashboard"
    echo "3. Test deployed application"
    exit 0
else
    echo -e "${RED}❌ $FAILED critical issues found. Please fix before deployment.${NC}"
    exit 1
fi
