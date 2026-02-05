#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Apply patch-package patches for jupyter packages
# This is normally run automatically via npm's postinstall hook,
# but can be run manually if needed.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📝 Applying patches...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CORE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$CORE_ROOT"

# Check if patches directory has any patch files (excluding .gitkeep)
PATCH_COUNT=$(find patches -name "*.patch" 2>/dev/null | wc -l)

if [ "$PATCH_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⏭️  No patches to apply${NC}"
  exit 0
fi

# Check if required packages exist in node_modules
# In a monorepo, packages may be hoisted to root node_modules
MISSING_PACKAGES=false

for patch_file in patches/*.patch; do
  if [ -f "$patch_file" ]; then
    # Extract package name from patch filename (e.g., @datalayer+jupyter-lexical+1.0.8.patch)
    filename=$(basename "$patch_file")
    # Handle scoped packages: @datalayer+jupyter-lexical+1.0.8.patch -> @datalayer/jupyter-lexical
    pkg_name=$(echo "$filename" | sed 's/+/\//; s/+.*//')

    if [ ! -d "node_modules/$pkg_name" ]; then
      echo -e "${YELLOW}⚠️  Package $pkg_name not found in local node_modules (may be hoisted in monorepo)${NC}"
      MISSING_PACKAGES=true
    fi
  fi
done

if [ "$MISSING_PACKAGES" = true ]; then
  echo -e "${YELLOW}⏭️  Skipping patches - packages not in local node_modules (monorepo setup)${NC}"
  exit 0
fi

npx patch-package

echo -e "${GREEN}✅ Patches applied successfully${NC}"
