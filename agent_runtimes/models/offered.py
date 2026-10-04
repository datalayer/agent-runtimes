# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The models an agent offers, and which of them datalayer-ai-inference serves.

An agentspec names its ``model`` and, optionally, ``model_additionals``: the
other models of the catalogue it may be switched to. Which of them can be
used is not the spec's to say. When the runtime routes inference through
datalayer-ai-inference, the service's own list decides: it is asked once, at
startup (``GET {ai-inference}/models``), and kept.

When the service is not asked (no ``DATALAYER_AI_INFERENCE_URL``) or does not
answer, that is said in a sentence — logged, and carried by the config the
chat and the CLI read (``source`` ``local`` and its ``note``) — and the models
are then judged on this runtime's own configuration alone: its keys and the
catalogue's entitlement, unchecked against the service.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any, Literal, Mapping

logger = logging.getLogger(__name__)

#: How long the one request to ai-inference may take at startup.
INFERENCE_MODELS_TIMEOUT = 10.0

#: ai-inference names a model as LiteLLM does; the catalogue as agentspecs does.
_LITELLM_PREFIXES = (
    ("bedrock/", "bedrock:"),
    ("azure/", "azure-openai:"),
    ("alibaba/", "alibaba:"),
)

ModelsSource = Literal["ai-inference", "local"]


@dataclass(frozen=True)
class InferenceModels:
    """What ai-inference said it serves, or why it was not asked or did not say."""

    #: Catalogue ids the service lists, in its order; ``None`` when unknown.
    served: tuple[str, ...] | None
    #: The service's v1 root, when one is configured.
    url: str | None
    #: The answer in a sentence, for the log and for whoever lists models.
    note: str


_state: InferenceModels | None = None
_lock = asyncio.Lock()


def catalogue_id(name: str) -> str | None:
    """The catalogue's id for a model as ai-inference names it, or ``None``.

    ``bedrock/us.anthropic.claude-sonnet-4-6`` → ``bedrock:us.anthropic.claude-sonnet-4-6``;
    an id the catalogue knows by an older name (its aliases) answers with
    today's.
    """
    from agent_runtimes.specs.models import get_model

    value = (name or "").strip()
    for litellm_prefix, catalogue_prefix in _LITELLM_PREFIXES:
        if value.startswith(litellm_prefix):
            value = catalogue_prefix + value[len(litellm_prefix) :]
            break
    spec = get_model(value) if value else None
    return spec.id if spec is not None else None


def read_served(payload: Mapping[str, Any]) -> list[str]:
    """The catalogue ids in ai-inference's ``/models`` answer.

    The service lists its default provider's models in ``models`` and, beside
    them, the Bedrock and Cloudflare chat models it serves; a name the
    catalogue does not know is left out.
    """
    names: list[Any] = [
        *(payload.get("models") or []),
        *(payload.get("bedrock_anthropic_models") or []),
        *(payload.get("cloudflare_models") or []),
    ]
    served: list[str] = []
    for name in names:
        if not isinstance(name, str):
            continue
        model_id = catalogue_id(name)
        if model_id is None:
            logger.debug("ai-inference serves %s, which the catalogue does not know.", name)
        elif model_id not in served:
            served.append(model_id)
    return served


def _token() -> str | None:
    """The token this runtime calls ai-inference with (see ``resolve_model_for_inference_provider``)."""
    return os.getenv("DATALAYER_AI_INFERENCE_API_KEY") or os.getenv("DATALAYER_API_KEY")


