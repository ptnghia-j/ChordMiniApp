#!/bin/bash

# ChordMini - First-Time Vercel Setup Script
# This script helps you set up Vercel project and get required IDs for GitHub Actions

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

echo "🚀 ChordMini - First-Time Vercel Setup"
echo "======================================"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    log_warning "Vercel CLI not found. Installing..."
    npm install -g vercel
    log_success "Vercel CLI installed"
else
    log_success "Vercel CLI found"
fi

echo ""
log_info "Step 1: Login to Vercel"
echo "----------------------"
vercel login

echo ""
log_info "Step 2: Create Vercel Project"
echo "----------------------------"
log_warning "When prompted:"
log_warning "- Link to existing project? → No"
log_warning "- Project name → chordmini (or your preferred name)"
log_warning "- Directory → Press Enter (current directory)"
log_warning "- Modify settings → No (we'll configure later)"
echo ""

# Create the project
vercel

echo ""
log_success "Project created and deployed!"

echo ""
log_info "Step 3: Getting Required IDs"
echo "---------------------------"

# Get Organization ID
echo "📋 Your Organization ID:"
ORG_ID=$(vercel teams list --json 2>/dev/null | jq -r '.[0].id' 2>/dev/null || echo "")
if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
    echo "   $ORG_ID"
else
    log_warning "Could not auto-detect Organization ID"
    echo "   Run: vercel teams list"
    echo "   Copy the ID from the output"
fi

echo ""

# Get Project ID
echo "📋 Your Project ID:"
if [ -f ".vercel/project.json" ]; then
    PROJECT_ID=$(cat .vercel/project.json | jq -r '.projectId')
    echo "   $PROJECT_ID"
else
    log_warning "Could not find project.json"
    echo "   Run: vercel projects list"
    echo "   Look for your project and copy the ID"
fi

echo ""
log_info "Step 4: Generate Vercel Token"
echo "----------------------------"
log_warning "Manual step required:"
echo "1. Go to: https://vercel.com/account/tokens"
echo "2. Click 'Create Token'"
echo "3. Name: 'GitHub Actions ChordMini'"
echo "4. Scope: 'Full Account'"
echo "5. Copy the token (you won't see it again!)"

echo ""
log_info "Step 5: Configure GitHub Secrets"
echo "-------------------------------"
log_warning "Go to your GitHub repository:"
echo "1. Settings → Secrets and variables → Actions"
echo "2. Click 'New repository secret'"
echo "3. Add these three secrets:"
echo ""
echo "   VERCEL_TOKEN = [your token from step 4]"
if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
    echo "   VERCEL_ORG_ID = $ORG_ID"
else
    echo "   VERCEL_ORG_ID = [your org ID from step 3]"
fi
if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
    echo "   VERCEL_PROJECT_ID = $PROJECT_ID"
else
    echo "   VERCEL_PROJECT_ID = [your project ID from step 3]"
fi

echo ""
log_info "Step 6: Configure Environment Variables"
echo "-------------------------------------"
log_warning "In Vercel Dashboard:"
echo "1. Go to your project → Settings → Environment Variables"
echo "2. Add all required variables from .env.example"
echo "3. Set environment to 'Production'"

echo ""
log_info "Step 7: Test GitHub Actions"
echo "--------------------------"
log_warning "After completing steps 4-6:"
echo "1. git add ."
echo "2. git commit -m 'feat: setup vercel deployment'"
echo "3. git push origin main"
echo "4. Check GitHub Actions tab for workflow status"

echo ""
log_success "Setup complete! Follow the manual steps above to finish configuration."

echo ""
log_info "📋 Summary of what you need:"
echo "- Vercel Token (from vercel.com/account/tokens)"
if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
    echo "- Organization ID: $ORG_ID"
else
    echo "- Organization ID (from: vercel teams list)"
fi
if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
    echo "- Project ID: $PROJECT_ID"
else
    echo "- Project ID (from: vercel projects list)"
fi
echo "- Environment variables configured in Vercel Dashboard"

echo ""
log_info "🔗 Useful links:"
echo "- Vercel Dashboard: https://vercel.com/dashboard"
echo "- Create Token: https://vercel.com/account/tokens"
echo "- GitHub Secrets: https://github.com/$(git config remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/settings/secrets/actions"
