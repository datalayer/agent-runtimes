# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
AI Model Catalog.

Predefined AI model configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import os
from enum import Enum
from typing import Dict, List, Optional

from agent_runtimes.types import AIModel

# ============================================================================
# AIModels Enum
# ============================================================================


class AIModels(str, Enum):
    """Enumeration of all available AI model IDs."""

    ANTHROPIC_CLAUDE_3_5_HAIKU_20241022 = "anthropic:claude-3-5-haiku-20241022"
    ANTHROPIC_CLAUDE_OPUS_4_20250514 = "anthropic:claude-opus-4-20250514"
    ANTHROPIC_CLAUDE_SONNET_4_5_20250514 = "anthropic:claude-sonnet-4-5-20250514"
    ANTHROPIC_CLAUDE_SONNET_4_20250514 = "anthropic:claude-sonnet-4-20250514"
    AZURE_OPENAI_GPT_4_1_MINI = "azure-openai:gpt-4.1-mini"
    AZURE_OPENAI_GPT_4_1_NANO = "azure-openai:gpt-4.1-nano"
    AZURE_OPENAI_GPT_4_1 = "azure-openai:gpt-4.1"
    AZURE_OPENAI_GPT_4O_MINI = "azure-openai:gpt-4o-mini"
    AZURE_OPENAI_GPT_4O = "azure-openai:gpt-4o"
    BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5 = "bedrock:us.anthropic.claude-fable-5"
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1 = "bedrock:us.anthropic.claude-opus-4-6-v1"
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8 = "bedrock:us.anthropic.claude-opus-4-8"
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0 = (
        "bedrock:us.anthropic.claude-opus-4-20250514-v1:0"
    )
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5 = "bedrock:us.anthropic.claude-opus-5"
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0 = (
        "bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6 = "bedrock:us.anthropic.claude-sonnet-4-6"
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0 = (
        "bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0"
    )
    OLLAMA_GEMMA3_4B = "ollama:gemma3:4b"
    OLLAMA_LLAMA3_1_8B = "ollama:llama3.1:8b"
    OLLAMA_QWEN2_5_CODER_7B = "ollama:qwen2.5-coder:7b"
    OPENAI_GPT_4_1_MINI = "openai:gpt-4.1-mini"
    OPENAI_GPT_4_1_NANO = "openai:gpt-4.1-nano"
    OPENAI_GPT_4_1 = "openai:gpt-4.1"
    OPENAI_GPT_4O_MINI = "openai:gpt-4o-mini"
    OPENAI_GPT_4O = "openai:gpt-4o"
    OPENAI_O3_MINI = "openai:o3-mini"


# ============================================================================
# AI Model Definitions
# ============================================================================

ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_0_0_1 = AIModel(
    id="anthropic:claude-3-5-haiku-20241022",
    version="0.0.1",
    name="Anthropic Claude Haiku 3.5",
    description="Claude Haiku 3.5 by Anthropic - fast and efficient",
    provider="anthropic",
    default=False,
    available=False,
    required_env_vars=["ANTHROPIC_API_KEY"],
    tokens_limit=8192,
)

ANTHROPIC_CLAUDE_OPUS_4_20250514_0_0_1 = AIModel(
    id="anthropic:claude-opus-4-20250514",
    version="0.0.1",
    name="Anthropic Claude Opus 4",
    description="Claude Opus 4 by Anthropic - highest capability model",
    provider="anthropic",
    default=False,
    available=False,
    required_env_vars=["ANTHROPIC_API_KEY"],
    tokens_limit=32000,
)

ANTHROPIC_CLAUDE_SONNET_4_5_20250514_0_0_1 = AIModel(
    id="anthropic:claude-sonnet-4-5-20250514",
    version="0.0.1",
    name="Anthropic Claude Sonnet 4.5",
    description="Claude Sonnet 4.5 by Anthropic - balanced performance and speed",
    provider="anthropic",
    default=False,
    available=False,
    required_env_vars=["ANTHROPIC_API_KEY"],
    tokens_limit=64000,
)

ANTHROPIC_CLAUDE_SONNET_4_20250514_0_0_1 = AIModel(
    id="anthropic:claude-sonnet-4-20250514",
    version="0.0.1",
    name="Anthropic Claude Sonnet 4",
    description="Claude Sonnet 4 by Anthropic - strong reasoning and coding",
    provider="anthropic",
    default=False,
    available=False,
    required_env_vars=["ANTHROPIC_API_KEY"],
    tokens_limit=64000,
)

AZURE_OPENAI_GPT_4_1_MINI_0_0_1 = AIModel(
    id="azure-openai:gpt-4.1-mini",
    version="0.0.1",
    name="Azure OpenAI GPT-4.1 Mini",
    description="GPT-4.1 Mini via Azure OpenAI - compact version",
    provider="azure-openai",
    default=False,
    available=False,
    required_env_vars=["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    tokens_limit=32768,
)

AZURE_OPENAI_GPT_4_1_NANO_0_0_1 = AIModel(
    id="azure-openai:gpt-4.1-nano",
    version="0.0.1",
    name="Azure OpenAI GPT-4.1 Nano",
    description="GPT-4.1 Nano via Azure OpenAI - smallest and fastest",
    provider="azure-openai",
    default=False,
    available=False,
    required_env_vars=["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    tokens_limit=32768,
)

AZURE_OPENAI_GPT_4_1_0_0_1 = AIModel(
    id="azure-openai:gpt-4.1",
    version="0.0.1",
    name="Azure OpenAI GPT-4.1",
    description="GPT-4.1 via Azure OpenAI - strong general purpose",
    provider="azure-openai",
    default=False,
    available=False,
    required_env_vars=["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    tokens_limit=32768,
)

AZURE_OPENAI_GPT_4O_MINI_0_0_1 = AIModel(
    id="azure-openai:gpt-4o-mini",
    version="0.0.1",
    name="Azure OpenAI GPT-4o Mini",
    description="GPT-4o Mini via Azure OpenAI - compact enterprise deployment",
    provider="azure-openai",
    default=False,
    available=False,
    required_env_vars=["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    tokens_limit=16384,
)

AZURE_OPENAI_GPT_4O_0_0_1 = AIModel(
    id="azure-openai:gpt-4o",
    version="0.0.1",
    name="Azure OpenAI GPT-4o",
    description="GPT-4o via Azure OpenAI - enterprise deployment",
    provider="azure-openai",
    default=False,
    available=False,
    required_env_vars=["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    tokens_limit=16384,
)

BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-fable-5",
    version="0.0.1",
    name="Bedrock Claude Fable 5",
    description="Claude Fable 5 via AWS Bedrock",
    provider="bedrock",
    default=False,
    available=True,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=64000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-opus-4-6-v1",
    version="0.0.1",
    name="Bedrock Claude Opus 4.6",
    description="Claude Opus 4.6 via AWS Bedrock",
    provider="bedrock",
    default=False,
    available=True,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=32000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-opus-4-8",
    version="0.0.1",
    name="Bedrock Claude Opus 4.8",
    description="Claude Opus 4.8 via AWS Bedrock",
    provider="bedrock",
    default=False,
    available=True,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=32000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-opus-4-20250514-v1:0",
    version="0.0.1",
    name="Bedrock Claude Opus 4",
    description="Claude Opus 4 via AWS Bedrock - highest capability",
    provider="bedrock",
    default=False,
    available=False,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=32000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-opus-5",
    version="0.0.1",
    name="Bedrock Claude Opus 5",
    description="Claude Opus 5 via AWS Bedrock - the current frontier model",
    provider="bedrock",
    default=False,
    available=True,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=32000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    version="0.0.1",
    name="Bedrock Claude Sonnet 4.5",
    description="Claude Sonnet 4.5 via AWS Bedrock - balanced performance",
    provider="bedrock",
    default=True,
    available=False,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=64000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-sonnet-4-6",
    version="0.0.1",
    name="Bedrock Claude Sonnet 4.6",
    description="Claude Sonnet 4.6 via AWS Bedrock - balanced performance",
    provider="bedrock",
    default=True,
    available=True,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=64000,
)

BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0_0_0_1 = AIModel(
    id="bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0",
    version="0.0.1",
    name="Bedrock Claude Sonnet 4",
    description="Claude Sonnet 4 via AWS Bedrock - strong reasoning",
    provider="bedrock",
    default=False,
    available=False,
    required_env_vars=[
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ],
    tokens_limit=64000,
)

OLLAMA_GEMMA3_4B_0_0_1 = AIModel(
    id="ollama:gemma3:4b",
    version="0.0.1",
    name="Gemma 3 4B (Ollama)",
    description="Gemma 3 4B running locally through Ollama - small and fast, no tool calling",
    provider="ollama",
    default=False,
    available=False,
    required_env_vars=[],
    tokens_limit=4096,
    local=True,
    capabilities=["chat"],
)

OLLAMA_LLAMA3_1_8B_0_0_1 = AIModel(
    id="ollama:llama3.1:8b",
    version="0.0.1",
    name="Llama 3.1 8B (Ollama)",
    description="Meta Llama 3.1 8B running locally through Ollama - tool calling, no data leaves the machine",
    provider="ollama",
    default=False,
    available=False,
    required_env_vars=[],
    tokens_limit=4096,
    local=True,
    capabilities=["chat", "tools", "codemode"],
)

OLLAMA_QWEN2_5_CODER_7B_0_0_1 = AIModel(
    id="ollama:qwen2.5-coder:7b",
    version="0.0.1",
    name="Qwen2.5 Coder 7B (Ollama)",
    description="Qwen2.5 Coder 7B running locally through Ollama - code-focused with tool calling",
    provider="ollama",
    default=False,
    available=False,
    required_env_vars=[],
    tokens_limit=4096,
    local=True,
    capabilities=["chat", "tools", "codemode"],
)

OPENAI_GPT_4_1_MINI_0_0_1 = AIModel(
    id="openai:gpt-4.1-mini",
    version="0.0.1",
    name="OpenAI GPT-4.1 Mini",
    description="GPT-4.1 Mini by OpenAI - compact version of GPT-4.1",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=32768,
)

OPENAI_GPT_4_1_NANO_0_0_1 = AIModel(
    id="openai:gpt-4.1-nano",
    version="0.0.1",
    name="OpenAI GPT-4.1 Nano",
    description="GPT-4.1 Nano by OpenAI - smallest and fastest",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=32768,
)

OPENAI_GPT_4_1_0_0_1 = AIModel(
    id="openai:gpt-4.1",
    version="0.0.1",
    name="OpenAI GPT-4.1",
    description="GPT-4.1 by OpenAI - strong general purpose model",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=32768,
)

OPENAI_GPT_4O_MINI_0_0_1 = AIModel(
    id="openai:gpt-4o-mini",
    version="0.0.1",
    name="OpenAI GPT-4o Mini",
    description="GPT-4o Mini by OpenAI - compact and cost-effective",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=16384,
)

OPENAI_GPT_4O_0_0_1 = AIModel(
    id="openai:gpt-4o",
    version="0.0.1",
    name="OpenAI GPT-4o",
    description="GPT-4o by OpenAI - fast multimodal model",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=16384,
)

OPENAI_O3_MINI_0_0_1 = AIModel(
    id="openai:o3-mini",
    version="0.0.1",
    name="OpenAI o3 Mini",
    description="o3 Mini by OpenAI - reasoning-focused compact model",
    provider="openai",
    default=False,
    available=False,
    required_env_vars=["OPENAI_API_KEY"],
    tokens_limit=100000,
)

# ============================================================================
# AI Model Catalog
# ============================================================================

AI_MODEL_CATALOGUE: Dict[str, AIModel] = {
    "anthropic:claude-3-5-haiku-20241022": ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_0_0_1,
    "anthropic:claude-opus-4-20250514": ANTHROPIC_CLAUDE_OPUS_4_20250514_0_0_1,
    "anthropic:claude-sonnet-4-5-20250514": ANTHROPIC_CLAUDE_SONNET_4_5_20250514_0_0_1,
    "anthropic:claude-sonnet-4-20250514": ANTHROPIC_CLAUDE_SONNET_4_20250514_0_0_1,
    "azure-openai:gpt-4.1-mini": AZURE_OPENAI_GPT_4_1_MINI_0_0_1,
    "azure-openai:gpt-4.1-nano": AZURE_OPENAI_GPT_4_1_NANO_0_0_1,
    "azure-openai:gpt-4.1": AZURE_OPENAI_GPT_4_1_0_0_1,
    "azure-openai:gpt-4o-mini": AZURE_OPENAI_GPT_4O_MINI_0_0_1,
    "azure-openai:gpt-4o": AZURE_OPENAI_GPT_4O_0_0_1,
    "bedrock:us.anthropic.claude-fable-5": BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5_0_0_1,
    "bedrock:us.anthropic.claude-opus-4-6-v1": BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0_0_1,
    "bedrock:us.anthropic.claude-opus-4-8": BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8_0_0_1,
    "bedrock:us.anthropic.claude-opus-4-20250514-v1:0": BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0_0_0_1,
    "bedrock:us.anthropic.claude-opus-5": BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5_0_0_1,
    "bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0": BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0_0_0_1,
    "bedrock:us.anthropic.claude-sonnet-4-6": BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6_0_0_1,
    "bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0": BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0_0_0_1,
    "ollama:gemma3:4b": OLLAMA_GEMMA3_4B_0_0_1,
    "ollama:llama3.1:8b": OLLAMA_LLAMA3_1_8B_0_0_1,
    "ollama:qwen2.5-coder:7b": OLLAMA_QWEN2_5_CODER_7B_0_0_1,
    "openai:gpt-4.1-mini": OPENAI_GPT_4_1_MINI_0_0_1,
    "openai:gpt-4.1-nano": OPENAI_GPT_4_1_NANO_0_0_1,
    "openai:gpt-4.1": OPENAI_GPT_4_1_0_0_1,
    "openai:gpt-4o-mini": OPENAI_GPT_4O_MINI_0_0_1,
    "openai:gpt-4o": OPENAI_GPT_4O_0_0_1,
    "openai:o3-mini": OPENAI_O3_MINI_0_0_1,
}


DEFAULT_MODEL: AIModels = AIModels.BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0


def check_env_vars_available(env_vars: list[str]) -> bool:
    """
    Check if all required environment variables are set.

    Args:
        env_vars: List of environment variable names to check.

    Returns:
        True if all env vars are set (non-empty), False otherwise.
    """
    if not env_vars:
        return True
    return all(os.environ.get(var) for var in env_vars)


def get_model(model_id: str) -> Optional[AIModel]:
    """
    Get an AI model by ID (accepts both bare and versioned refs).

    Args:
        model_id: The unique identifier of the AI model.

    Returns:
        The AIModel specification, or None if not found.
    """
    model = AI_MODEL_CATALOGUE.get(model_id)
    if model is not None:
        return model
    base, _, ver = model_id.rpartition(":")
    if base and "." in ver:
        return AI_MODEL_CATALOGUE.get(base)
    return None


def get_default_model() -> Optional[AIModel]:
    """
    Get the default AI model.

    Returns:
        The default AIModel, or None if no default is set.
    """
    if DEFAULT_MODEL is None:
        return None
    return AI_MODEL_CATALOGUE.get(DEFAULT_MODEL.value)


def list_models() -> list[AIModel]:
    """
    List all AI models with availability status.

    For each model, checks if the required environment variables are set.

    Returns:
        List of all AIModel specifications.
    """
    return list(AI_MODEL_CATALOGUE.values())
