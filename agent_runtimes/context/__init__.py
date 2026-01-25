# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context management and usage tracking for agents.
"""

from .usage import (
    AgentUsageStats,
    AgentUsageTracker,
    UsageCategory,
    get_usage_tracker,
)
from .snapshot import (
    ContextSnapshot,
    MessageSnapshot,
    MODEL_CONTEXT_WINDOWS,
    RequestUsageSnapshot,
    SessionUsage,
    ToolSnapshot,
    TurnUsage,
    extract_context_snapshot,
    get_agent_context_snapshot,
    get_model_context_window,
    count_tokens,
    count_tokens_json,
    estimate_tokens,  # backward compat alias
    estimate_tokens_json,  # backward compat alias
)
from .identities import (
    IdentityContextManager,
    clear_request_identities,
    get_identity_env,
    get_request_identities,
    set_request_identities,
)

__all__ = [
    "AgentUsageStats",
    "AgentUsageTracker",
    "UsageCategory",
    "get_usage_tracker",
    "ContextSnapshot",
    "MessageSnapshot",
    "MODEL_CONTEXT_WINDOWS",
    "RequestUsageSnapshot",
    "SessionUsage",
    "ToolSnapshot",
    "TurnUsage",
    "extract_context_snapshot",
    "get_agent_context_snapshot",
    "get_model_context_window",
    "count_tokens",
    "count_tokens_json",
    "estimate_tokens",
    "estimate_tokens_json",
    # Identity context
    "IdentityContextManager",
    "clear_request_identities",
    "get_identity_env",
    "get_request_identities",
    "set_request_identities",
]
