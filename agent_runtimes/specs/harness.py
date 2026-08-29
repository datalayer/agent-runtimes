# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Which framework runs an agent's loop.

Everything about *what* an agent is — prompt, tools, model, evals — is shared
between harnesses and lives in the spec. The harness says only where the loop
turns, and therefore what the agent can reach while it turns.

The question this side needs answered is narrow: can this runtime run this
agent at all? So there is no Python twin of ``src/runtimes/variants.ts``. A
variant pairs a *location* with a harness, and choosing a location is something
a client does — it is the client that decides between its own page, a local
runtime and a cloud one. A runtime is already somewhere; all it can do with a
spec built for the browser is decline it.
"""

from __future__ import annotations

from typing import Any

#: The server-side harness: the loop runs here, in the agent runtime.
HARNESS_PYDANTIC_AI = "pydantic-ai"

#: The in-browser harness: the loop runs in the page with the Vercel AI SDK.
HARNESS_VERCEL_AI = "vercel-ai"


def harness_of(spec: Any) -> str:
    """The harness a spec asks for.

    Defaulted rather than optional: every agent is run by something, and a spec
    that says nothing is run by the server-side harness that has always run it.
    That default is what lets existing specs stay correct without being touched.

    Accepts either an ``Agentspec`` or the mapping a YAML load produces, so a
    caller does not have to know which it is holding.
    """
    value = (
        spec.get("harness")
        if isinstance(spec, dict)
        else getattr(spec, "harness", None)
    )
    return HARNESS_VERCEL_AI if value == HARNESS_VERCEL_AI else HARNESS_PYDANTIC_AI


def runs_in_browser(spec: Any) -> bool:
    """Whether this agent's loop runs in the browser rather than here.

    The question worth asking at a branch point, because it is the one that
    changes what is available: an in-browser agent has no server behind it, so
    no MCP servers, no sandbox and no codemode — only the frontend tools.

    The server-side runtime should not try to serve one: there is no loop here
    to run.
    """
    return harness_of(spec) == HARNESS_VERCEL_AI
