# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent Substrate (ate): agent-runtimes as an actor.

Agent Substrate (https://ate.dev) runs OCI containers ("actors") in gVisor or
microVM sandboxes on Kubernetes, suspends an idle actor to a snapshot of its
memory and files, and resumes it on the next request. This package answers its
contract:

- :mod:`.settings` — what ``serve --target ate`` is started with.
- :mod:`.identity` — the actor's identity, read from its ``systemInfo`` volume
  at the time of use, never at start: every actor of a template starts from the
  same golden snapshot, so anything read at start is the golden actor's.
- :mod:`.lifecycle` — wakes: the template's ``wakeupProbe`` is called on each
  resume, and is the only sign of one inside the actor.
- :mod:`.contract` — the routes: ``GET /ate/wakeup`` and ``GET /ate/identity``.
- :mod:`.template` — the ``ActorTemplate`` and ``EgressPolicy`` of an
  agent-runtimes actor, for ``kubectl ate``.
"""
