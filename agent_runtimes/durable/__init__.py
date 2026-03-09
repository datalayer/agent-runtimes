# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
DBOS Durable Execution integration for agent-runtimes.

This module provides durable execution wrapping for PydanticAI agents
using DBOS, enabling automatic recovery from transient failures,
workflow persistence, and agent checkpoint/restore.

Key components:
- ``DurableConfig`` — DBOS configuration (SQLite path, Postgres URL)
- ``wrap_agent_durable`` — Wrap a PydanticAI agent with DBOSAgent
- ``DurableLifecycle`` — DBOS launch/shutdown lifecycle management
"""

from .config import DurableConfig
from .lifecycle import DurableLifecycle
from .wrapper import wrap_agent_durable

__all__ = [
    "DurableConfig",
    "DurableLifecycle",
    "wrap_agent_durable",
]
