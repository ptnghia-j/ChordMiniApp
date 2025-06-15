#!/bin/bash

# ChordMini Vercel Deployment Script
# Automates the deployment process to Vercel

echo "🚀 ChordMini Vercel Deployment"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS${NC}: $1"
}

log_error() {
    echo -e "${RED}❌ ERROR${NC}: $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING${NC}: $1"
}

# Check if pre-deployment checklist passed
echo "1. 🔍 Running Pre-deployment Checklist"
echo "======================================"

if ./scripts/pre-deployment-checklist.sh; then
    log_success "Pre-deployment checklist passed"
else
    log_error "Pre-deployment checklist failed. Please fix issues before deploying."
    exit 1
fi

echo ""
echo "2. 🔐 Vercel Authentication"
echo "=========================="

# Check if already logged in
if vercel whoami > /dev/null 2>&1; then
    VERCEL_USER=$(vercel whoami)
    log_success "Already logged in as: $VERCEL_USER"
else
    log_info "Logging into Vercel..."
    if vercel login; then
        log_success "Successfully logged into Vercel"
    else
        log_error "Failed to login to Vercel"
        exit 1
    fi
fi

echo ""
echo "3. 📋 Environment Variables Setup"
echo "================================="

log_info "Environment variables need to be configured in Vercel Dashboard"
echo ""
echo "Required Environment Variables:"
echo "==============================="
echo ""

# Read from .env.local and display required variables
if [ -f ".env.local" ]; then
    echo "🔥 Firebase Configuration (Client-side):"
    grep "NEXT_PUBLIC_FIREBASE_" .env.local | sed 's/=.*/=***HIDDEN***/'
    echo ""
    
    echo "🤖 API Keys (Server-side):"
    echo "GEMINI_API_KEY=***HIDDEN***"
    echo "GENIUS_API_KEY=***HIDDEN***"
    echo "MUSIC_AI_API_KEY=***HIDDEN***"
    echo ""
    
    echo "🌐 Service URLs (Client-side):"
    grep "NEXT_PUBLIC_PYTHON_API_URL" .env.local
    grep "NEXT_PUBLIC_YOUTUBE_API_KEY" .env.local | sed 's/=.*/=***HIDDEN***/'
    echo "NEXT_PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app"
    echo ""
    
    echo "⚙️  Optional Configuration:"
    echo "USE_MOCK_MUSIC_AI=false"
    echo "NEXT_DISABLE_DEV_OVERLAY=true"
    echo "BACKEND_URL=https://chordmini-backend-full-pluj3yargq-uc.a.run.app"
else
    log_error ".env.local file not found"
    exit 1
fi

echo ""
read -p "Have you configured all environment variables in Vercel Dashboard? (y/N): " confirm_env
if [[ ! $confirm_env =~ ^[Yy]$ ]]; then
    log_warning "Please configure environment variables in Vercel Dashboard first:"
    echo "1. Go to https://vercel.com/dashboard"
    echo "2. Select your project"
    echo "3. Go to Settings > Environment Variables"
    echo "4. Add all the variables listed above"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo ""
echo "4. 🚀 Deploying to Vercel"
echo "========================="

log_info "Starting deployment to production..."

# Deploy to production
if vercel --prod --yes; then
    log_success "Deployment completed successfully!"
    
    # Get deployment URL
    DEPLOYMENT_URL=$(vercel ls --scope=$(vercel whoami) | grep "chordmini" | head -1 | awk '{print $2}')
    if [ -n "$DEPLOYMENT_URL" ]; then
        log_success "Deployment URL: https://$DEPLOYMENT_URL"
    fi
else
    log_error "Deployment failed"
    exit 1
fi

echo ""
echo "5. 🧪 Post-deployment Verification"
echo "=================================="

# Wait a moment for deployment to be ready
log_info "Waiting for deployment to be ready..."
sleep 10

# Get the deployment URL for testing
if [ -n "$DEPLOYMENT_URL" ]; then
    FULL_URL="https://$DEPLOYMENT_URL"
    
    log_info "Testing deployed application..."
    
    # Test health endpoint
    if curl -s --max-time 10 "$FULL_URL" > /dev/null; then
        log_success "Main page is accessible"
    else
        log_warning "Main page not responding (may need more time)"
    fi
    
    # Test API endpoint
    if curl -s --max-time 10 "$FULL_URL/api/docs" > /dev/null; then
        log_success "API documentation is accessible"
    else
        log_warning "API documentation not responding"
    fi
    
    echo ""
    log_success "Deployment verification completed"
    echo ""
    echo "🎉 Deployment Summary"
    echo "===================="
    echo "✅ Application deployed successfully"
    echo "🌐 URL: $FULL_URL"
    echo "📚 API Docs: $FULL_URL/docs"
    echo "⚙️  Status: $FULL_URL/status"
    echo ""
    echo "Next Steps:"
    echo "1. Test all critical user flows"
    echo "2. Verify Firebase integration"
    echo "3. Check backend service communication"
    echo "4. Update documentation with new URL"
    
else
    log_warning "Could not determine deployment URL"
    echo ""
    echo "Please check your Vercel dashboard for the deployment URL:"
    echo "https://vercel.com/dashboard"
fi

echo ""
echo "6. 📝 Documentation Updates"
echo "==========================="

log_info "Remember to update the following files with your new deployment URL:"
echo "- README.md"
echo "- VERCEL_DEPLOYMENT_GUIDE.md"
echo "- API documentation"
echo "- Any hardcoded URLs in the codebase"

echo ""
log_success "Deployment process completed!"
echo ""
echo "🔗 Useful Links:"
echo "- Vercel Dashboard: https://vercel.com/dashboard"
echo "- Firebase Console: https://console.firebase.google.com/project/chordmini-d29f9"
echo "- Backend Service: https://chordmini-backend-full-pluj3yargq-uc.a.run.app"
echo "- GitHub Repository: https://github.com/ptnghia-j/ChordMiniApp"
