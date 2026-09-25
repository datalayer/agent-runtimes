# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The protocol bindings of section 7 (PLAN_ORCHESTRATOR.md, O0-06, O0-07).

One module per protocol, each an implementation of the ``WorkerAdapter``
port and nothing more: no policy, no canonical state, no second client for a
protocol this repository already speaks. A2A is the primary remote binding
and ACP is the interactive one; a native framework adapter joins them only
where it offers something neither protocol can express (7.5).

Nothing is imported here. Importing an adapter imports its protocol's
client, and which of those a process loads is the caller's decision.
"""
