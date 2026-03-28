# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent invoker module.

Provides a modular trigger system that analyses an agent spec's
trigger configuration and invokes the agent accordingly. Each
trigger type (``once``, ``schedule``, ``event``) is handled by
a dedicated ``BaseInvoker`` subclass.
"""

from .base import BaseInvoker, InvokerResult
from .once import OnceInvoker
from .registry import get_invoker, register_invoker

__all__ = [
    "BaseInvoker",
    "InvokerResult",
    "OnceInvoker",
    "get_invoker",
    "register_invoker",
]
