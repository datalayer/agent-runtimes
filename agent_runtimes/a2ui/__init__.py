# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Turning what a sandbox produced into something you can look at."""

from agent_runtimes.a2ui.executions import (
    A2UI_VERSION,
    ExecutionResult,
    execution_to_a2ui,
)

__all__ = ["A2UI_VERSION", "ExecutionResult", "execution_to_a2ui"]
