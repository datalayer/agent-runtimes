/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Model Provider Catalog.
 *
 * Who serves a model: the vendor's own API, a cloud that hosts it, or the
 * user's machine — with its site, documentation, terms, privacy policy and
 * what it says about the data a request carries.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ModelProvider } from '../types/models';

export const ALIBABA_0_0_1: ModelProvider = {
  id: 'alibaba',
  version: '0.0.1',
  name: 'Alibaba Cloud Model Studio',
  description:
    "Alibaba Cloud's model service for the Qwen family, through an OpenAI-compatible endpoint, under Alibaba Cloud's international product terms.",
  website: 'https://www.alibabacloud.com/en/product/modelstudio',
  docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/',
  termsUrl:
    'https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service',
  privacyUrl:
    'https://www.alibabacloud.com/help/en/legal/latest/privacy-policy',
  hosting: 'cloud',
};

export const ANTHROPIC_0_0_1: ModelProvider = {
  id: 'anthropic',
  version: '0.0.1',
  name: 'Anthropic',
  description:
    "Anthropic's own API for the Claude models — the vendor's endpoint, with the newest models first and the vendor's own usage policy.",
  website: 'https://www.anthropic.com',
  docsUrl: 'https://docs.claude.com/en/home',
  termsUrl: 'https://www.anthropic.com/legal/commercial-terms',
  privacyUrl: 'https://www.anthropic.com/legal/privacy',
  dataUsageUrl: 'https://www.anthropic.com/legal/aup',
  hosting: 'cloud',
};

export const AZURE_OPENAI_0_0_1: ModelProvider = {
  id: 'azure-openai',
  version: '0.0.1',
  name: 'Azure OpenAI',
  description:
    "OpenAI's models served by Microsoft Azure (Foundry Models sold by Azure) — an Azure resource, endpoint and key, under the Microsoft Product Terms and Azure's data-privacy commitments.",
  website:
    'https://azure.microsoft.com/en-us/products/ai-foundry/models/openai',
  docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/overview',
  termsUrl:
    'https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/EAEAS',
  privacyUrl: 'https://www.microsoft.com/en-us/privacy/privacystatement',
  dataUsageUrl:
    'https://learn.microsoft.com/en-us/legal/cognitive-services/openai/data-privacy',
  hosting: 'cloud',
};

export const BEDROCK_0_0_1: ModelProvider = {
  id: 'bedrock',
  version: '0.0.1',
  name: 'Amazon Bedrock',
  description:
    "AWS's managed service for foundation models, among them Anthropic's Claude — called with AWS credentials, in an AWS region, under AWS's service terms and data protection.",
  website: 'https://aws.amazon.com/bedrock/',
  docsUrl:
    'https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html',
  termsUrl: 'https://aws.amazon.com/service-terms/',
  privacyUrl: 'https://aws.amazon.com/privacy/',
  dataUsageUrl:
    'https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html',
  hosting: 'cloud',
};

export const CLOUDFLARE_0_0_1: ModelProvider = {
  id: 'cloudflare',
  version: '0.0.1',
  name: 'Cloudflare',
  description:
    "Cloudflare Workers AI, the models Cloudflare hosts at its edge, and AI Gateway, which sits in front of them and of the third-party models it fronts (Typesafe's Jev) with logs, caching, rate limits and prepaid credits. A model's route (`wrk`, `gtw`) says which of the two it is reached through.",
  website: 'https://www.cloudflare.com/developer-platform/products/workers-ai/',
  docsUrl: 'https://developers.cloudflare.com/workers-ai/',
  termsUrl: 'https://www.cloudflare.com/terms/',
  privacyUrl: 'https://www.cloudflare.com/privacypolicy/',
  dataUsageUrl:
    'https://developers.cloudflare.com/workers-ai/platform/data-usage/',
  hosting: 'cloud',
};

export const OLLAMA_0_0_1: ModelProvider = {
  id: 'ollama',
  version: '0.0.1',
  name: 'Ollama',
  description:
    "Open models run on the user's own machine through Ollama's local server — no API key, no data leaving the machine; the terms and privacy below are Ollama's for its site and registry.",
  website: 'https://ollama.com/',
  docsUrl: 'https://docs.ollama.com/',
  termsUrl: 'https://ollama.com/terms',
  privacyUrl: 'https://ollama.com/privacy',
  hosting: 'local',
};

export const OPENAI_0_0_1: ModelProvider = {
  id: 'openai',
  version: '0.0.1',
  name: 'OpenAI',
  description:
    "OpenAI's platform API for the GPT and o-series models — the vendor's endpoint, under its business terms; API data is not used for training by default.",
  website: 'https://openai.com',
  docsUrl: 'https://platform.openai.com/docs/overview',
  termsUrl: 'https://openai.com/policies/business-terms/',
  privacyUrl: 'https://openai.com/policies/privacy-policy/',
  dataUsageUrl: 'https://platform.openai.com/docs/guides/your-data',
  hosting: 'cloud',
};

export const MODEL_PROVIDER_CATALOGUE: Record<string, ModelProvider> = {
  alibaba: ALIBABA_0_0_1,
  anthropic: ANTHROPIC_0_0_1,
  'azure-openai': AZURE_OPENAI_0_0_1,
  bedrock: BEDROCK_0_0_1,
  cloudflare: CLOUDFLARE_0_0_1,
  ollama: OLLAMA_0_0_1,
  openai: OPENAI_0_0_1,
};

/** The provider a model spec's `provider` names, or undefined. */
export function getModelProvider(
  providerId: string,
): ModelProvider | undefined {
  return MODEL_PROVIDER_CATALOGUE[providerId];
}

export function listModelProviders(): ModelProvider[] {
  return Object.values(MODEL_PROVIDER_CATALOGUE);
}