async def load_inference_models(*, refresh: bool = False) -> InferenceModels:
    """Ask ai-inference which models it serves — once, then keep the answer."""
    global _state
    async with _lock:
        if _state is not None and not refresh:
            return _state
        from agent_runtimes.models.models import _normalize_ai_inference_base_url

        raw_url = (os.getenv("DATALAYER_AI_INFERENCE_URL") or "").strip()
        if not raw_url:
            _state = InferenceModels(
                served=None,
                url=None,
                note=(
                    "No ai-inference is configured (DATALAYER_AI_INFERENCE_URL is "
                    "unset): the models offered are those this runtime is "
                    "configured for."
                ),
            )
            logger.info(_state.note)
            return _state

        url = _normalize_ai_inference_base_url(raw_url)
        token = _token()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            import httpx

            async with httpx.AsyncClient(timeout=INFERENCE_MODELS_TIMEOUT) as client:
                response = await client.get(f"{url}/models", headers=headers)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("its answer is not an object")
            served = read_served(payload)
        except Exception as error:  # noqa: BLE001 - said in a sentence, below
            _state = InferenceModels(
                served=None,
                url=url,
                note=(
                    f"ai-inference at {url} did not list its models ({error}): "
                    "the models offered are only those this runtime is "
                    "configured for, unchecked against it."
                ),
            )
            logger.warning(_state.note)
            return _state

        _state = InferenceModels(
            served=tuple(served),
            url=url,
            note=(
                f"ai-inference at {url} serves {', '.join(served)}."
                if served
                else f"ai-inference at {url} serves none of the catalogue's models."
            ),
        )
        logger.info(_state.note)
        return _state


def inference_models() -> InferenceModels | None:
    """The kept answer, or ``None`` before ai-inference was asked."""
    return _state


def set_inference_models(state: InferenceModels | None) -> None:
    """Replace the kept answer (tests, and a deliberate refresh)."""
    global _state
    _state = state


def models_source(inference_provider: str | None = None) -> tuple[ModelsSource, str]:
    """Who decides which models can be used, and that in a sentence."""
    from agent_runtimes.models.models import effective_inference_provider

    provider = inference_provider or effective_inference_provider()
    if provider != "datalayer":
        return (
            "local",
            "This runtime calls the providers itself: the models offered are "
            "those its own keys reach.",
        )
    state = _state
    if state is None:
        return (
            "local",
            "ai-inference has not been asked yet: the models offered are those "
            "this runtime is configured for.",
        )
    if state.served is None:
        return "local", state.note
    return "ai-inference", state.note


def availability(
    model_id: str, inference_provider: str | None = None
) -> tuple[bool, str | None]:
    """Whether a model can be used here, and why not when it cannot."""
    from agent_runtimes.models.models import (
        credentials_ready,
        effective_inference_provider,
    )
    from agent_runtimes.specs.models import get_model

    spec = get_model(model_id)
    if spec is None:
        return False, "Not in the models catalogue"
    provider = inference_provider or effective_inference_provider()
    state = _state
    if (
        provider == "datalayer"
        and not spec.local
        and state is not None
        and state.served is not None
    ):
        if spec.id in state.served:
            return True, None
        return False, "Not served by ai-inference"
    entitled = getattr(spec, "available", True)
    if not entitled:
        return False, "Not enabled for this deployment"
    if not credentials_ready(spec, provider):
        return False, "Missing API key"
    return True, None


def spec_model_ids(spec: Any) -> list[str]:
    """A spec's ``model`` and ``model_additionals``, in that order.

    The spec is an ``Agentspec`` or a mapping in either spelling.
    """
    if spec is None:
        return []
    if isinstance(spec, Mapping):
        model = spec.get("model")
        additionals = spec.get("model_additionals")
        if additionals is None:
            additionals = spec.get("modelAdditionals")
    else:
        model = getattr(spec, "model", None)
        additionals = getattr(spec, "model_additionals", None)
    ids = [model] if isinstance(model, str) and model.strip() else []
    ids.extend(m for m in additionals or [] if isinstance(m, str) and m.strip())
    return ids


def agent_inference_provider(agent_id: str | None) -> str:
    """Where an agent's inference goes: its creation spec's ``inference_provider``,
    else the runtime's (as the Vercel AI transport resolves it)."""
    from agent_runtimes.models.models import effective_inference_provider

    if agent_id:
        from agent_runtimes.routes.agents import get_stored_agent_spec

        stored = get_stored_agent_spec(agent_id) or {}
        provider = str(stored.get("inference_provider") or "").strip().lower()
        if provider in {"local", "datalayer"}:
            return provider
    return effective_inference_provider()


