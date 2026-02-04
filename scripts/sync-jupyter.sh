#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Sync local jupyter-ui packages to @datalayer/agent-runtimes node_modules
# This script builds the local jupyter packages and copies their lib/ outputs
# into the core package's node_modules for quick testing during development.
#
# Usage:
#   ./sync-jupyter.sh          # Run once and exit
#   ./sync-jupyter.sh --watch  # Watch for changes and auto-sync

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CORE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
JUPYTER_UI_ROOT="$( cd "$CORE_ROOT/../jupyter-ui" && pwd )"

# Function to perform the sync
sync_packages() {
  echo -e "${BLUE}🔄 Syncing jupyter-ui packages to @datalayer/agent-runtimes...${NC}"

  # Build jupyter-react FIRST (lexical depends on it)
  echo -e "${BLUE}📦 Building @datalayer/jupyter-react...${NC}"
  cd "$JUPYTER_UI_ROOT/packages/react"
  echo -e "${YELLOW}[DEBUG] Current directory: $(pwd)${NC}"
  rm -f tsconfig.tsbuildinfo
  rm -rf lib
  echo -e "${YELLOW}[DEBUG] Running gulp resources-to-lib...${NC}"
  npx gulp resources-to-lib
  echo -e "${YELLOW}[DEBUG] Running TypeScript...${NC}"
  npx tsc --noEmitOnError false
  TSC_EXIT=$?
  echo -e "${YELLOW}[DEBUG] TypeScript exit code: $TSC_EXIT${NC}"
  echo -e "${YELLOW}[DEBUG] Checking if lib exists...${NC}"
  ls -la lib 2>&1 | head -5

  # Verify lib was created
  if [ ! -d "lib" ]; then
    echo -e "${YELLOW}⚠️  lib directory was not created by TypeScript!${NC}"
    exit 1
  fi
  echo -e "${YELLOW}[DEBUG] lib directory verified!${NC}"

  # Copy react to core's node_modules for patch-package
  echo -e "${BLUE}📋 Copying react to core/node_modules...${NC}"
  cd "$CORE_ROOT"
  # Only replace lib/ directory, preserving LICENSE, README.md, etc.
  rm -rf node_modules/@datalayer/jupyter-react/lib
  mkdir -p node_modules/@datalayer/jupyter-react/lib
  cp -r "$JUPYTER_UI_ROOT/packages/react/lib/." node_modules/@datalayer/jupyter-react/lib/
  # Copy style directory
  rm -rf node_modules/@datalayer/jupyter-react/style
  cp -r "$JUPYTER_UI_ROOT/packages/react/style" node_modules/@datalayer/jupyter-react/
  cp "$JUPYTER_UI_ROOT/packages/react/package.json" node_modules/@datalayer/jupyter-react/

  # Now build jupyter-lexical (finds react via workspace hoisting)
  echo -e "${BLUE}📦 Building @datalayer/jupyter-lexical...${NC}"
  cd "$JUPYTER_UI_ROOT/packages/lexical"
  rm -f tsconfig.tsbuildinfo
  rm -rf lib
  echo -e "${YELLOW}[DEBUG] Running gulp resources-to-lib...${NC}"
  npx gulp resources-to-lib
  echo -e "${YELLOW}[DEBUG] Running TypeScript...${NC}"
  npx tsc --noEmitOnError false

  # Copy lexical to node_modules
  echo -e "${BLUE}📋 Copying lexical to node_modules...${NC}"
  cd "$CORE_ROOT"
  # Only replace lib/ directory, preserving LICENSE, README.md, etc.
  rm -rf node_modules/@datalayer/jupyter-lexical/lib
  mkdir -p node_modules/@datalayer/jupyter-lexical/lib
  cp -r "$JUPYTER_UI_ROOT/packages/lexical/lib/." node_modules/@datalayer/jupyter-lexical/lib/
  # Copy style directory
  rm -rf node_modules/@datalayer/jupyter-lexical/style
  cp -r "$JUPYTER_UI_ROOT/packages/lexical/style" node_modules/@datalayer/jupyter-lexical/
  cp "$JUPYTER_UI_ROOT/packages/lexical/package.json" node_modules/@datalayer/jupyter-lexical/

  echo -e "${GREEN}✅ Successfully synced at $(date +"%H:%M:%S")${NC}"
}

# Check if watch mode is requested
if [[ "$1" == "--watch" ]]; then
  # Check if fswatch is installed
  if ! command -v fswatch &> /dev/null; then
    echo -e "${YELLOW}⚠️  fswatch not found. Installing via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
      brew install fswatch
    else
      echo -e "${YELLOW}⚠️  Homebrew not found. Please install fswatch manually:${NC}"
      echo -e "${YELLOW}    brew install fswatch${NC}"
      echo -e "${YELLOW}    or visit: https://github.com/emcrisostomo/fswatch${NC}"
      exit 1
    fi
  fi

  echo -e "${BLUE}👁️  Watch mode enabled. Monitoring jupyter-ui packages for changes...${NC}"
  echo -e "${YELLOW}📁 Watching:${NC}"
  echo -e "${YELLOW}   - $JUPYTER_UI_ROOT/packages/lexical/src${NC}"
  echo -e "${YELLOW}   - $JUPYTER_UI_ROOT/packages/react/src${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
  echo ""

  # Initial sync
  sync_packages

  # Watch for changes in src directories and trigger sync
  # Using fswatch with:
  # -r: recursive
  # -e: exclude patterns (node_modules, lib, etc.)
  # -l 1: latency 1 second (debounce rapid changes)
  fswatch -r -l 1 \
    -e ".*" -i "\\.tsx?$" -i "\\.jsx?$" -i "\\.css$" \
    "$JUPYTER_UI_ROOT/packages/lexical/src" \
    "$JUPYTER_UI_ROOT/packages/react/src" | while read -r file; do
    echo -e "\n${YELLOW}📝 Change detected in: $(basename "$file")${NC}"
    sync_packages
  done
else
  # Single run mode
  sync_packages
fi
