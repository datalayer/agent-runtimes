# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Integrations for agent-runtimes.

This module provides integration with:
- mcp-codemode: Code-first MCP tool composition
- agent-skills: Reusable agent skill management
"""

from .codemode import CodemodeIntegration, get_codemode_integration

__all__ = [
    "CodemodeIntegration",
    "get_codemode_integration",
]