def offered_model_ids(agent_id: str | None) -> list[str] | None:
    """The models an agent of this runtime may run on, or ``None`` for no such agent.

    Its library spec's ``model`` and ``model_additionals``, those of the spec
    forwarded at its creation, and the model it was created with — the set
    stays the same when a switch moves ``model`` to one of the others.
    """
    if not agent_id:
        return None
    from agent_runtimes.routes.agents import (
        get_library_agent_spec,
        get_stored_agent_spec,
    )

    stored = get_stored_agent_spec(agent_id)
    if stored is None:
        return None
    library = None
    spec_id = stored.get("agent_spec_id")
    if isinstance(spec_id, str) and spec_id:
        library = get_library_agent_spec(spec_id)
    ids: list[str] = []
    for model_id in [
        *spec_model_ids(library),
        *spec_model_ids(stored.get("agent_spec")),
        *spec_model_ids({"model": stored.get("model")}),
    ]:
        if model_id not in ids:
            ids.append(model_id)
    return ids


def _canonical(model_id: str) -> str:
    """The catalogue's id for a model named by an alias; what was given otherwise."""
    from agent_runtimes.specs.models import get_model

    spec = get_model(model_id)
    return spec.id if spec is not None else model_id


def model_refusal(
    agent_id: str | None,
    model_id: str,
    inference_provider: str | None = None,
) -> str | None:
    """Why an agent may not be switched to a model, in a sentence, or ``None``.

    A model that is not one of the agent's is refused; so is one the agent's
    inference does not serve, when ai-inference said what it serves.
    """
    offered = offered_model_ids(agent_id)
    if offered is not None and _canonical(model_id) not in {
        _canonical(m) for m in offered
    }:
        return (
            f"{model_id} is not one of this agent's models "
            f"({', '.join(offered)}): nothing was switched."
        )
    refusal = inference_refusal(model_id, inference_provider)
    return f"{refusal}: nothing was switched." if refusal else None


def inference_refusal(
    model_id: str, inference_provider: str | None = None
) -> str | None:
    """Why ai-inference cannot run a model, in a sentence, or ``None``.

    Only when it was asked and answered: without its answer the runtime
    cannot tell, and says so in the config rather than here.
    """
    source, _ = models_source(inference_provider)
    if source != "ai-inference":
        return None
    usable, reason = availability(model_id, inference_provider)
    if usable or reason != "Not served by ai-inference":
        return None
    served = _state.served if _state is not None and _state.served else ()
    return (
        f"ai-inference does not serve {model_id}"
        + (f" (it serves {', '.join(served)})" if served else "")
    )


def model_rows(
    model_ids: list[str],
    tool_ids: list[str],
    inference_provider: str | None = None,
) -> list[Any]:
    """The config's rows for these models, each with whether it can be used and why not.

    Two reasons are not interchangeable and travel with the row: a missing
    key is something the reader can fix, a model this deployment is not
    entitled to — or that ai-inference does not serve — is not.
    """
    from agent_runtimes.specs.models import get_model
    from agent_runtimes.types import AIModelRuntime

    rows: list[AIModelRuntime] = []
    for model_id in model_ids:
        spec = get_model(model_id)
        usable, reason = availability(model_id, inference_provider)
        rows.append(
            AIModelRuntime(
                id=spec.id if spec is not None else model_id,
                name=spec.name if spec is not None else model_id,
                builtin_tools=tool_ids,
                required_env_vars=list(spec.required_env_vars) if spec else [],
                is_available=usable,
                unavailable_reason=reason,
            )
        )
    logger.debug(
        "%d of %d models can be used.", sum(1 for r in rows if r.is_available), len(rows)
    )
    return rows
