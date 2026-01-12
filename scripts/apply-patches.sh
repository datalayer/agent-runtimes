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
NC='\033[0m' # No Color

echo -e "${BLUE}📝 Applying patches...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CORE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$CORE_ROOT"

npx patch-package

echo -e "${GREEN}✅ Patches applied successfully${NC}"
