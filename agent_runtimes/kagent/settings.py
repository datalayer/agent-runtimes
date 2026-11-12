# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What ``agent-runtimes serve --target kagent`` is started with.

kagent (1.0) runs a BYO Harness's image as a Substrate actor, and hands it
its configuration as a bootstrap bundle that kagent-core materializes at
``/config/config.json``: an ``ADKConfig`` in ProtoJSON, with the proto field
names (``runtime``, ``agent.model``, ``agent.http_tools``, ...). The bridge
(:mod:`agent_runtimes.kagent.bridge`) materializes it and starts this server
as its child; this module reads what the server takes from it:

- **the agentspec** the actor serves, in ``AGENT_SPEC_ID`` (a literal value of
  the Harness's ``spec.env``);
- **the model** of the Agent's template, when it names one (a kagent
  ``ModelConfig``), as agent-runtimes' model and its provider's endpoint. The
  provider's key is not here: Substrate's egress gateway puts it in the
  request; the provider SDK reads the placeholder kagent sets in its usual
  variable;
- **the MCP servers** of the template's ``RemoteMCPServer`` tools, as remote
  Streamable HTTP servers.

The server listens on loopback: only the bridge, in the same actor, calls it.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional

#: The target's name, on ``serve --target`` and in ``AGENT_RUNTIMES_TARGET``.
TARGET = "kagent"

#: Where the target is written for the app the server loads.
TARGET_VARIABLE = "AGENT_RUNTIMES_TARGET"

#: The agentspec the actor serves.
SPEC_VARIABLE = "AGENT_SPEC_ID"

#: Where kagent-core materializes the actor's configuration.
CONFIG_VARIABLE = "KAGENT_CONFIG_PATH"
DEFAULT_CONFIG_PATH = "/config/config.json"

#: The loopback port the server listens on, for the bridge.
PORT_VARIABLE = "AGENT_RUNTIMES_KAGENT_PORT"
DEFAULT_PORT = 8765

#: Loopback: the bridge is the only caller.
HOST = "127.0.0.1"

#: The agent the spec is configured as, the one the bridge forwards to.
AGENT_ID = "default"

#: The A2A mount of that agent, under the server's API prefix.
A2A_PATH = f"/api/v1/a2a/agents/{AGENT_ID}/"

#: kagent's model providers agent-runtimes calls, and how: the agent-runtimes
#: model prefix, and the variable the provider SDK reads its endpoint from.
_PROVIDERS: dict[str, tuple[str, str]] = {
    "openai": ("openai", "OPENAI_BASE_URL"),
    "anthropic": ("anthropic", "ANTHROPIC_BASE_URL"),
    "bedrock": ("bedrock", "AWS_REGION"),
}

_ENV_NAME = re.compile(r"[^A-Za-z0-9_-]+")


@dataclass(frozen=True)
class KagentModel:
    """The model of the Agent's template, as agent-runtimes calls it."""

    #: ``<provider>:<model>``, agent-runtimes' model id.
    model_id: str
    #: The environment the provider SDK reads its endpoint from.
    env: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class KagentSettings:
    """Where the server listens, the agentspec it serves, what kagent configured."""

    spec_id: str
    host: str
    port: int
    model: Optional[KagentModel]
    mcp_servers: list[dict[str, Any]]


