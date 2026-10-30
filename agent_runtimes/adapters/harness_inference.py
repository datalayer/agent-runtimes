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
OpenCode reads no base-URL variable: it is given its configuration inline
(``OPENCODE_CONFIG_CONTENT``), a ``datalayer`` provider on the AI SDK's
``@ai-sdk/openai-compatible`` whose ``baseURL`` is ai-inference's own v1 root
— its chat completions, on the platform's models and paid in the account's
credits, as the runtime's own agents call it — and whose key and
``Authorization`` header carry the runtime's token. No call of OpenCode's
reaches Anthropic on a key of the account's (the user's decision of 29
October 2026, superseding the Anthropic route of 28 October).

So the runtime is never given the key: it is not declared to the platform
(:func:`routed_secret`, read by ``guardrails.declared_secrets``), not passed
to the harness's process, and a key that is in the environment anyway is not
used. Elsewhere (a runtime started by hand, ``loop --harness``) the harness
takes the key from the environment, as its spec declares.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Mapping

#: Where ai-inference serves Anthropic's Messages API, under its v1 root.
ANTHROPIC_ROUTE = "/anthropic"

#: Where ai-inference serves OpenAI's API (``/v1/responses`` and the rest),
#: under its v1 root: what Codex is given as ``OPENAI_BASE_URL``.
OPENAI_ROUTE = "/openai/v1"

BASE_URL_VARIABLE = "ANTHROPIC_BASE_URL"
AUTH_TOKEN_VARIABLE = "ANTHROPIC_AUTH_TOKEN"

#: Where ai-inference serves its own chat completions: its v1 root.
CHAT_COMPLETIONS_ROUTE = ""

#: OpenCode's inline configuration (opencode.ai/docs/config: precedence 6 of
#: 8, over the global and project files).
OPENCODE_CONFIG_VARIABLE = "OPENCODE_CONFIG_CONTENT"

#: The provider OpenCode's configuration names ai-inference by.
OPENCODE_PROVIDER = "datalayer"


#: OpenCode's tools, as its ``permission`` configuration names them (opencode
#: 1.19.0, ``packages/core/src/v1/config/permission.ts``; ``edit`` covers
#: write, patch and apply_patch).
OPENCODE_PERMISSION_KEYS = (
    "read",
    "edit",
    "glob",
    "grep",
    "list",
    "bash",
    "task",
    "external_directory",
    "todowrite",
    "todoread",
    "question",
    "webfetch",
    "websearch",
    "codesearch",
    "lsp",
    "skill",
    "doom_loop",
    "plan_enter",
    "plan_exit",
)

#: OpenCode's own agents, each given the same asking so a repository's
#: agent rules (merged after the global ones) cannot allow a tool again.
OPENCODE_AGENTS = ("build", "plan", "general", "explore")


def opencode_permission() -> dict[str, str]:
    """Every OpenCode tool asks: its decision is the Shield's.

    OpenCode allows every tool by default (``"*": "allow"``, its
    ``agent.ts``), and a tool it allows never sends ACP's
    ``session/request_permission``: on r1, on 30 October 2026, an edit the
    Shield answered *leave it to me* went through all the same. Asked, the
    Shield answers each step by the application's Rules, and OpenCode does
    only what it allows. The wildcard first, then each tool by name, so a
    tool a project's configuration names is overridden where it stands.
    Nothing is allowed here, ever: fail closed.
    """
    return {"*": "ask", **{key: "ask" for key in OPENCODE_PERMISSION_KEYS}}


def opencode_agents_asking() -> dict[str, dict[str, Any]]:
    """Give each of OpenCode's own agents the asking the configuration has."""
    return {name: {"permission": opencode_permission()} for name in OPENCODE_AGENTS}


def opencode_asking_config() -> str:
    """Write OpenCode's configuration where its calls are not routed: the asking alone."""
    return json.dumps(
        {
            "$schema": "https://opencode.ai/config.json",
            "permission": opencode_permission(),
            "agent": opencode_agents_asking(),
        }
    )


