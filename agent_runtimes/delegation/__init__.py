# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent delegation with cross-agent usage tracking and observability."""

from .delegate import DelegationConfig, DelegationResult, delegate_to_agent

__all__ = [
    "delegate_to_agent",
    "DelegationConfig",
    "DelegationResult",
]
