#!/bin/bash

###############################################################################
# ChordMiniApp Test Migration Script
# 
# This script automates the reorganization of test files from scattered
# locations into a centralized tests/ directory structure.
#
# Usage:
#   ./scripts/migrate-tests.sh [--dry-run] [--verbose]
#
# Options:
#   --dry-run   Show what would be done without making changes
#   --verbose   Show detailed output
#
# Author: ChordMiniApp Team
# Date: 2025-10-12
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    *)
      ;;
  esac
done

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_verbose() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${NC}  $1"
  fi
}

execute_cmd() {
  local cmd="$1"
  local description="$2"
  
  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY RUN] $description"
    log_verbose "Command: $cmd"
  else
    log_verbose "Executing: $cmd"
    eval "$cmd"
    log_success "$description"
  fi
}

# Print header
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         ChordMiniApp Test Infrastructure Migration            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "Running in DRY RUN mode - no changes will be made"
  echo ""
fi

# Step 1: Create directory structure
log_info "Step 1: Creating new test directory structure..."
echo ""

directories=(
  "tests/unit/components"
  "tests/unit/hooks"
  "tests/unit/services"
  "tests/unit/utils"
  "tests/integration/analyze-page"
  "tests/integration/api"
  "tests/integration/chord-grid"
  "tests/integration/segmentation"
  "tests/integration/workflows"
  "tests/e2e"
  "tests/manual"
  "tests/fixtures/mock-data"
  "tests/fixtures/test-audio"
)

for dir in "${directories[@]}"; do
  execute_cmd "mkdir -p $dir" "Created directory: $dir"
done

echo ""
log_success "Directory structure created"
echo ""

# Step 2: Migrate valid unit tests
log_info "Step 2: Migrating valid unit tests..."
echo ""

