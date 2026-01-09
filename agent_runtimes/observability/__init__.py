# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Observability module for agent-runtimes.

Provides:
- OpenTelemetry (OTEL) tracing integration
- SQLite-based trace storage
- Optional Logfire integration
- Agent execution tracing
- Performance metrics
"""

from .config import ObservabilityConfig, configure_observability
from .storage import TraceStorage, SQLiteTraceStorage
from .tracer import AgentTracer, trace_agent_run, trace_tool_call

__all__ = [
    # Configuration
    "ObservabilityConfig",
    "configure_observability",
    # Storage
    "TraceStorage",
    "SQLiteTraceStorage",
    # Tracer
    "AgentTracer",
    "trace_agent_run",
    "trace_tool_call",
]
