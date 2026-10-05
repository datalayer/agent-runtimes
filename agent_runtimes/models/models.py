# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Model creation utilities for AI Agents."""

import logging
import os
from typing import Any, Mapping, Sequence

from pydantic_ai.settings import ModelSettings

from agent_runtimes.models.local import (
    LOCAL_PROVIDERS,
    build_local_model,
    is_local_model,
)
from agent_runtimes.specs.models import (
    AI_MODEL_CATALOGUE as AI_MODEL_CATALOGUE_DICT,
)
from agent_runtimes.types import AIModelRuntime

logger = logging.getLogger(__name__)


#: What a provider needs **in this process** when the runtime calls it itself.
#:
#: A model spec lists the environment variables its provider needs, and most
#: do. One kind cannot: a model whose credentials are held by
#: datalayer-ai-inference needs nothing here *when the runtime routes through
#: that service*, and its own key when the runtime calls the provider
#: directly — which is what the local inference provider does. The spec has
#: one field for two deployments, so it says "nothing needed" and this fills
#: the other half in.
#:
#: Alibaba's Qwen models are the case that showed it: the menu offered them as
#: ready on a machine with no key, and pydantic-ai answered "Set the
#: `ALIBABA_API_KEY` environment variable" when one was picked.
#:
#: Any one of the names is enough — they are alternatives, not a set.
DIRECT_PROVIDER_CREDENTIALS: dict[str, tuple[str, ...]] = {
    "alibaba": ("ALIBABA_API_KEY", "DASHSCOPE_API_KEY"),
    # Cloudflare Workers AI: the token, and the account it belongs to (below).
    "cloudflare": ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY"),
}

#: What a direct call needs beside its key: a Cloudflare call is made to the
#: account's own endpoint, so the account id is not optional.
DIRECT_PROVIDER_ACCOUNTS: dict[str, tuple[str, ...]] = {
    "cloudflare": ("CLOUDFLARE_ACCOUNT_ID",),
}

#: Where a direct Cloudflare call goes: the account's AI Gateway when one is
#: named (`CLOUDFLARE_GATEWAY`, `default` unless empty), else Workers AI's
#: own OpenAI-compatible endpoint. The same two routes ai-inference takes.
CLOUDFLARE_GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1"
CLOUDFLARE_DIRECT_BASE = "https://api.cloudflare.com/client/v4/accounts"


#: The flavour a Cloudflare id carries after the provider: ``wrk`` is a model
#: Cloudflare hosts (Workers AI), ``gtw`` one its AI Gateway fronts. The older
#: spelling without a flavour is read as ``wrk``.
CLOUDFLARE_FLAVOURS = ("wrk", "gtw")


def cloudflare_flavour(model_name: str) -> tuple[str, str]:
    """``wrk/openai/gpt-oss-120b`` → ``("wrk", "openai/gpt-oss-120b")``; no flavour reads as ``wrk``."""
    head, sep, rest = model_name.partition("/")
    if sep and head in CLOUDFLARE_FLAVOURS:
        return head, rest
    return "wrk", model_name


def cloudflare_direct_route(model_name: str) -> tuple[str, str, str]:
    """The base URL, the token and the model name for a direct Cloudflare call.

    A Workers AI model (``wrk``) goes through the account's gateway when one
    is named, else to Workers AI's own endpoint; a gateway model (``gtw``)
    has no endpoint but the gateway, ``default`` unless told.
    """
    account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "").strip()
    token = (
        os.environ.get("CLOUDFLARE_API_TOKEN")
        or os.environ.get("CLOUDFLARE_API_KEY")
        or ""
    ).strip()
    gateway = os.environ.get("CLOUDFLARE_GATEWAY", "default").strip().strip("/")
    flavour, bare = cloudflare_flavour(model_name)
    if flavour == "gtw":
        gateway = gateway or "default"
    name = bare if bare.startswith("@cf/") else f"@cf/{bare}"
    if gateway:
        return (
            f"{CLOUDFLARE_GATEWAY_BASE}/{account}/{gateway}/compat",
            token,
            f"workers-ai/{name}",
        )
    return f"{CLOUDFLARE_DIRECT_BASE}/{account}/ai/v1", token, name


def effective_inference_provider() -> str:
    """Where inference is sent: `local` (the provider itself) or `datalayer`."""
    try:
        # Imported here, not above: the routes import this module.
        from agent_runtimes.routes.configure import (  # noqa: PLC0415
            get_effective_inference_provider,
        )

        return str(get_effective_inference_provider())
    except Exception:  # noqa: BLE001 - a missing route is not a credential answer
        configured = (
            (os.environ.get("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE") or "")
            .strip()
            .lower()
        )
        return configured if configured in {"local", "datalayer"} else "local"


