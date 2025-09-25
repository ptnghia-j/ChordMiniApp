#!/bin/bash

# Test CI Environment Simulation
# This script simulates the GitHub Actions CI environment to test our fixes

echo "🧪 Simulating GitHub Actions CI Environment"
echo "==========================================="

# Set CI environment variables
export CI=true
export GITHUB_ACTIONS=true

# Remove symlinks to simulate fresh CI environment
echo "🧹 Cleaning up symlinks (simulating fresh CI environment)..."
rm -f firebase.json firestore.rules firestore.indexes.json storage.rules

# Verify files are gone
echo "📋 Checking file status before pre-deployment check:"
echo "firebase.json exists: $([ -f firebase.json ] && echo 'YES' || echo 'NO')"
echo "firestore.rules exists: $([ -f firestore.rules ] && echo 'YES' || echo 'NO')"
echo "firebase/ directory exists: $([ -d firebase ] && echo 'YES' || echo 'NO')"
echo "firebase/firebase.json exists: $([ -f firebase/firebase.json ] && echo 'YES' || echo 'NO')"
echo "firebase/firestore.rules exists: $([ -f firebase/firestore.rules ] && echo 'YES' || echo 'NO')"

echo ""
echo "🚀 Running pre-deployment checklist in CI mode..."
echo "================================================="

# Run the pre-deployment checklist
./scripts/pre-deployment-checklist.sh

# Check the exit code
EXIT_CODE=$?

echo ""
echo "📊 CI Simulation Results"
echo "========================"
echo "Exit Code: $EXIT_CODE"

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS: Pre-deployment checklist passed in CI environment"
    echo "🎉 GitHub Actions should now work correctly!"
else
    echo "❌ FAILURE: Pre-deployment checklist failed in CI environment"
    echo "🔧 Additional fixes may be needed"
fi

echo ""
echo "📋 Final file status after pre-deployment check:"
echo "firebase.json exists: $([ -f firebase.json ] && echo 'YES' || echo 'NO')"
echo "firestore.rules exists: $([ -f firestore.rules ] && echo 'YES' || echo 'NO')"

# Show symlinks if they exist
if [ -L firebase.json ]; then
    echo "firebase.json -> $(readlink firebase.json)"
fi
if [ -L firestore.rules ]; then
    echo "firestore.rules -> $(readlink firestore.rules)"
fi

exit $EXIT_CODE
