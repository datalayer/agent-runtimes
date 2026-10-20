# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness's model calls through ai-inference, on a Datalayer runtime.

On Datalayer (the runtime routes its inference through ai-inference:
``AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=datalayer`` and
``DATALAYER_AI_INFERENCE_URL``), Claude Code is pointed at ai-inference's
Anthropic route — ``ANTHROPIC_BASE_URL`` is ``<ai-inference>/anthropic`` —
and calls it with the runtime's ai-inference token as ``ANTHROPIC_AUTH_TOKEN``.
ai-inference calls Anthropic on the account's own ``ANTHROPIC_API_KEY``, which
it reads from the account's secrets, and meters the call under the account.

So the runtime is never given the key: it is not declared to the platform
(:func:`routed_secret`, read by ``guardrails.declared_secrets``), not passed
to the harness's process, and a key that is in the environment anyway is not
used. Elsewhere (a runtime started by hand, ``loop --harness``) the harness
takes the key from the environment, as its spec declares.
"""

from __future__ import annotations

import os
from typing import Mapping

#: The harnesses whose model calls go through ai-inference on Datalayer, and
#: the secret each would otherwise be given.
ROUTED: dict[str, str] = {"claude-code": "ANTHROPIC_API_KEY"}

#: Where ai-inference serves Anthropic's Messages API, under its v1 root.
ANTHROPIC_ROUTE = "/anthropic"

BASE_URL_VARIABLE = "ANTHROPIC_BASE_URL"
AUTH_TOKEN_VARIABLE = "ANTHROPIC_AUTH_TOKEN"


def on_datalayer(environment: Mapping[str, str] | None = None) -> bool:
    """Whether this runtime calls its models through ai-inference."""
    source = os.environ if environment is None else environment
    provider = (
        (source.get("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE") or "").strip().lower()
    )
    return provider == "datalayer" and bool(
        (source.get("DATALAYER_AI_INFERENCE_URL") or "").strip()
    )


def routed_secret(
    harness_id: str, environment: Mapping[str, str] | None = None
) -> str | None:
    """The secret a harness is not given because its calls go through ai-inference, or ``None``."""
    if harness_id in ROUTED and on_datalayer(environment):
        return ROUTED[harness_id]
    return None


def anthropic_base_url(environment: Mapping[str, str] | None = None) -> str:
    """``<ai-inference>/api/ai-inference/v1/anthropic``: Claude Code adds ``/v1/messages``."""
    from agent_runtimes.models.models import _normalize_ai_inference_base_url

    source = os.environ if environment is None else environment
    return (
        _normalize_ai_inference_base_url(source.get("DATALAYER_AI_INFERENCE_URL"))
        + ANTHROPIC_ROUTE
    )


def routed_token() -> tuple[str | None, str | None]:
    """The token the harness calls ai-inference with, and why there is none: ``(token, refusal)``."""
    from agent_runtimes.models.offered import inference_token, inference_token_refusal

    refusal = inference_token_refusal()
    if refusal:
        return None, refusal
    return inference_token(), None


__all__ = [
    "ANTHROPIC_ROUTE",
    "AUTH_TOKEN_VARIABLE",
    "BASE_URL_VARIABLE",
    "ROUTED",
    "anthropic_base_url",
    "on_datalayer",
    "routed_secret",
    "routed_token",
]