def credentials_ready(spec_model: Any, inference_provider: str | None = None) -> bool:
    """Whether this model can be called right now, credentials-wise.

    The spec's own environment variables, and — when the runtime calls the
    provider directly — the provider's key as well (see
    {@link DIRECT_PROVIDER_CREDENTIALS}). A local model answers on
    reachability instead, which its own discovery does.
    """
    if not check_env_vars_available(list(getattr(spec_model, "required_env_vars", ()))):
        return False
    provider = inference_provider or effective_inference_provider()
    if provider == "datalayer":
        # The inference service holds the keys; this process needs none.
        return True
    if is_local_model(getattr(spec_model, "id", "")):
        return True
    provider_name = str(getattr(spec_model, "provider", ""))
    alternatives = DIRECT_PROVIDER_CREDENTIALS.get(provider_name, ())
    if not alternatives:
        return True
    accounts = DIRECT_PROVIDER_ACCOUNTS.get(provider_name, ())
    return any(os.environ.get(name) for name in alternatives) and all(
        os.environ.get(name) for name in accounts
    )


def _normalize_ai_inference_base_url(raw_url: str | None) -> str:
    """Normalize Datalayer AI Inference base URL to the v1 API root."""
    base = (raw_url or "http://localhost:4450").strip().rstrip("/")
    if base.endswith("/api/ai-inference/v1"):
        return base
    if base.endswith("/api/ai-inference"):
        return f"{base}/v1"
    return f"{base}/api/ai-inference/v1"


#: The headers datalayer-ai-inference reads the application and deployment
#: of a call from, and stamps on its usage record (LOOP R-09). Spelled as
#: ``datalayer_common.usage_dimensions`` spells them.
APP_UID_HEADER = "X-Datalayer-App-Uid"
DEPLOYMENT_UID_HEADER = "X-Datalayer-Deployment-Uid"

#: The application instance each agent of this runtime serves, by agent id:
#: what a model resolved again for one request (the Vercel AI transport) is
#: attributed with, as the agent's own model was at creation.
_APP_INSTANCES: dict[str, dict[str, Any]] = {}


def remember_app_instance(
    agent_id: str, app_instance: Mapping[str, Any] | None
) -> None:
    """Keep the application instance an agent serves; ``None`` forgets it."""
    if app_instance:
        _APP_INSTANCES[agent_id] = dict(app_instance)
    else:
        _APP_INSTANCES.pop(agent_id, None)


def app_instance_of(agent_id: str | None) -> dict[str, Any] | None:
    """The application instance an agent serves, or ``None``."""
    return _APP_INSTANCES.get(agent_id or "")


def app_usage_headers(app_instance: Mapping[str, Any] | None) -> dict[str, str]:
    """The headers naming an application's instance on a model call.

    Its ``app_uid`` and, when it is a deployment's, its ``deployment_uid``:
    ai-inference meters the call on the caller's account with both, so the
    owner reads what each application and each deployment spent. A Preview
    or a test has its application and no deployment; an agent no
    application runs sends neither.
    """
    if not app_instance:
        return {}
    app_uid = str(app_instance.get("app_uid") or "").strip()
    if not app_uid:
        return {}
    headers = {APP_UID_HEADER: app_uid}
    deployment_uid = str(app_instance.get("deployment_uid") or "").strip()
    if deployment_uid:
        headers[DEPLOYMENT_UID_HEADER] = deployment_uid
    return headers


def _create_inference_http_client(
    timeout: Any,
    *,
    source: str,
    follow_redirects: bool = True,
    headers: Mapping[str, str] | None = None,
) -> Any:
    """Create an httpx AsyncClient that logs outbound inference request URLs."""
    import httpx

    async def _log_request(request: httpx.Request) -> None:
        logger.info(
            "Inference HTTP request via %s: %s %s",
            source,
            request.method,
            request.url,
        )

    return httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=follow_redirects,
        headers=dict(headers or {}),
        event_hooks={"request": [_log_request]},
    )


def check_env_vars_available(required_vars: Sequence[str]) -> bool:
    """
    Check if all required environment variables are set.

    Args:
        required_vars: List of environment variable names

    Returns:
        True if all variables are set, False otherwise
    """
    return all(os.getenv(var) for var in required_vars)


