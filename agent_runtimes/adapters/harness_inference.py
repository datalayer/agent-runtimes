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
from dataclasses import dataclass
from typing import Mapping

#: Where ai-inference serves Anthropic's Messages API, under its v1 root.
ANTHROPIC_ROUTE = "/anthropic"

#: Where ai-inference serves OpenAI's API (``/v1/responses`` and the rest),
#: under its v1 root: what Codex is given as ``OPENAI_BASE_URL``.
OPENAI_ROUTE = "/openai/v1"

BASE_URL_VARIABLE = "ANTHROPIC_BASE_URL"
AUTH_TOKEN_VARIABLE = "ANTHROPIC_AUTH_TOKEN"


@dataclass(frozen=True)
class Route:
    """How one harness's model calls go through ai-inference."""

    #: The account's secret the harness would otherwise be given; ai-inference reads it.
    secret: str
    #: ai-inference's route, under its v1 root.
    path: str
    #: The variable the harness reads its base URL from.
    base_url_variable: str
    #: The variable the harness reads its credential from: given the runtime's token.
    token_variable: str
    #: The ACP auth method the harness is authenticated with after ``initialize``, when it asks for one.
    auth_method: str | None = None


#: The harnesses whose model calls go through ai-inference on Datalayer.
#: Codex (codex-acp) reads ``OPENAI_BASE_URL`` and ``OPENAI_API_KEY`` and is
#: authenticated with its ``api-key`` method (META_HARNESS decision Y).
ROUTES: dict[str, Route] = {
    "claude-code": Route(
        "ANTHROPIC_API_KEY", ANTHROPIC_ROUTE, BASE_URL_VARIABLE, AUTH_TOKEN_VARIABLE
    ),
    "codex": Route(
        "OPENAI_API_KEY",
        OPENAI_ROUTE,
        "OPENAI_BASE_URL",
        "OPENAI_API_KEY",
        auth_method="api-key",
    ),
}

#: The harnesses routed, and the secret each would otherwise be given.
ROUTED: dict[str, str] = {harness: route.secret for harness, route in ROUTES.items()}


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


def route_of(
    harness_id: str, environment: Mapping[str, str] | None = None
) -> Route | None:
    """How a harness's calls go through ai-inference here, or ``None`` when they do not."""
    if harness_id in ROUTES and on_datalayer(environment):
        return ROUTES[harness_id]
    return None


def base_url(route: Route, environment: Mapping[str, str] | None = None) -> str:
    """``<ai-inference>/api/ai-inference/v1`` and the route's path."""
    from agent_runtimes.models.models import _normalize_ai_inference_base_url

    source = os.environ if environment is None else environment
    return (
        _normalize_ai_inference_base_url(source.get("DATALAYER_AI_INFERENCE_URL"))
        + route.path
    )


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
    "OPENAI_ROUTE",
    "ROUTES",
    "Route",
    "base_url",
    "route_of",
    "AUTH_TOKEN_VARIABLE",
    "BASE_URL_VARIABLE",
    "ROUTED",
    "anthropic_base_url",
    "on_datalayer",
    "routed_secret",
    "routed_token",
]
