#!/bin/bash

# ChordMini Security Check Script
# Verifies no sensitive information will be committed

echo "🔒 ChordMini Security Check"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

echo "1. 🔍 Environment Files Check"
echo "============================="

# Check if sensitive env files are ignored
if git check-ignore .env.local >/dev/null 2>&1; then
    check_pass ".env.local is properly ignored"
else
    check_fail ".env.local is not ignored by git"
fi

if git check-ignore python_backend/.env >/dev/null 2>&1; then
    check_pass "python_backend/.env is properly ignored"
else
    check_fail "python_backend/.env is not ignored by git"
fi

# Check if .env.example exists and has no real secrets
if [ -f ".env.example" ]; then
    check_pass ".env.example exists"
    
    # Check for potential real API keys in .env.example
    if grep -E "AIza[0-9A-Za-z_-]{35}|sk-[0-9A-Za-z]{48}|ya29\.[0-9A-Za-z_-]+" .env.example >/dev/null; then
        check_fail ".env.example contains real API keys"
    else
        check_pass ".env.example contains only placeholder values"
    fi
else
    check_fail ".env.example is missing"
fi

echo ""
echo "2. 🔑 Hardcoded Secrets Check"
echo "============================="

# Check for hardcoded API keys in source code
HARDCODED_SECRETS=$(grep -r -i \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    -E "AIza[0-9A-Za-z_-]{35}|sk-[0-9A-Za-z]{48}|ya29\.[0-9A-Za-z_-]+" . || true)

if [ -z "$HARDCODED_SECRETS" ]; then
    check_pass "No hardcoded API keys found in source code"
else
    check_fail "Hardcoded API keys found in source code"
    echo "$HARDCODED_SECRETS"
fi

echo ""
echo "3. 📁 Sensitive Files in Git"
echo "============================"

# Check if any sensitive files are tracked by git
SENSITIVE_TRACKED=$(git ls-files | grep -E "\.(env|key|pem|p12|jks|keystore)$" || true)

if [ -z "$SENSITIVE_TRACKED" ]; then
    check_pass "No sensitive files tracked by git"
else
    check_fail "Sensitive files are tracked by git"
    echo "$SENSITIVE_TRACKED"
fi

echo ""
echo "4. 📋 Git Status Check"
echo "======================"

# Check what would be committed
STAGED_SENSITIVE=$(git diff --cached --name-only | grep -E "\.(env|key|pem|p12|jks|keystore)$" || true)

if [ -z "$STAGED_SENSITIVE" ]; then
    check_pass "No sensitive files staged for commit"
else
    check_fail "Sensitive files are staged for commit"
    echo "$STAGED_SENSITIVE"
fi

echo ""
echo "5. 🗂️ Documentation Files"
echo "========================="

# Check if .md files are properly excluded (except README.md and README-PYTHON-BACKEND.md)
echo "test" > test.md
if git check-ignore test.md >/dev/null 2>&1; then
    check_pass "Documentation files are properly excluded"
else
    check_fail "Documentation files exclusion not working"
fi
rm -f test.md

# Verify README files are not ignored
if git check-ignore README.md >/dev/null 2>&1; then
    check_fail "README.md is incorrectly ignored"
else
    check_pass "README.md is properly tracked"
fi

if git check-ignore README-PYTHON-BACKEND.md >/dev/null 2>&1; then
    check_fail "README-PYTHON-BACKEND.md is incorrectly ignored"
else
    check_pass "README-PYTHON-BACKEND.md is properly tracked"
fi

echo ""
echo "6. 🔧 Configuration Files"
echo "========================="

# Check if next.config.js exists and is properly configured
if [ -f "next.config.js" ]; then
    check_pass "next.config.js exists"
    
    # Check if there are any hardcoded secrets in config
    if grep -E "AIza[0-9A-Za-z_-]{35}|sk-[0-9A-Za-z]{48}" next.config.js >/dev/null; then
        check_fail "next.config.js contains hardcoded secrets"
    else
        check_pass "next.config.js has no hardcoded secrets"
    fi
else
    check_fail "next.config.js is missing"
fi

# Check if redundant next.config.ts was removed
if [ -f "next.config.ts" ]; then
    check_fail "Redundant next.config.ts still exists"
else
    check_pass "Redundant next.config.ts was removed"
fi

echo ""
echo "📊 Security Summary"
echo "==================="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Security check passed! Safe to commit and deploy.${NC}"
    exit 0
else
    echo -e "${RED}❌ Security issues found. Please fix before committing.${NC}"
    exit 1
fi
