# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Lifecycle hooks for agent tool execution.

Provides an extensibility layer for custom pre/post tool logic.
Hooks can be defined in the agentspec YAML or registered
programmatically.
"""

from .base import HookEvent, HookInput, HookResult
from .middleware import HooksMiddleware
from .registry import HookHandler, build_hooks_middleware, register_handler

__all__ = [
    "HookEvent",
    "HookInput",
    "HookResult",
    "HookHandler",
    "HooksMiddleware",
    "register_handler",
    "build_hooks_middleware",
]
