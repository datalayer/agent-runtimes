# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Models that run on the user's own machine.

Every local runtime worth supporting — Ollama, LM Studio, vLLM, llama.cpp's
server — speaks OpenAI-compatible HTTP. That is the whole trick: one code path
serves four runtimes, and adding a fifth is a table entry rather than a branch.

Two things here that hosted models do not need:

*Reachability.* A hosted model is available when its API key is set. A local
model is available when something is actually listening on a port, which is a
question only answerable at the moment someone asks. The catalog stays the
source of truth for what is *offerable*; discovery only reports what is
*reachable right now*.

*Honesty about capability.* A 7B model calls tools badly, and this is a
tool-calling product. Capabilities are declared on the spec so the answer at
selection time is a warning, not a puzzling failure three turns later.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LocalProvider:
    """A locally-hosted, OpenAI-compatible model runtime."""

    #: Provider id as it appears in a model spec (`ollama:llama3.1:8b`).
    name: str
    #: Human name for the panel.
    label: str
    #: Default OpenAI-compatible base URL.
    default_base_url: str
    #: Environment variable overriding the base URL.
    base_url_env: str
    #: Path listing installed models, relative to the host (not the /v1 base).
    #: Ollama has its own; the others answer the OpenAI `/v1/models` route.
    tags_path: str = "/v1/models"
    #: Where the model names live in the response.
    tags_key: str = "data"
    #: Field holding a model's name in each entry.
    tags_name_field: str = "id"

    def base_url(self) -> str:
        """Base URL for this provider, honouring its environment override."""
        override = (os.getenv(self.base_url_env) or "").strip()
        if not override:
            return self.default_base_url
        # OLLAMA_HOST is conventionally a host root, not an OpenAI base.
        if not override.rstrip("/").endswith("/v1"):
            return override.rstrip("/") + "/v1"
        return override.rstrip("/")

    def tags_url(self) -> str:
        """URL listing the models actually installed."""
        root = self.base_url()
        if self.tags_path.startswith("/v1"):
            return root + self.tags_path[len("/v1") :]
        return root[: -len("/v1")] + self.tags_path


LOCAL_PROVIDERS: dict[str, LocalProvider] = {
    "ollama": LocalProvider(
        name="ollama",
        label="Ollama",
        default_base_url="http://localhost:11434/v1",
        base_url_env="OLLAMA_HOST",
        tags_path="/api/tags",
        tags_key="models",
        tags_name_field="name",
    ),
    "lmstudio": LocalProvider(
        name="lmstudio",
        label="LM Studio",
        default_base_url="http://localhost:1234/v1",
        base_url_env="LMSTUDIO_BASE_URL",
    ),
    "vllm": LocalProvider(
        name="vllm",
        label="vLLM",
        default_base_url="http://localhost:8000/v1",
        base_url_env="VLLM_BASE_URL",
    ),
    "llama-cpp": LocalProvider(
        name="llama-cpp",
        label="llama.cpp",
        default_base_url="http://localhost:8080/v1",
        base_url_env="LLAMA_CPP_BASE_URL",
    ),
}

#: Sandbox variant a session moves to when a local model is selected, so the
#: code stays on the machine the tokens never left.
LOCAL_SANDBOX_VARIANT = "jupyter-server"

#: Capability a model must declare before codemode is trusted to it.
CODEMODE_CAPABILITY = "codemode"


def split_model_id(model_id: str) -> tuple[str, str]:
    """Split ``provider:name`` into its parts, keeping colons in the name.

    Ollama names contain colons (``llama3.1:8b``), so only the first one
    separates the provider.
    """
    provider, _, name = str(model_id or "").partition(":")
    return provider.strip().lower(), name.strip()


def get_local_provider(model_id: str) -> Optional[LocalProvider]:
    """The local provider behind a model id, or ``None`` if it is hosted."""
    provider, _ = split_model_id(model_id)
    return LOCAL_PROVIDERS.get(provider)


def is_local_model(model_id: str) -> bool:
    """Whether this model runs on the user's own machine."""
    return get_local_provider(model_id) is not None


def build_local_model(model_id: str, timeout: float = 60.0) -> Any:
    """Build a pydantic-ai model for a local runtime.

    Returns ``None`` when the id is not a local one, so callers can fall
    through to their existing routing.
    """
    provider_spec = get_local_provider(model_id)
    if provider_spec is None:
        return None

    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider
    from pydantic_ai.settings import ModelSettings

    # httpx2, not httpx: pydantic-ai deprecated httpx clients for
    # OpenAI-compatible providers, and a local runtime is a new code path with
    # no reason to inherit that.
    import httpx2

    _, model_name = split_model_id(model_id)
    base_url = provider_spec.base_url()
    # Local servers accept any key; some refuse an empty one outright.
    api_key = (
        os.getenv("LOCAL_MODEL_API_KEY")
        or os.getenv(f"{provider_spec.name.upper().replace('-', '_')}_API_KEY")
        or "local"
    )

    logger.info(
        "Routing model '%s' to the local %s runtime at %s",
        model_id,
        provider_spec.label,
        base_url,
    )
    return OpenAIChatModel(
        model_name,
        provider=OpenAIProvider(
            base_url=base_url,
            api_key=api_key,
            # A short connect timeout: when nothing is listening on the port,
            # the useful answer is "the runtime is not running", quickly.
            http_client=httpx2.AsyncClient(
                timeout=httpx2.Timeout(timeout, connect=5.0),
                follow_redirects=True,
            ),
        ),
        settings=ModelSettings(parallel_tool_calls=False, temperature=0),
    )


def discover_installed_models(
    provider_name: Optional[str] = None,
    timeout: float = 1.5,
) -> dict[str, tuple[str, ...]]:
    """Ask each local runtime what it actually has installed.

    Returns ``{provider: (model_name, ...)}`` for the runtimes that answered.
    A runtime that is not running is simply absent — this runs behind a prompt,
    so it is short-timeouted and never raises.
    """
    import httpx

    providers = (
        [LOCAL_PROVIDERS[provider_name]]
        if provider_name and provider_name in LOCAL_PROVIDERS
        else list(LOCAL_PROVIDERS.values())
    )

    found: dict[str, tuple[str, ...]] = {}
    for spec in providers:
        try:
            response = httpx.get(spec.tags_url(), timeout=timeout)
            response.raise_for_status()
            payload = response.json()
        except Exception as error:  # noqa: BLE001
            logger.debug("%s did not answer at %s: %s", spec.label, spec.tags_url(), error)
            continue

        entries = payload.get(spec.tags_key) if isinstance(payload, dict) else None
        if not isinstance(entries, list):
            continue

        names = tuple(
            str(entry.get(spec.tags_name_field))
            for entry in entries
            if isinstance(entry, dict) and entry.get(spec.tags_name_field)
        )
        found[spec.name] = names

    return found


def model_supports(model: Any, capability: str) -> bool:
    """Whether a model spec declares a capability.

    An empty capability list means *unstated*, not *incapable*: hosted models
    do not enumerate what they can do, and gating them would be a regression.
    Only a model that lists capabilities without this one is treated as unable.
    """
    declared = tuple(getattr(model, "capabilities", ()) or ())
    if not declared:
        return True
    return capability in declared


def capability_warning(model: Any) -> Optional[str]:
    """A sentence to show at selection when a model is weak at tool calling.

    Returns ``None`` when there is nothing to warn about.
    """
    if not getattr(model, "local", False):
        return None
    if model_supports(model, "tools"):
        return None
    return (
        "This model does not declare reliable tool calling. Codemode is off, "
        "and tool-heavy prompts may misfire."
    )
