#!/bin/bash

# ChordMiniApp CI/CD Setup Script
# This script helps configure GitHub repository secrets and variables for the CI/CD pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

# Check if GitHub CLI is installed
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI (gh) is not installed."
        print_status "Please install it from: https://cli.github.com/"
        exit 1
    fi
    
    # Check if user is authenticated
    if ! gh auth status &> /dev/null; then
        print_error "You are not authenticated with GitHub CLI."
        print_status "Please run: gh auth login"
        exit 1
    fi
    
    print_status "GitHub CLI is installed and authenticated."
}

# Get repository information
get_repo_info() {
    REPO_OWNER=$(gh repo view --json owner --jq '.owner.login')
    REPO_NAME=$(gh repo view --json name --jq '.name')
    REPO_FULL_NAME="$REPO_OWNER/$REPO_NAME"
    
    print_status "Repository: $REPO_FULL_NAME"
}

# Setup Vercel secrets
setup_vercel_secrets() {
    print_header "Setting up Vercel secrets"
    
    echo "Please provide your Vercel configuration:"
    
    read -p "Vercel Token: " -s VERCEL_TOKEN
    echo
    read -p "Vercel Organization ID: " VERCEL_ORG_ID
    read -p "Vercel Project ID: " VERCEL_PROJECT_ID
    
    if [[ -n "$VERCEL_TOKEN" && -n "$VERCEL_ORG_ID" && -n "$VERCEL_PROJECT_ID" ]]; then
        gh secret set VERCEL_TOKEN --body "$VERCEL_TOKEN"
        gh secret set VERCEL_ORG_ID --body "$VERCEL_ORG_ID"
        gh secret set VERCEL_PROJECT_ID --body "$VERCEL_PROJECT_ID"
        
        print_status "Vercel secrets configured successfully."
    else
        print_warning "Skipping Vercel secrets (incomplete information)."
    fi
}

# Setup Google Cloud Platform secrets (optional)
setup_gcp_secrets() {
    print_header "Setting up Google Cloud Platform secrets (optional)"
    
    read -p "Do you want to configure Google Cloud Run deployment? (y/N): " setup_gcp
    
    if [[ "$setup_gcp" =~ ^[Yy]$ ]]; then
        echo "Please provide your GCP configuration:"
        
        read -p "GCP Project ID: " GCP_PROJECT_ID
        read -p "Path to GCP Service Account JSON file: " GCP_SA_KEY_FILE
        
        if [[ -n "$GCP_PROJECT_ID" && -f "$GCP_SA_KEY_FILE" ]]; then
            GCP_SA_KEY=$(cat "$GCP_SA_KEY_FILE")
            
            gh secret set GCP_PROJECT_ID --body "$GCP_PROJECT_ID"
            gh secret set GCP_SA_KEY --body "$GCP_SA_KEY"
            
            # Enable GCP deployment
            gh variable set ENABLE_GCP_DEPLOYMENT --body "true"
            
            print_status "GCP secrets configured successfully."
            print_status "GCP deployment enabled."
        else
            print_warning "Skipping GCP secrets (incomplete information or file not found)."
        fi
    else
        print_status "Skipping GCP configuration."
    fi
}

# Setup repository permissions
setup_permissions() {
    print_header "Checking repository permissions"
    
    print_status "Please ensure the following permissions are enabled in your repository:"
    echo "  - Actions: Read and write"
    echo "  - Contents: Read"
    echo "  - Issues: Write"
    echo "  - Packages: Write"
    echo "  - Pull requests: Write"
    echo "  - Metadata: Read"
    echo ""
    echo "You can configure these at:"
    echo "https://github.com/$REPO_FULL_NAME/settings/actions"
    
    read -p "Press Enter to continue after configuring permissions..."
}

# Verify setup
verify_setup() {
    print_header "Verifying setup"
    
    # Check secrets
    print_status "Checking configured secrets:"
    
    if gh secret list | grep -q "VERCEL_TOKEN"; then
        echo "  ✅ VERCEL_TOKEN"
    else
        echo "  ❌ VERCEL_TOKEN"
    fi
    
    if gh secret list | grep -q "VERCEL_ORG_ID"; then
        echo "  ✅ VERCEL_ORG_ID"
    else
        echo "  ❌ VERCEL_ORG_ID"
    fi
    
    if gh secret list | grep -q "VERCEL_PROJECT_ID"; then
        echo "  ✅ VERCEL_PROJECT_ID"
    else
        echo "  ❌ VERCEL_PROJECT_ID"
    fi
    
    if gh secret list | grep -q "GCP_PROJECT_ID"; then
        echo "  ✅ GCP_PROJECT_ID (optional)"
    else
        echo "  ⚪ GCP_PROJECT_ID (not configured)"
    fi
    
    if gh secret list | grep -q "GCP_SA_KEY"; then
        echo "  ✅ GCP_SA_KEY (optional)"
    else
        echo "  ⚪ GCP_SA_KEY (not configured)"
    fi
    
    # Check variables
    print_status "Checking configured variables:"
    
    if gh variable list | grep -q "ENABLE_GCP_DEPLOYMENT"; then
        echo "  ✅ ENABLE_GCP_DEPLOYMENT"
    else
        echo "  ⚪ ENABLE_GCP_DEPLOYMENT (not set)"
    fi
}

# Test workflow
test_workflow() {
    print_header "Testing workflow"
    
    read -p "Do you want to trigger a test workflow run? (y/N): " trigger_test
    
    if [[ "$trigger_test" =~ ^[Yy]$ ]]; then
        print_status "Triggering workflow..."
        gh workflow run deploy.yml
        print_status "Workflow triggered. Check the Actions tab for progress:"
        echo "https://github.com/$REPO_FULL_NAME/actions"
    else
        print_status "Skipping workflow test."
    fi
}

# Main execution
main() {
    print_header "ChordMiniApp CI/CD Setup"
    echo "This script will help you configure GitHub secrets and variables for the CI/CD pipeline."
    echo ""
    
    check_gh_cli
    get_repo_info
    
    echo ""
    setup_vercel_secrets
    echo ""
    setup_gcp_secrets
    echo ""
    setup_permissions
    echo ""
    verify_setup
    echo ""
    test_workflow
    
    echo ""
    print_status "Setup complete! 🎉"
    print_status "Your CI/CD pipeline is now configured."
    print_status "Check the documentation in CI_CD_SETUP.md for more details."
}

# Run main function
main "$@"
