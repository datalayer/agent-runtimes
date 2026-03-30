# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Invoker registry – maps trigger types to invoker classes."""

from __future__ import annotations

import logging
from typing import Type

from .base import BaseInvoker

logger = logging.getLogger(__name__)

_REGISTRY: dict[str, Type[BaseInvoker]] = {}


def register_invoker(trigger_type: str, cls: Type[BaseInvoker]) -> None:
    """Register an invoker class for a given trigger type."""
    _REGISTRY[trigger_type] = cls
    logger.debug("Registered invoker for trigger type '%s': %s", trigger_type, cls.__name__)


def get_invoker(
    trigger_type: str,
    agent_id: str,
    agent_spec_id: str,
    token: str,
    base_url: str = "https://prod1.datalayer.run",
    runtime_id: str | None = None,
) -> BaseInvoker | None:
    """Look up and instantiate an invoker for the given trigger type.

    Returns ``None`` if no invoker is registered for *trigger_type*.
    """
    cls = _REGISTRY.get(trigger_type)
    if cls is None:
        logger.warning("No invoker registered for trigger type '%s'", trigger_type)
        return None
    return cls(
        agent_id=agent_id,
        agent_spec_id=agent_spec_id,
        token=token,
        base_url=base_url,
        runtime_id=runtime_id,
    )


# ── Auto-register built-in invokers on import ────────────────────────

def _auto_register() -> None:
    from .once import OnceInvoker  # noqa: F811
    register_invoker("once", OnceInvoker)


_auto_register()
