# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent-runtimes Datalayer client (runtime-capable)."""

from agent_runtimes.client.runtime_client import RuntimeClient

# Backwards-friendly alias: within agent-runtimes, DatalayerClient is runtime-capable.
DatalayerClient = RuntimeClient

__all__ = ["RuntimeClient", "DatalayerClient"]
