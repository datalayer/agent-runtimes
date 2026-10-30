# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness's model calls through ai-inference, on a Datalayer runtime.

On a Datalayer runtime (it routes its inference through ai-inference:
``AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=datalayer`` and
``DATALAYER_AI_INFERENCE_URL``), every model call goes through ai-inference,
to Bedrock or Alibaba, paid in the account's credits, on no key of the
account's. Run locally (``loop --harness``, the CLI, a laptop demo), a harness
takes the person's own key from the environment, as its spec declares.

* Claude Code is pointed at ai-inference's Anthropic-shaped route, which
  answers from Bedrock: ``ANTHROPIC_BASE_URL`` is ``<ai-inference>/anthropic``,
  the runtime's ai-inference token is ``ANTHROPIC_AUTH_TOKEN``, and each of its
  model tiers is the catalogue's model (:func:`claude_code_environment`).
* OpenCode reads no base-URL variable: it is given its configuration inline
  (``OPENCODE_CONFIG_CONTENT``), a ``datalayer`` provider on the AI SDK's
  ``@ai-sdk/openai-compatible`` whose ``baseURL`` is ai-inference's own v1
  root, its chat completions, and whose key and ``Authorization`` header carry
  the runtime's token.
* pi reads no base-URL variable either: it is given a configuration directory
  of its own (``PI_CODING_AGENT_DIR``, :func:`write_config_directory`), with a
  ``datalayer`` provider on the same Anthropic-shaped route and no token in it.
* Any other harness is not offered there (:func:`refusal`): a harness served
  on Datalayer is one whose calls are known to go through ai-inference. Codex
  speaks OpenAI's Responses API, which ai-inference does not serve.

So the runtime is never given a key: none is declared to the platform
(``guardrails.declared_secrets``), none is passed to the harness's process, and
a key that is in the environment anyway is not used.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

#: Where ai-inference serves Anthropic's Messages API, under its v1 root.
ANTHROPIC_ROUTE = "/anthropic"

BASE_URL_VARIABLE = "ANTHROPIC_BASE_URL"
AUTH_TOKEN_VARIABLE = "ANTHROPIC_AUTH_TOKEN"

#: Where ai-inference serves its own chat completions: its v1 root.
CHAT_COMPLETIONS_ROUTE = ""

#: OpenCode's inline configuration (opencode.ai/docs/config: precedence 6 of
#: 8, over the global and project files).
OPENCODE_CONFIG_VARIABLE = "OPENCODE_CONFIG_CONTENT"

#: The provider OpenCode's configuration names ai-inference by.
OPENCODE_PROVIDER = "datalayer"

#: The variable pi reads its configuration directory from.
PI_DIRECTORY_VARIABLE = "PI_CODING_AGENT_DIR"

#: The provider pi's configuration names ai-inference by.
PI_PROVIDER = "datalayer"

#: Where a harness's configuration directory goes, under its workspace: the
#: one place a sidecar's harness shares with the runtime.
CONFIG_DIRECTORY = ".datalayer"

#: The harness's variables that carry ai-inference, for a harness that reads
#: them from its configuration: read by nobody but this runtime and that
#: configuration.
INFERENCE_BASE_URL_VARIABLE = "DATALAYER_AI_INFERENCE_BASE_URL"
INFERENCE_TOKEN_VARIABLE = "DATALAYER_AI_INFERENCE_TOKEN"

#: Why a harness is not offered on Datalayer, when more can be said than that
#: its calls would not go through ai-inference.
NOT_OFFERED_BECAUSE = {
    "codex": (
        "it speaks OpenAI's Responses API, which ai-inference does not serve "
        "from Bedrock or Alibaba"
    ),
}


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


