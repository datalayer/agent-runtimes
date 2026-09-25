# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The conformance suite (PLAN_ORCHESTRATOR.md, section 13, O0-12).

Section 13's scenarios, written once and run against every registered
adapter. That is the point of the item and the exit criterion of Phase 0:
the same orchestration scenario runs through both bindings without any
orchestration logic changing between them, so a scenario here may never ask
which protocol it is on.

Three modules:

- ``bindings``: the registry, and the protocol glue that renders one
  scenario-neutral worker script into A2A phases or ACP session updates.
  Everything protocol-specific in this directory lives there.
- ``conftest``: the fixture that parametrizes every scenario over the
  registry.
- ``test_conformance``: scenarios 1 to 6, which is what 19.7 gives O0-12.

An adapter that cannot do what a scenario needs is skipped with the reason
it declared in its own ``AdapterCapabilities``, never quietly passed: a
scenario that does nothing and reports green is worse than one that fails,
because it is a claim nobody checks again.
"""
