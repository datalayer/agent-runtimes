# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""kagent (https://kagent.dev): agent-runtimes as a kagent BYO Harness.

- :mod:`.settings` — what ``agent-runtimes serve --target kagent`` is started
  with: the agentspec, and the model and MCP servers of kagent's configuration.
- :mod:`.bridge` — the process kagent talks to: A2A v1 over gRPC, readiness
  and kagent's task store (kagent-core), each task forwarded to the
  agent-runtimes server beside it. It imports nothing of agent-runtimes and
  runs in its own environment, with kagent-core and a2a-sdk 1.x.
"""