def get_model_string(model_provider: str, model_name: str) -> str:
    """
    Convert model provider and name to pydantic-ai model string format.

    Args:
        model_provider: Provider name (azure-openai, openai, anthropic, github-copilot, etc.)
        model_name: Model/deployment name

    Returns:
        Model string in format 'provider:model'
        For Azure OpenAI, returns the model name and sets provider via create_model_with_provider()

    Note:
        For Azure OpenAI, the returned string is just the model name.
        The Azure provider configuration is handled separately via OpenAIModel(provider='azure').
        Required env vars for Azure:
        - AZURE_OPENAI_API_KEY
        - AZURE_OPENAI_ENDPOINT (base URL only, e.g., https://your-resource.openai.azure.com)
        - AZURE_OPENAI_API_VERSION (optional, defaults to latest)
    """
    # For Azure OpenAI, we return just the model name
    # The provider will be set to 'azure' when creating the OpenAIModel
    if model_provider.lower() == "azure-openai":
        return model_name

    # Map provider names to pydantic-ai format for other providers
    provider_map = {
        "openai": "openai",
        "anthropic": "anthropic",
        "github-copilot": "openai",  # GitHub Copilot uses OpenAI models
        "bedrock": "bedrock",
        "google": "google",
        "gemini": "google",
        "groq": "groq",
        "mistral": "mistral",
        "cohere": "cohere",
    }

    provider = provider_map.get(model_provider.lower(), model_provider)
    return f"{provider}:{model_name}"


def create_model_with_provider(
    model_provider: str,
    model_name: str,
    timeout: float = 60.0,
) -> Any:
    """
    Create a pydantic-ai model object with the appropriate provider configuration.

    This is necessary for providers like Azure OpenAI that need special initialization
    and timeout configuration.

    Args:
        model_provider: Provider name (e.g., 'azure-openai', 'openai', 'anthropic')
        model_name: Model/deployment name
        timeout: HTTP timeout in seconds (default: 60.0)

    Returns:
        Model object or string for pydantic-ai Agent

    Note:
        For Azure OpenAI, requires these environment variables:
        - AZURE_OPENAI_API_KEY
        - AZURE_OPENAI_ENDPOINT (base URL only, e.g., https://your-resource.openai.azure.com)
        - AZURE_OPENAI_API_VERSION (optional, defaults to latest)
    """
    # Create httpx timeout configuration with generous connect timeout
    # connect timeout is separate from read/write timeout
    import httpx

    http_timeout = httpx.Timeout(timeout, connect=30.0)

    logger.info(f"Creating model with timeout: {timeout}s (read/write), connect: 30.0s")

    if model_provider == "azure-openai" or model_provider == "azure":
        from openai import AsyncAzureOpenAI
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers import infer_provider
        from pydantic_ai.providers.openai import OpenAIProvider

        # Infer Azure provider to get configuration
        azure_provider = infer_provider("azure")

        # Extract base URL - remove /openai suffix since AsyncAzureOpenAI adds it
        base_url = str(azure_provider.client.base_url)
        # base_url is like: https://xxx.openai.azure.com/openai/
        # AsyncAzureOpenAI expects: https://xxx.openai.azure.com (it adds /openai automatically)
        azure_endpoint = base_url.rstrip("/").rsplit("/openai", 1)[0]

        # Create AsyncAzureOpenAI client with custom timeout
        azure_client = AsyncAzureOpenAI(
            azure_endpoint=azure_endpoint,
            azure_deployment=model_name,
            api_version=azure_provider.client.default_query.get("api-version"),
            api_key=azure_provider.client.api_key,
            timeout=http_timeout,
        )

        # Wrap in OpenAIProvider
        azure_provider_with_timeout = OpenAIProvider(openai_client=azure_client)

        return OpenAIChatModel(
            model_name,
            provider=azure_provider_with_timeout,
            settings=ModelSettings(parallel_tool_calls=False, temperature=0),
        )
    elif model_provider.lower() == "anthropic":
        from anthropic import AsyncAnthropic
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider

        # Create Anthropic client with custom timeout and longer connect timeout
        # Note: Many corporate networks block Anthropic API, use Azure/OpenAI if connection fails
        anthropic_client = AsyncAnthropic(
            timeout=httpx.Timeout(
                timeout, connect=60.0
            ),  # Longer connect timeout for slow/restricted networks
            max_retries=2,
        )

        # Wrap in AnthropicProvider
        anthropic_provider = AnthropicProvider(anthropic_client=anthropic_client)

        return AnthropicModel(
            model_name,
            provider=anthropic_provider,
            settings=ModelSettings(parallel_tool_calls=False, temperature=0),
        )
    elif model_provider.lower() in ["openai", "github-copilot"]:
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers import infer_provider
        from pydantic_ai.providers.openai import OpenAIProvider

        # For OpenAI, create OpenAIChatModel with custom http_client via provider
        # First infer the OpenAI provider to get base_url, then pass custom http_client
        http_client = httpx.AsyncClient(timeout=http_timeout, follow_redirects=True)

        # Infer OpenAI provider first to get proper configuration
        openai_provider_base = infer_provider("openai")

        # Create new provider with same base_url but custom http_client
        openai_provider = OpenAIProvider(
            base_url=str(openai_provider_base.client.base_url), http_client=http_client
        )

        return OpenAIChatModel(
            model_name,
            provider=openai_provider,
            settings=ModelSettings(parallel_tool_calls=False, temperature=0),
        )
    elif model_provider.lower() == "cloudflare":
        # Workers AI speaks the OpenAI wire format: an OpenAI model over the
        # account's gateway (or Workers AI's own endpoint), with its token.
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        base_url, token, name = cloudflare_direct_route(model_name)
        provider = OpenAIProvider(
            base_url=base_url,
            api_key=token or "cloudflare",
            http_client=_create_inference_http_client(
                http_timeout, source="cloudflare"
            ),
        )
        return OpenAIChatModel(
            name,
            provider=provider,
            settings=ModelSettings(parallel_tool_calls=False, temperature=0),
        )
    elif model_provider.lower() in LOCAL_PROVIDERS:
        # Ollama, LM Studio, vLLM and llama.cpp all speak OpenAI-compatible
        # HTTP, so one branch serves every local runtime.
        from agent_runtimes.models.local import build_local_model

        return build_local_model(
            f"{model_provider.lower()}:{model_name}", timeout=timeout
        )
    else:
        # For other providers, use the standard string format
        # Note: String format doesn't allow custom timeout configuration
        return get_model_string(model_provider, model_name)