def asking_config(harness_id: str) -> tuple[str, str] | None:
    """The variable and configuration that make a harness ask the Shield for every step, or ``None``."""
    if harness_id == "opencode":
        return OPENCODE_CONFIG_VARIABLE, opencode_asking_config()
    return None


def opencode_config(
    base_url: str, token: str, *, model: str, headers: Mapping[str, str] | None = None
) -> str:
    """Write OpenCode's configuration for ai-inference's chat completions: one
    provider, ``datalayer`` on ``@ai-sdk/openai-compatible`` (which adds
    ``/chat/completions`` to its ``baseURL``, ai-inference's v1 root), the
    runtime's token as its key and as a bearer, ``headers`` (the application
    and deployment a call is metered under) beside it, ``model`` its only
    model and the one it uses, every other provider off.
    """
    return json.dumps(
        {
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                OPENCODE_PROVIDER: {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": "Datalayer (ai-inference)",
                    "options": {
                        "baseURL": base_url,
                        "apiKey": token,
                        "headers": {
                            **dict(headers or {}),
                            "Authorization": f"Bearer {token}",
                        },
                    },
                    "models": {model: {"name": model, "tool_call": True}},
                }
            },
            "enabled_providers": [OPENCODE_PROVIDER],
            "model": f"{OPENCODE_PROVIDER}/{model}",
            "permission": opencode_permission(),
            "agent": opencode_agents_asking(),
        }
    )


def inline_config(
    route: "Route",
    base_url: str,
    token: str,
    *,
    model: str | None = None,
    headers: Mapping[str, str] | None = None,
) -> str:
    """The configuration a routed harness is given inline, for its ``config_variable``.

    ``model`` is the catalogue model it calls, the platform's default
    unsaid; ``headers`` go with each call.
    """
    if route.config_variable == OPENCODE_CONFIG_VARIABLE:
        from agent_runtimes.specs.models import DEFAULT_MODEL

        return opencode_config(
            base_url,
            token,
            model=model or DEFAULT_MODEL.value,
            headers=headers,
        )
    raise ValueError(
        f"No inline configuration is written for {route.config_variable!r}."
    )


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
    #: The variable the harness reads its configuration from inline, when it
    #: reads no base-URL variable: written by :func:`inline_config`.
    config_variable: str | None = None


#: The harnesses whose model calls go through ai-inference on Datalayer.
#: Codex (codex-acp) ignores ``OPENAI_BASE_URL`` (found on r1, 22 October
#: 2026: it called api.openai.com): it is authenticated with codex-acp's
#: ``gateway`` method — a custom provider whose base URL is ai-inference's
#: route and whose ``Authorization`` header carries the runtime's token, on
#: the Responses wire API (META_HARNESS decision Y).
ROUTES: dict[str, Route] = {
    "claude-code": Route(
        "ANTHROPIC_API_KEY", ANTHROPIC_ROUTE, BASE_URL_VARIABLE, AUTH_TOKEN_VARIABLE
    ),
    # OpenCode (the user's decision, 29 October 2026): ai-inference's own
    # chat completions, on the platform's models and the account's credits,
    # through its own provider configuration; its spec's ANTHROPIC_API_KEY is
    # neither needed nor given. The two variables are read by nobody but
    # this runtime: OpenCode reads its configuration.
    "opencode": Route(
        "ANTHROPIC_API_KEY",
        CHAT_COMPLETIONS_ROUTE,
        "DATALAYER_AI_INFERENCE_BASE_URL",
        "DATALAYER_AI_INFERENCE_TOKEN",
        config_variable=OPENCODE_CONFIG_VARIABLE,
    ),
    "codex": Route(
        "OPENAI_API_KEY",
        OPENAI_ROUTE,
        "OPENAI_BASE_URL",
        "OPENAI_API_KEY",
        auth_method="gateway",
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
    "CHAT_COMPLETIONS_ROUTE",
    "OPENAI_ROUTE",
    "OPENCODE_PROVIDER",
    "OPENCODE_CONFIG_VARIABLE",
    "OPENCODE_PERMISSION_KEYS",
    "asking_config",
    "opencode_agents_asking",
    "opencode_asking_config",
    "opencode_permission",
    "inline_config",
    "opencode_config",
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