def read_adk_config(path: str | Path) -> dict[str, Any]:
    """Read the ADKConfig kagent-core materialized.

    Raises
    ------
    ValueError
        When the file is missing or is not a JSON object, in a sentence.
    """
    config_path = Path(path)
    if not config_path.is_file():
        raise ValueError(
            f"--target {TARGET} reads kagent's configuration at {config_path}, "
            "which does not exist: the bridge materializes it from the bootstrap bundle."
        )
    try:
        document = json.loads(config_path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise ValueError(f"{config_path} is not JSON: {error}.") from None
    if not isinstance(document, dict):
        raise ValueError(f"{config_path} is not a JSON object.")
    return document


def model_of(agent: Mapping[str, Any]) -> Optional[KagentModel]:
    """The template's model as agent-runtimes calls it, or ``None`` when it names none.

    Raises
    ------
    ValueError
        When the provider is one agent-runtimes does not call this way, in a sentence.
    """
    model = agent.get("model")
    if not isinstance(model, Mapping) or not model:
        return None
    name = str(model.get("model") or "").strip()
    provider = next((key for key in model if key in _KNOWN_PROVIDERS), None)
    if not name or provider is None:
        raise ValueError(
            "kagent's model configuration names no model or no provider: "
            f"{sorted(model)}."
        )
    if provider not in _PROVIDERS:
        raise ValueError(
            f"The Agent's ModelConfig is of provider {provider!r}; agent-runtimes "
            f"calls {sorted(_PROVIDERS)} under kagent. Use one of them (an OpenAI-"
            "compatible endpoint, such as Datalayer's ai-inference, is 'openai')."
        )
    prefix, variable = _PROVIDERS[provider]
    settings = model.get(provider) or {}
    if provider == "openai" and settings.get("api_format") == "responses":
        prefix = "openai-responses"
    endpoint = str(
        settings.get("region" if provider == "bedrock" else "base_url") or ""
    ).strip()
    return KagentModel(
        model_id=f"{prefix}:{name}",
        env={variable: endpoint} if endpoint else {},
    )


#: Every provider of ``ADKModelConfig``'s oneof, by its proto name.
_KNOWN_PROVIDERS = frozenset(
    {
        "openai",
        "azure_openai",
        "anthropic",
        "gemini_vertex_ai",
        "gemini_anthropic",
        "ollama",
        "gemini",
        "bedrock",
        "sap_ai_core",
        "foundry",
        "mistral",
    }
)


def server_id_of(url: str, taken: set[str]) -> str:
    """A server id for a kagent tool server, from its URL's host and path."""
    stem = re.sub(r"^https?://", "", url).strip("/")
    base = "kagent-" + (_ENV_NAME.sub("-", stem).strip("-").lower() or "mcp")
    candidate, n = base[:60], 2
    while candidate in taken:
        candidate, n = f"{base[:57]}-{n}", n + 1
    taken.add(candidate)
    return candidate


def mcp_servers_of(agent: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The template's RemoteMCPServer tools, as agent-runtimes' remote MCP servers.

    Each is a ``MCPServer`` body: a url, its headers (kagent's placeholders,
    which the egress gateway replaces), ``transport: streamable-http`` and no
    command.

    Raises
    ------
    ValueError
        For a tool binding agent-runtimes cannot honour as written — an SSE
        or stdio server, a tool selection, an approval, a token or header
        passthrough — rather than a server served with more than was bound.
    """
    for kind in ("sse_tools", "stdio_tools", "remote_agents", "sub_agents"):
        if agent.get(kind):
            raise ValueError(
                f"kagent configured {kind}; agent-runtimes serves Streamable HTTP "
                "RemoteMCPServer tools only under kagent."
            )
    servers: list[dict[str, Any]] = []
    taken: set[str] = set()
    for binding in agent.get("http_tools") or []:
        params = binding.get("params") or {}
        url = str(params.get("url") or "").strip()
        if not url:
            raise ValueError("A kagent MCP tool binding names no URL.")
        for refused, sentence in (
            ("tools", "selects tools"),
            ("require_approval", "asks for approvals"),
            ("token_passthrough", "passes the caller's token"),
            ("allowed_headers", "passes the caller's headers"),
        ):
            if binding.get(refused):
                raise ValueError(
                    f"The MCP tool binding of {url} {sentence}; agent-runtimes serves "
                    "the whole server under kagent and honours none of these. Remove "
                    f"'{refused}' from the Agent's template."
                )
        server_id = server_id_of(url, taken)
        servers.append(
            {
                "id": server_id,
                "name": server_id,
                "description": f"kagent RemoteMCPServer at {url}",
                "url": url,
                "headers": dict(params.get("headers") or {}),
                "transport": "streamable-http",
            }
        )
    return servers


def kagent_settings(
    environ: Optional[Mapping[str, str]] = None,
) -> KagentSettings:
    """The settings of a kagent actor, from its environment and kagent's configuration.

    Raises
    ------
    ValueError
        When ``AGENT_SPEC_ID`` is not set, the port is not one, or kagent's
        configuration cannot be served (`model_of`, `mcp_servers_of`), in a sentence.
    """
    env = os.environ if environ is None else environ
    spec_id = (env.get(SPEC_VARIABLE) or "").strip()
    if not spec_id:
        raise ValueError(
            f"--target {TARGET} serves the agentspec named by {SPEC_VARIABLE}, "
            "which is not set: set it in the Harness's spec.env."
        )
    said = (env.get(PORT_VARIABLE) or "").strip()
    if said and (not said.isdigit() or not 0 < int(said) < 65536):
        raise ValueError(f"{PORT_VARIABLE} is a port from 1 to 65535, not {said!r}.")
    document = read_adk_config(env.get(CONFIG_VARIABLE) or DEFAULT_CONFIG_PATH)
    agent = document.get("agent") or {}
    return KagentSettings(
        spec_id=spec_id,
        host=HOST,
        port=int(said) if said else DEFAULT_PORT,
        model=model_of(agent),
        mcp_servers=mcp_servers_of(agent),
    )


def is_kagent_target(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether the server was started with ``--target kagent``."""
    env = os.environ if environ is None else environ
    return (env.get(TARGET_VARIABLE) or "").strip() == TARGET


__all__ = [
    "A2A_PATH",
    "AGENT_ID",
    "CONFIG_VARIABLE",
    "DEFAULT_CONFIG_PATH",
    "DEFAULT_PORT",
    "HOST",
    "PORT_VARIABLE",
    "SPEC_VARIABLE",
    "TARGET",
    "TARGET_VARIABLE",
    "KagentModel",
    "KagentSettings",
    "is_kagent_target",
    "kagent_settings",
    "mcp_servers_of",
    "model_of",
    "read_adk_config",
    "server_id_of",
]