def resolve_model_for_inference_provider(
    model: str,
    inference_provider: str | None = None,
    timeout: float = 60.0,
    app_instance: Mapping[str, Any] | None = None,
) -> Any:
    """Return a model object/string honoring the requested inference provider.

    - ``local`` (default): preserves existing direct model behavior.
    - ``datalayer``: routes OpenAI-compatible requests through the
      datalayer-ai-inference service URL, naming ``app_instance``'s
      application and deployment on every call (``app_usage_headers``).
    """
    # A local model is routed to the machine it runs on, whatever inference
    # provider was requested: sending a prompt meant for Ollama to a hosted
    # gateway is never what the person choosing it wanted.
    if is_local_model(model):
        local_model = build_local_model(model, timeout=timeout)
        if local_model is not None:
            return local_model

    provider = (inference_provider or "local").strip().lower()
    if provider in {"", "local"}:
        logger.info(
            "Routing model '%s' with local inference provider (direct model backend; no datalayer-ai-inference endpoint).",
            model,
        )
        return model

    if provider != "datalayer":
        logger.warning(
            "Unknown inference provider '%s'; falling back to local model routing.",
            provider,
        )
        logger.info(
            "Routing model '%s' with local inference provider after fallback.",
            model,
        )
        return model

    import httpx
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    from agent_runtimes.models.offered import inference_api_key

    http_timeout = httpx.Timeout(timeout, connect=30.0)
    base_url = _normalize_ai_inference_base_url(os.getenv("DATALAYER_AI_INFERENCE_URL"))

    # The token is read as each call is made, not now: a pooled runtime builds
    # its agent before it is assigned and given its token, and a call without
    # one is refused in a sentence (``InferenceTokenMissing``), never made
    # with another key. A deployment's agent calls with its application's
    # principal's token, and only with it (LOOP I-03).
    from agent_runtimes.loop.apps.principal import api_key_for, deployment_of
    from agent_runtimes.loop.apps.visitors import turn_api_key, visitors_runtime

    deployment = deployment_of(app_instance)
    # On the visitors' runtime, every call is a visitor's, with their token
    # and nothing else (LOOP R-30).
    api_key = (
        turn_api_key
        if visitors_runtime()
        else api_key_for(deployment)
        if deployment
        else inference_api_key
    )
    provider = OpenAIProvider(
        openai_client=AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            http_client=_create_inference_http_client(
                http_timeout,
                source="datalayer-ai-inference",
                headers=app_usage_headers(app_instance),
            ),
        )
    )
    logger.info(
        "Routing model '%s' through datalayer-ai-inference at %s",
        model,
        base_url,
    )
    return OpenAIChatModel(
        model,
        provider=provider,
        settings=ModelSettings(parallel_tool_calls=False, temperature=0),
    )


def create_default_models(tool_ids: list[str]) -> list[AIModelRuntime]:
    """
    Create default AI model configurations from the generated model catalogue.

    Each model with its availability, as ``agent_runtimes.models.offered``
    decides it: ai-inference's own list when the runtime routes through it
    and it answered, else entitlement and credentials here.

    Args:
        tool_ids: List of tool IDs to associate with models

    Returns:
        List of AIModelRuntime configurations.
    """
    from agent_runtimes.models.offered import model_rows

    return model_rows(list(AI_MODEL_CATALOGUE_DICT), tool_ids)
