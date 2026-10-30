# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The adapters this package has, and the ones a deployment offers.

A deployment offers an adapter by naming it in `DATALAYER_EVALS_ADAPTERS`
(comma separated): an adapter nobody named is not advertised, and a name this
package does not have refuses to be read rather than being skipped. A runtime
does not need the variable: it runs an operation for a framework it has, and
is asked by a service that decided the adapter was offered.
"""

from __future__ import annotations

import importlib
import os

from agent_runtimes.evals.adapters.base import ExternalAdapter

__all__ = ["UnknownAdapter", "adapter", "offered_adapters"]

#: framework -> where its class lives. Imported when it is asked for, so a
#: framework's own requirements stay out of everything that does not run it.
_ADAPTERS: dict[str, str] = {
    "fake": "agent_runtimes.evals.adapters.fake:FakeAdapter",
    "inspect-ai": "agent_runtimes.evals.adapters.inspect_ai:InspectAdapter",
}

OFFERED_VARIABLE = "DATALAYER_EVALS_ADAPTERS"


class UnknownAdapter(LookupError):
    """No adapter of this package answers to that framework."""


def adapter(framework: str) -> ExternalAdapter:
    """The adapter of `framework`."""
    location = _ADAPTERS.get(framework)
    if location is None:
        raise UnknownAdapter(f"no adapter for the framework {framework!r}; known: {', '.join(sorted(_ADAPTERS))}")
    module, name = location.split(":")
    return getattr(importlib.import_module(module), name)()


def offered_adapters() -> list[ExternalAdapter]:
    """The adapters this deployment offers, in the order it named them."""
    names = [item.strip() for item in os.environ.get(OFFERED_VARIABLE, "").split(",") if item.strip()]
    return [adapter(name) for name in names]
