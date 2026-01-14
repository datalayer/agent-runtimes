# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Model creation utilities for AI Agents."""

import logging
import os
from typing import Any

from pydantic_ai import ModelSettings
from agent_runtimes.types import AIModel

logger = logging.getLogger(__name__)


def check_env_vars_available(required_vars: list[str]) -> bool:
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
            settings=ModelSettings(parallel_tool_calls=False)
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
            settings=ModelSettings(parallel_tool_calls=False)
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
            settings=ModelSettings(parallel_tool_calls=False)
        )
    else:
        # For other providers, use the standard string format
        # Note: String format doesn't allow custom timeout configuration
        return get_model_string(model_provider, model_name)


def create_default_models(tool_ids: list[str]) -> list[AIModel]:
    """
    Create default AI model configurations.

    Args:
        tool_ids: List of tool IDs to associate with models

    Returns:
        List of AIModel configurations with availability based on environment variables
    """
    # Define model configurations with their required environment variables
    model_configs = [
        # Anthropic models
        {
            "id": "anthropic:claude-sonnet-4-5",
            "name": "Claude Sonnet 4.5",
            "required_env_vars": ["ANTHROPIC_API_KEY"],
        },
        {
            "id": "anthropic:claude-opus-4",
            "name": "Claude Opus 4",
            "required_env_vars": ["ANTHROPIC_API_KEY"],
        },
        {
            "id": "anthropic:claude-sonnet-4-20250514",
            "name": "Claude Sonnet 4 (May 2025)",
            "required_env_vars": ["ANTHROPIC_API_KEY"],
        },
        {
            "id": "anthropic:claude-3-5-haiku-20241022",
            "name": "Claude 3.5 Haiku",
            "required_env_vars": ["ANTHROPIC_API_KEY"],
        },
        # OpenAI models
        {
            "id": "openai:gpt-4o",
            "name": "GPT-4o",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        {
            "id": "openai:gpt-4o-mini",
            "name": "GPT-4o Mini",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        {
            "id": "openai:gpt-4-turbo",
            "name": "GPT-4 Turbo",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        {
            "id": "openai:o1",
            "name": "o1",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        {
            "id": "openai:o1-mini",
            "name": "o1 Mini",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        {
            "id": "openai:o3-mini",
            "name": "o3 Mini",
            "required_env_vars": ["OPENAI_API_KEY"],
        },
        # AWS Bedrock models
        {
            "id": "bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "name": "Claude Sonnet 4.5 (Bedrock)",
            "required_env_vars": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        },
        {
            "id": "bedrock:us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "name": "Claude 4.5 Haiku (Bedrock)",
            "required_env_vars": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        },
        {
            "id": "bedrock:us.amazon.nova-pro-v1:0",
            "name": "Amazon Nova Pro",
            "required_env_vars": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        },
        {
            "id": "bedrock:us.amazon.nova-lite-v1:0",
            "name": "Amazon Nova Lite",
            "required_env_vars": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        },
        # Azure OpenAI models
        {
            "id": "azure:gpt-4o",
            "name": "GPT-4o (Azure)",
            "required_env_vars": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_ENDPOINT",
            ],
        },
        {
            "id": "azure:gpt-4o-mini",
            "name": "GPT-4o Mini (Azure)",
            "required_env_vars": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_ENDPOINT",
            ],
        },
        {
            "id": "azure:gpt-4-turbo",
            "name": "GPT-4 Turbo (Azure)",
            "required_env_vars": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_ENDPOINT",
            ],
        },
        {
            "id": "azure:o1",
            "name": "o1 (Azure)",
            "required_env_vars": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_ENDPOINT",
            ],
        },
        {
            "id": "azure:o1-mini",
            "name": "o1 Mini (Azure)",
            "required_env_vars": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_ENDPOINT",
            ],
        },
    ]

    # Create AIModel instances with availability checking
    models = []
    for config in model_configs:
        required_vars = config["required_env_vars"]
        is_available = check_env_vars_available(required_vars)

        model = AIModel(
            id=config["id"],
            name=config["name"],
            builtin_tools=tool_ids,
            required_env_vars=required_vars,
            is_available=is_available,
        )
        models.append(model)

        # Log availability status
        if is_available:
            logger.info(f"Model {config['name']} is available")
        else:
            logger.debug(
                f"Model {config['name']} is unavailable (missing: {', '.join(required_vars)})"
            )

    # Log summary
    available_count = sum(1 for m in models if m.is_available)
    logger.info(
        f"Loaded {available_count}/{len(models)} available models based on environment variables"
    )

    return models
