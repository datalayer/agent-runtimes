# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Plugins for agent-runtimes.

This module provides pluggable extensions, including:
- Agent_Sudo: External tool authorization policy and audit integration
"""

from .agent_sudo import authorize_tool_call

__all__ = [
    "authorize_tool_call",
]
