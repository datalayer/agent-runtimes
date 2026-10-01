# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Model Provider Catalog.

Who serves a model: the vendor's own API, a cloud that hosts it, or the
user's machine — with its site, documentation, terms, privacy policy and
what it says about the data a request carries.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import ModelProvider

# ============================================================================
# Model Provider Definitions
# ============================================================================

ALIBABA_0_0_1 = ModelProvider(
    id="alibaba",
    version="0.0.1",
    name="Alibaba Cloud Model Studio",
    description="Alibaba Cloud's model service for the Qwen family, through an OpenAI-compatible endpoint, under Alibaba Cloud's international product terms.",
    website="https://www.alibabacloud.com/en/product/modelstudio",
    docs_url="https://www.alibabacloud.com/help/en/model-studio/",
    terms_url="https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service",
    privacy_url="https://www.alibabacloud.com/help/en/legal/latest/privacy-policy",
    hosting="cloud",
)

ANTHROPIC_0_0_1 = ModelProvider(
    id="anthropic",
    version="0.0.1",
    name="Anthropic",
    description="Anthropic's own API for the Claude models — the vendor's endpoint, with the newest models first and the vendor's own usage policy.",
    website="https://www.anthropic.com",
    docs_url="https://docs.claude.com/en/home",
    terms_url="https://www.anthropic.com/legal/commercial-terms",
    privacy_url="https://www.anthropic.com/legal/privacy",
    data_usage_url="https://www.anthropic.com/legal/aup",
    hosting="cloud",
)

AZURE_OPENAI_0_0_1 = ModelProvider(
    id="azure-openai",
    version="0.0.1",
    name="Azure OpenAI",
    description="OpenAI's models served by Microsoft Azure (Foundry Models sold by Azure) — an Azure resource, endpoint and key, under the Microsoft Product Terms and Azure's data-privacy commitments.",
    website="https://azure.microsoft.com/en-us/products/ai-foundry/models/openai",
    docs_url="https://learn.microsoft.com/en-us/azure/ai-foundry/openai/overview",
    terms_url="https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/EAEAS",
    privacy_url="https://www.microsoft.com/en-us/privacy/privacystatement",
    data_usage_url="https://learn.microsoft.com/en-us/legal/cognitive-services/openai/data-privacy",
    hosting="cloud",
)

BEDROCK_0_0_1 = ModelProvider(
    id="bedrock",
    version="0.0.1",
    name="Amazon Bedrock",
    description="AWS's managed service for foundation models, among them Anthropic's Claude — called with AWS credentials, in an AWS region, under AWS's service terms and data protection.",
    website="https://aws.amazon.com/bedrock/",
    docs_url="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html",
    terms_url="https://aws.amazon.com/service-terms/",
    privacy_url="https://aws.amazon.com/privacy/",
    data_usage_url="https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html",
    hosting="cloud",
)

CLOUDFLARE_0_0_1 = ModelProvider(
    id="cloudflare",
    version="0.0.1",
    name="Cloudflare",
    description="Cloudflare Workers AI, the models Cloudflare hosts at its edge, and AI Gateway, which sits in front of them and of the third-party models it fronts (Typesafe's Jev) with logs, caching, rate limits and prepaid credits. A model's route (`wrk`, `gtw`) says which of the two it is reached through.",
    website="https://www.cloudflare.com/developer-platform/products/workers-ai/",
    docs_url="https://developers.cloudflare.com/workers-ai/",
    terms_url="https://www.cloudflare.com/terms/",
    privacy_url="https://www.cloudflare.com/privacypolicy/",
    data_usage_url="https://developers.cloudflare.com/workers-ai/platform/data-usage/",
    hosting="cloud",
)

OLLAMA_0_0_1 = ModelProvider(
    id="ollama",
    version="0.0.1",
    name="Ollama",
    description="Open models run on the user's own machine through Ollama's local server — no API key, no data leaving the machine; the terms and privacy below are Ollama's for its site and registry.",
    website="https://ollama.com/",
    docs_url="https://docs.ollama.com/",
    terms_url="https://ollama.com/terms",
    privacy_url="https://ollama.com/privacy",
    hosting="local",
)

OPENAI_0_0_1 = ModelProvider(
    id="openai",
    version="0.0.1",
    name="OpenAI",
    description="OpenAI's platform API for the GPT and o-series models — the vendor's endpoint, under its business terms; API data is not used for training by default.",
    website="https://openai.com",
    docs_url="https://platform.openai.com/docs/overview",
    terms_url="https://openai.com/policies/business-terms/",
    privacy_url="https://openai.com/policies/privacy-policy/",
    data_usage_url="https://platform.openai.com/docs/guides/your-data",
    hosting="cloud",
)


# ============================================================================
# Model Provider Catalog
# ============================================================================

MODEL_PROVIDER_CATALOGUE: Dict[str, ModelProvider] = {
    "alibaba": ALIBABA_0_0_1,
    "anthropic": ANTHROPIC_0_0_1,
    "azure-openai": AZURE_OPENAI_0_0_1,
    "bedrock": BEDROCK_0_0_1,
    "cloudflare": CLOUDFLARE_0_0_1,
    "ollama": OLLAMA_0_0_1,
    "openai": OPENAI_0_0_1,
}


def get_model_provider(provider_id: str) -> ModelProvider | None:
    """The provider a model spec's `provider` names, or None."""
    return MODEL_PROVIDER_CATALOGUE.get(provider_id)


def list_model_providers() -> list[ModelProvider]:
    return list(MODEL_PROVIDER_CATALOGUE.values())