def claude_code_environment(model: str | None = None) -> dict[str, str]:
    """What Claude Code is told on Datalayer, besides where and with what to call.

    ``model`` is the catalogue's Bedrock model, the platform's default unsaid.
    Claude Code picks a model by tier and calls a Haiku for its background
    work, and ai-inference serves the catalogue's models and refuses any other
    in a sentence: every tier is pinned to that one. It asks for no beta
    Bedrock would refuse, and reaches nothing of Anthropic's but its models,
    which the pod's boundary would refuse anyway.
    """
    from agent_runtimes.specs.models import DEFAULT_MODEL

    bedrock = (model or DEFAULT_MODEL.value).removeprefix("bedrock:")
    return {
        "ANTHROPIC_MODEL": bedrock,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": bedrock,
        "ANTHROPIC_DEFAULT_SONNET_MODEL": bedrock,
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": bedrock,
        "ANTHROPIC_SMALL_FAST_MODEL": bedrock,
        "CLAUDE_CODE_SUBAGENT_MODEL": bedrock,
        "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    }


def custom_headers(headers: Mapping[str, str]) -> str:
    """``ANTHROPIC_CUSTOM_HEADERS``: Claude Code's extra headers, one ``Name: Value`` a line."""
    return "\n".join(f"{name}: {value}" for name, value in headers.items())


def pi_models(
    base_url: str, *, model: str, headers: Mapping[str, str] | None = None
) -> str:
    """Write pi's ``models.json``: one provider, ai-inference's Anthropic-shaped route.

    pi resolves ``$NAME`` when it calls, so the token stays out of the file:
    the runtime's token is in the process's environment, never on the
    workspace. It speaks the Messages API there: its OpenAI-shaped messages
    carry content parts, which ai-inference's chat completions refuse.
    """
    from agentspecs.models import get_model

    spec = get_model(model)
    bedrock = model.removeprefix("bedrock:")
    described: dict[str, Any] = {"id": bedrock, "name": bedrock, "input": ["text"]}
    if spec is not None and spec.context_window:
        described["contextWindow"] = spec.context_window
    if spec is not None and spec.tokens_limit:
        described["maxTokens"] = spec.tokens_limit
    return json.dumps(
        {
            "$schema": "https://pi.dev/schemas/models.schema.json",
            "providers": {
                PI_PROVIDER: {
                    "name": "Datalayer (ai-inference)",
                    "baseUrl": base_url,
                    "api": "anthropic-messages",
                    "apiKey": f"${INFERENCE_TOKEN_VARIABLE}",
                    "authHeader": True,
                    "headers": dict(headers or {}),
                    "models": [described],
                }
            },
        }
    )


def pi_settings(model: str) -> str:
    """Write pi's ``settings.json``: it starts on ai-inference's model, and says nothing of itself."""
    return json.dumps(
        {
            "defaultProvider": PI_PROVIDER,
            "defaultModel": model.removeprefix("bedrock:"),
            "quietStartup": True,
        }
    )


def write_config_directory(
    route: "Route",
    workspace: Path,
    base_url: str,
    *,
    model: str | None = None,
    headers: Mapping[str, str] | None = None,
) -> Path:
    """Write the configuration directory of a routed harness that reads one; its path.

    It holds no token. ``model`` is the catalogue model the harness calls, the
    platform's default unsaid; ``headers`` go with each call.
    """
    if route.directory_variable != PI_DIRECTORY_VARIABLE:
        raise ValueError(
            f"No configuration directory is written for {route.directory_variable!r}."
        )
    from agent_runtimes.specs.models import DEFAULT_MODEL

    chosen = model or DEFAULT_MODEL.value
    directory = workspace / CONFIG_DIRECTORY / "pi"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "models.json").write_text(
        pi_models(base_url, model=chosen, headers=headers), encoding="utf-8"
    )
    (directory / "settings.json").write_text(pi_settings(chosen), encoding="utf-8")
    return directory


