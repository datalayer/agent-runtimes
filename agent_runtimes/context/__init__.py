# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context management and usage tracking for agents.
"""

from .identities import (
    IdentityContextManager,
    clear_request_identities,
    get_identity_env,
    get_request_identities,
    set_request_identities,
)
from .session import (
    MODEL_CONTEXT_WINDOWS,
    ContextSnapshot,
    MessageSnapshot,
    RequestUsageSnapshot,
    SessionUsage,
    ToolSnapshot,
    TurnUsage,
    UsageTracker,
    count_tokens,
    count_tokens_json,
    extract_context_snapshot,
    get_model_context_window,
    usage_to_dict,
)
from .usage import (
    AgentUsageStats,
    AgentUsageTracker,
    UsageCategory,
    get_usage_tracker,
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
    "UsageTracker",
    "extract_context_snapshot",
    "get_model_context_window",
    "usage_to_dict",
    "count_tokens",
    "count_tokens_json",
    # Identity context
    "IdentityContextManager",
    "clear_request_identities",
    "get_identity_env",
    "get_request_identities",
    "set_request_identities",
]
