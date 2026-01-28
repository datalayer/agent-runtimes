#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Sync built Jupyter UI packages to agent-runtimes node_modules
# This script copies the lib/ directories from jupyter-ui to agent-runtimes

set -e

# Define paths
JUPYTER_UI_ROOT="/Users/goanpeca/Desktop/develop/datalayer/jupyter-ui"
AGENT_RUNTIMES_ROOT="/Users/goanpeca/Desktop/develop/datalayer/agent-runtimes"

echo "=========================================="
echo "Syncing Jupyter UI Packages"
echo "=========================================="
echo "From: $JUPYTER_UI_ROOT"
echo "To:   $AGENT_RUNTIMES_ROOT/node_modules"
echo ""

# Sync @datalayer/jupyter-react
echo "[1/2] Syncing @datalayer/jupyter-react..."
REACT_SOURCE="$JUPYTER_UI_ROOT/packages/react/lib"
REACT_TARGET="$AGENT_RUNTIMES_ROOT/node_modules/@datalayer/jupyter-react/lib"

if [ -d "$REACT_SOURCE" ]; then
    rm -rf "$REACT_TARGET"
    cp -R "$REACT_SOURCE" "$REACT_TARGET"
    echo "  ✓ Synced @datalayer/jupyter-react"
else
    echo "  ✗ Warning: $REACT_SOURCE not found (run 'npm run build' in jupyter-ui first)"
fi

# Sync @datalayer/jupyter-lexical
echo "[2/2] Syncing @datalayer/jupyter-lexical..."
LEXICAL_SOURCE="$JUPYTER_UI_ROOT/packages/lexical/lib"
LEXICAL_TARGET="$AGENT_RUNTIMES_ROOT/node_modules/@datalayer/jupyter-lexical/lib"

if [ -d "$LEXICAL_SOURCE" ]; then
    rm -rf "$LEXICAL_TARGET"
    cp -R "$LEXICAL_SOURCE" "$LEXICAL_TARGET"
    echo "  ✓ Synced @datalayer/jupyter-lexical"
else
    echo "  ✗ Warning: $LEXICAL_SOURCE not found (run 'npm run build' in jupyter-ui first)"
fi

echo ""
echo "=========================================="
echo "Sync Complete!"
echo "=========================================="
echo ""
echo "Synced packages:"
echo "  • @datalayer/jupyter-react → agent-runtimes"
echo "  • @datalayer/jupyter-lexical → agent-runtimes"
echo ""