@dataclass(frozen=True)
class Route:
    """How one harness's model calls go through ai-inference."""

    #: ai-inference's route, under its v1 root.
    path: str
    #: The variable the harness reads its base URL from.
    base_url_variable: str
    #: The variable the harness reads its credential from: given the runtime's token.
    token_variable: str
    #: The variable the harness reads its configuration from inline, when it
    #: reads no base-URL variable: written by :func:`inline_config`.
    config_variable: str | None = None
    #: The variable the harness reads a configuration directory from, when it
    #: reads no base-URL variable: written by :func:`write_config_directory`.
    directory_variable: str | None = None
    #: The application's headers go in this variable, when the harness reads
    #: them from one rather than from its configuration.
    headers_variable: str | None = None
    #: Fixed variables the harness is given.
    environment: Mapping[str, str] = field(default_factory=dict)


#: The harnesses whose model calls go through ai-inference on Datalayer; the
#: only ones offered there.
ROUTES: dict[str, Route] = {
    "claude-code": Route(
        ANTHROPIC_ROUTE,
        BASE_URL_VARIABLE,
        AUTH_TOKEN_VARIABLE,
        headers_variable="ANTHROPIC_CUSTOM_HEADERS",
    ),
    # OpenCode (the user's decision, 29 October 2026): ai-inference's own
    # chat completions, on the platform's models and the account's credits,
    # through its own provider configuration.
    "opencode": Route(
        CHAT_COMPLETIONS_ROUTE,
        INFERENCE_BASE_URL_VARIABLE,
        INFERENCE_TOKEN_VARIABLE,
        config_variable=OPENCODE_CONFIG_VARIABLE,
    ),
    # pi: the Anthropic-shaped route, through its own configuration directory.
    # It fetches its model catalogue and checks its version from pi.dev, which
    # the pod's boundary refuses: it is told not to.
    "pi": Route(
        ANTHROPIC_ROUTE,
        INFERENCE_BASE_URL_VARIABLE,
        INFERENCE_TOKEN_VARIABLE,
        directory_variable=PI_DIRECTORY_VARIABLE,
        environment={
            "PI_OFFLINE": "1",
            "PI_SKIP_VERSION_CHECK": "1",
            "PI_TELEMETRY": "0",
        },
    ),
}


def on_datalayer(environment: Mapping[str, str] | None = None) -> bool:
    """Whether this runtime calls its models through ai-inference."""
    source = os.environ if environment is None else environment
    provider = (
        (source.get("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE") or "").strip().lower()
    )
    return provider == "datalayer" and bool(
        (source.get("DATALAYER_AI_INFERENCE_URL") or "").strip()
    )


def refusal(
    harness: Any, environment: Mapping[str, str] | None = None
) -> str | None:
    """Why a harness is not offered here, in a sentence, or ``None`` when it is.

    On Datalayer a harness is served only when its model calls go through
    ai-inference; anywhere else it runs on the person's own key.
    """
    if not on_datalayer(environment) or harness.id in ROUTES:
        return None
    why = NOT_OFFERED_BECAUSE.get(
        harness.id, "its model calls would not go through ai-inference"
    )
    return (
        f"{harness.name} is not offered on Datalayer: {why}. "
        f"Run it locally on your own key with `loop --harness {harness.id}`."
    )


def route_of(
    harness_id: str, environment: Mapping[str, str] | None = None
) -> Route | None:
    """How a harness's calls go through ai-inference here, or ``None`` when they do not."""
    if harness_id in ROUTES and on_datalayer(environment):
        return ROUTES[harness_id]
    return None


def fixed_environment(harness_id: str, route: Route) -> dict[str, str]:
    """The fixed variables a routed harness is given."""
    if harness_id == "claude-code":
        return claude_code_environment()
    return dict(route.environment)


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
    "OPENCODE_PROVIDER",
    "OPENCODE_CONFIG_VARIABLE",
    "OPENCODE_PERMISSION_KEYS",
    "PI_PROVIDER",
    "asking_config",
    "claude_code_environment",
    "custom_headers",
    "fixed_environment",
    "refusal",
    "write_config_directory",
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
    "anthropic_base_url",
    "on_datalayer",
    "routed_token",
]
