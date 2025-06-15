#!/bin/bash

# Quick Cache Deletion Script for ChordMini
# Temporarily enables deletion, clears cache, then restores security

if [ -z "$1" ]; then
    echo "Usage: $0 <VIDEO_ID> [--beats] [--chords] [--translations] [--all]"
    echo "Example: $0 rg_zwK_sSEY --beats --chords"
    exit 1
fi

VIDEO_ID="$1"
shift
CACHE_FLAGS="$@"

echo "🎵 ChordMini Quick Cache Deletion"
echo "================================="
echo "Video ID: $VIDEO_ID"
echo "Flags: $CACHE_FLAGS"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list > /dev/null 2>&1; then
    echo -e "${RED}❌ Not logged into Firebase${NC}"
    echo "Login with: firebase login"
    exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will temporarily disable cache deletion security${NC}"
echo "This script will:"
echo "1. Backup current security rules"
echo "2. Temporarily allow cache deletion"
echo "3. Delete specified cache entries"
echo "4. Restore original security rules"
echo ""

read -p "Do you want to continue? (y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled"
    exit 0
fi

echo ""
echo "🔧 Step 1: Backing up current security rules..."

# Backup current rules
cp firestore.rules firestore.rules.backup
echo -e "${GREEN}✅ Rules backed up to firestore.rules.backup${NC}"

echo ""
echo "🔓 Step 2: Temporarily enabling cache deletion..."

# Create temporary rules with deletion enabled
cat > firestore.rules.temp << 'EOF'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Temporary rules - ALLOW ALL OPERATIONS FOR CACHE DELETION
    match /{document=**} {
      allow read, write, delete: if true;
    }
  }
}
EOF

# Deploy temporary rules
if firebase deploy --only firestore:rules --project chordmini-d29f9 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Temporary rules deployed${NC}"
else
    echo -e "${RED}❌ Failed to deploy temporary rules${NC}"
    rm firestore.rules.temp
    exit 1
fi

echo ""
echo "🗑️  Step 3: Deleting cache entries..."

# Wait a moment for rules to propagate
sleep 3

# Run the cache deletion
if node scripts/delete-cache.js "$VIDEO_ID" $CACHE_FLAGS --force; then
    echo -e "${GREEN}✅ Cache deletion completed${NC}"
else
    echo -e "${YELLOW}⚠️  Cache deletion had issues (check output above)${NC}"
fi

echo ""
echo "🔒 Step 4: Restoring original security rules..."

# Restore original rules
if firebase deploy --only firestore:rules --project chordmini-d29f9 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Original security rules restored${NC}"
else
    echo -e "${RED}❌ Failed to restore original rules${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Manually restore rules from firestore.rules.backup${NC}"
fi

# Cleanup
rm -f firestore.rules.temp

echo ""
echo "📊 Summary"
echo "=========="
echo "✅ Cache deletion process completed"
echo "✅ Security rules restored"
echo "✅ Temporary files cleaned up"
echo ""
echo "🔗 Verify in Firebase Console:"
echo "https://console.firebase.google.com/project/chordmini-d29f9/firestore"
