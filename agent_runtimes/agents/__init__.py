# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent runtime execution helpers (local + cloud), migrated from datalayer-core."""

from agent_runtimes.agents.agent_utils import (
    compute_time_reservation_minutes,
    create_cloud_agent_runtime,
    resolve_environment_burning_rate,
    teardown_agent_execution_resources,
    terminate_cloud_agent_runtime,
)
from agent_runtimes.client.agent_client import (
    DEFAULT_LOCAL_AGENT_NAME,
    DEFAULT_LOCAL_HOST,
    DEFAULT_LOCAL_LOG_LEVEL,
    DEFAULT_LOCAL_PROTOCOL,
    LocalAgentRuntime,
    ensure_local_agent,
    start_local_agent_runtime,
    terminate_local_agent_runtime,
)

__all__ = [
    "LocalAgentRuntime",
    "DEFAULT_LOCAL_AGENT_NAME",
    "DEFAULT_LOCAL_HOST",
    "DEFAULT_LOCAL_LOG_LEVEL",
    "DEFAULT_LOCAL_PROTOCOL",
    "ensure_local_agent",
    "start_local_agent_runtime",
    "terminate_local_agent_runtime",
    "resolve_environment_burning_rate",
    "compute_time_reservation_minutes",
    "create_cloud_agent_runtime",
    "terminate_cloud_agent_runtime",
    "teardown_agent_execution_resources",
]