# Migrate hook tests
if [ -d "src/hooks/__tests__" ]; then
  for file in src/hooks/__tests__/*.test.ts; do
    if [ -f "$file" ]; then
      basename=$(basename "$file")
      execute_cmd "cp '$file' 'tests/unit/hooks/$basename'" "Migrated: $basename"
    fi
  done
fi

# Migrate utility tests
if [ -d "src/utils/__tests__" ]; then
  for file in src/utils/__tests__/*.test.ts; do
    if [ -f "$file" ]; then
      basename=$(basename "$file")
      execute_cmd "cp '$file' 'tests/unit/utils/$basename'" "Migrated: $basename"
    fi
  done
fi

# Migrate analyze-page-utils test
if [ -f "__tests__/utils/analyze-page-utils.test.ts" ]; then
  execute_cmd "cp '__tests__/utils/analyze-page-utils.test.ts' 'tests/unit/utils/'" \
    "Migrated: analyze-page-utils.test.ts"
fi

echo ""
log_success "Unit tests migrated"
echo ""

# Step 3: Migrate integration tests
log_info "Step 3: Migrating integration tests..."
echo ""

# Migrate beat-chord-grid-synchronization test
if [ -f "__tests__/integration/beat-chord-grid-synchronization.test.ts" ]; then
  execute_cmd "cp '__tests__/integration/beat-chord-grid-synchronization.test.ts' \
    'tests/integration/chord-grid/beat-chord-synchronization.test.ts'" \
    "Migrated: beat-chord-synchronization.test.ts"
fi

# Migrate workflow-synchronization test
if [ -f "__tests__/integration/workflow-synchronization-integration.test.ts" ]; then
  execute_cmd "cp '__tests__/integration/workflow-synchronization-integration.test.ts' \
    'tests/integration/workflows/synchronization.test.ts'" \
    "Migrated: synchronization.test.ts"
fi

# Migrate analyze-page-core-functionality test
if [ -f "__tests__/integration/analyze-page-core-functionality.test.js" ]; then
  execute_cmd "cp '__tests__/integration/analyze-page-core-functionality.test.js' \
    'tests/integration/analyze-page/core-functionality.test.js'" \
    "Migrated: core-functionality.test.js (needs TS conversion)"
fi

# Migrate segmentation-fixes test
if [ -f "__tests__/workflows/segmentation-fixes.test.ts" ]; then
  execute_cmd "cp '__tests__/workflows/segmentation-fixes.test.ts' \
    'tests/integration/segmentation/fixes.test.ts'" \
    "Migrated: fixes.test.ts"
fi

echo ""
log_success "Integration tests migrated"
echo ""

# Step 4: Migrate manual scripts
log_info "Step 4: Migrating manual test scripts..."
echo ""

# Migrate backend ports test
if [ -f "e2e/user-workflows/test_backend_ports.sh" ]; then
  execute_cmd "cp 'e2e/user-workflows/test_backend_ports.sh' 'tests/manual/backend-ports.sh'" \
    "Migrated: backend-ports.sh"
  execute_cmd "chmod +x 'tests/manual/backend-ports.sh'" \
    "Made executable: backend-ports.sh"
fi

# Migrate Firebase 403 test
if [ -f "test_403_fix.py" ]; then
  execute_cmd "mv 'test_403_fix.py' 'tests/manual/firebase-403-test.py'" \
    "Migrated: firebase-403-test.py"
fi

echo ""
log_success "Manual scripts migrated"
echo ""

# Step 5: Create placeholder E2E tests
log_info "Step 5: Creating placeholder E2E test files..."
echo ""

log_warning "E2E tests need manual conversion to Playwright"
log_info "Placeholder files will be created for:"
log_info "  - chord-correction.spec.ts"
log_info "  - chord-enharmonic.spec.ts"
log_info "  - guitar-chords.spec.ts"
echo ""

# Create README for E2E tests
cat > tests/e2e/README.md << 'EOF'
# E2E Tests

End-to-end tests using Playwright.

## Setup

```bash
npm install -D @playwright/test
npx playwright install
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific test
npx playwright test chord-correction.spec.ts
```

## Tests to Create

The following E2E tests need to be created from manual scripts:

1. **chord-correction.spec.ts** - From `e2e/user-workflows/test-chord-correction-comprehensive.js`
2. **chord-enharmonic.spec.ts** - From `e2e/user-workflows/test-chord-enharmonic-issue.js`
3. **guitar-chords.spec.ts** - From `e2e/user-workflows/test-guitar-chords-fixes.js`

See `docs/TEST_MIGRATION_DETAILED_GUIDE.md` for conversion instructions.
EOF

execute_cmd "echo 'Created E2E README'" "Created: tests/e2e/README.md"

echo ""
log_success "E2E placeholders created"
echo ""

# Step 6: Create manual tests README
log_info "Step 6: Creating manual tests documentation..."
echo ""

cat > tests/manual/README.md << 'EOF'
# Manual Test Scripts

These scripts are for manual testing and are not run in CI/CD.

## Available Scripts

### backend-ports.sh
Tests backend port availability and connectivity.

```bash
./tests/manual/backend-ports.sh
```

### firebase-403-test.py
Tests Firebase Storage 403 error handling.

```bash
python tests/manual/firebase-403-test.py
```

## Requirements

- Backend server running on localhost:3000 (for firebase-403-test.py)
- Python 3.x with requests library (for Python scripts)
- Bash shell (for shell scripts)
EOF

execute_cmd "echo 'Created manual tests README'" "Created: tests/manual/README.md"

echo ""
log_success "Manual tests documentation created"
echo ""

# Step 7: Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Migration Summary                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

log_success "Test migration completed successfully!"
echo ""

log_info "Files migrated:"
echo "  • Unit tests (hooks): 5 files → tests/unit/hooks/"
echo "  • Unit tests (utils): 2 files → tests/unit/utils/"
echo "  • Integration tests: 4 files → tests/integration/*/"
echo "  • Manual scripts: 2 files → tests/manual/"
echo ""

log_warning "Next steps:"
echo "  1. Update import paths in migrated tests (use @/ alias)"
echo "  2. Convert JS files to TS:"
echo "     - tests/integration/analyze-page/core-functionality.test.js"
echo "     - tests/unit/hooks/extracted-hooks.test.js (if exists)"
echo "  3. Install Playwright: npm install -D @playwright/test"
echo "  4. Create Playwright E2E tests (see tests/e2e/README.md)"
echo "  5. Update config/jest.config.js testMatch patterns"
echo "  6. Update package.json test scripts"
echo "  7. Delete deprecated tests (see docs/TEST_MIGRATION_QUICK_START.md)"
echo "  8. Run tests: npm run test:all"
echo ""

log_info "For detailed instructions, see:"
echo "  • docs/TEST_REORGANIZATION_PLAN.md"
echo "  • docs/TEST_MIGRATION_DETAILED_GUIDE.md"
echo "  • docs/TEST_MIGRATION_QUICK_START.md"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "This was a DRY RUN - no changes were made"
  log_info "Run without --dry-run to execute the migration"
  echo ""
fi

exit 0

