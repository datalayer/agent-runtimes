/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AI Model Catalog
 *
 * Predefined AI model configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { AIModel } from '../types';

// ============================================================================
// AIModels Enum
// ============================================================================

export const AIModels = {
  ALIBABA_QWEN_MAX: 'alibaba:qwen-max',
  ALIBABA_QWEN3_32B: 'alibaba:qwen3-32b',
  ALIBABA_QWEN3_6_FLASH: 'alibaba:qwen3.6-flash',
  ALIBABA_QWEN3_6_PLUS: 'alibaba:qwen3.6-plus',
  ALIBABA_QWEN3_7_PLUS: 'alibaba:qwen3.7-plus',
  ANTHROPIC_CLAUDE_3_5_HAIKU_20241022: 'anthropic:claude-3-5-haiku-20241022',
  ANTHROPIC_CLAUDE_OPUS_4_20250514: 'anthropic:claude-opus-4-20250514',
  ANTHROPIC_CLAUDE_SONNET_4_5_20250514: 'anthropic:claude-sonnet-4-5-20250514',
  ANTHROPIC_CLAUDE_SONNET_4_20250514: 'anthropic:claude-sonnet-4-20250514',
  AZURE_OPENAI_GPT_4_1_MINI: 'azure-openai:gpt-4.1-mini',
  AZURE_OPENAI_GPT_4_1_NANO: 'azure-openai:gpt-4.1-nano',
  AZURE_OPENAI_GPT_4_1: 'azure-openai:gpt-4.1',
  AZURE_OPENAI_GPT_4O_MINI: 'azure-openai:gpt-4o-mini',
  AZURE_OPENAI_GPT_4O: 'azure-openai:gpt-4o',
  BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5: 'bedrock:us.anthropic.claude-fable-5',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1:
    'bedrock:us.anthropic.claude-opus-4-6-v1',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8: 'bedrock:us.anthropic.claude-opus-4-8',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0:
    'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5: 'bedrock:us.anthropic.claude-opus-5',
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0:
    'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6:
    'bedrock:us.anthropic.claude-sonnet-4-6',
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0:
    'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
  CLOUDFLARE_GTW_TYPESAFE_JEV: 'cloudflare:gtw/typesafe/jev',
  CLOUDFLARE_WRK_GOOGLE_GEMMA_4_26B_A4B_IT:
    'cloudflare:wrk/google/gemma-4-26b-a4b-it',
  CLOUDFLARE_WRK_ZAI_ORG_GLM_5_2: 'cloudflare:wrk/zai-org/glm-5.2',
  CLOUDFLARE_WRK_OPENAI_GPT_OSS_120B: 'cloudflare:wrk/openai/gpt-oss-120b',
  CLOUDFLARE_WRK_MOONSHOTAI_KIMI_K2_6: 'cloudflare:wrk/moonshotai/kimi-k2.6',
  CLOUDFLARE_WRK_META_LLAMA_3_3_70B_INSTRUCT_FP8_FAST:
    'cloudflare:wrk/meta/llama-3.3-70b-instruct-fp8-fast',
  CLOUDFLARE_WRK_QWEN_QWEN3_8_27B: 'cloudflare:wrk/qwen/qwen3.8-27b',
  CLOUDFLARE_WRK_TYPESAFE_JEV: 'cloudflare:wrk/typesafe/jev',
  OLLAMA_GEMMA3_4B: 'ollama:gemma3:4b',
  OLLAMA_LLAMA3_1_8B: 'ollama:llama3.1:8b',
  OLLAMA_QWEN2_5_CODER_7B: 'ollama:qwen2.5-coder:7b',
  OPENAI_GPT_4_1_MINI: 'openai:gpt-4.1-mini',
  OPENAI_GPT_4_1_NANO: 'openai:gpt-4.1-nano',
  OPENAI_GPT_4_1: 'openai:gpt-4.1',
  OPENAI_GPT_4O_MINI: 'openai:gpt-4o-mini',
  OPENAI_GPT_4O: 'openai:gpt-4o',
  OPENAI_O3_MINI: 'openai:o3-mini',
} as const;

export type AIModelId = (typeof AIModels)[keyof typeof AIModels];

// ============================================================================
// AI Model Definitions
// ============================================================================

export const ALIBABA_QWEN_MAX_0_0_1: AIModel = {
  id: 'alibaba:qwen-max',
  version: '0.0.1',
  name: 'Alibaba Qwen-Max',
  description:
    'Qwen-Max via Alibaba Cloud Model Studio - highest capability Qwen model',
  provider: 'alibaba',
  providerUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const ALIBABA_QWEN3_32B_0_0_1: AIModel = {
  id: 'alibaba:qwen3-32b',
  version: '0.0.1',
  name: 'Alibaba Qwen3-32B',
  description:
    'Qwen3-32B via Alibaba Cloud Model Studio - open-weight 32B model with tool calling',
  provider: 'alibaba',
  providerUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 16384,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const ALIBABA_QWEN3_6_FLASH_0_0_1: AIModel = {
  id: 'alibaba:qwen3.6-flash',
  version: '0.0.1',
  name: 'Alibaba Qwen3.6-Flash',
  description:
    'Qwen3.6-Flash via Alibaba Cloud Model Studio - fast and low cost',
  provider: 'alibaba',
  providerUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 16384,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const ALIBABA_QWEN3_6_PLUS_0_0_1: AIModel = {
  id: 'alibaba:qwen3.6-plus',
  version: '0.0.1',
  name: 'Alibaba Qwen3.6-Plus',
  description:
    'Qwen3.6-Plus via Alibaba Cloud Model Studio - balanced performance and cost',
  provider: 'alibaba',
  providerUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const ALIBABA_QWEN3_7_PLUS_0_0_1: AIModel = {
  id: 'alibaba:qwen3.7-plus',
  version: '0.0.1',
  name: 'Alibaba Qwen3.7-Plus',
  description:
    'Qwen3.7-Plus via Alibaba Cloud Model Studio - balanced flagship Qwen3 model',
  provider: 'alibaba',
  providerUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_0_0_1: AIModel = {
  id: 'anthropic:claude-3-5-haiku-20241022',
  version: '0.0.1',
  name: 'Anthropic Claude Haiku 3.5',
  description: 'Claude Haiku 3.5 by Anthropic - fast and efficient',
  provider: 'anthropic',
  providerUrl: 'https://www.anthropic.com/claude/haiku',
  default: false,
  available: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
  tokensLimit: 8192,
};

export const ANTHROPIC_CLAUDE_OPUS_4_20250514_0_0_1: AIModel = {
  id: 'anthropic:claude-opus-4-20250514',
  version: '0.0.1',
  name: 'Anthropic Claude Opus 4',
  description: 'Claude Opus 4 by Anthropic - highest capability model',
  provider: 'anthropic',
  providerUrl: 'https://www.anthropic.com/claude/opus',
  default: false,
  available: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
  tokensLimit: 32000,
};

export const ANTHROPIC_CLAUDE_SONNET_4_5_20250514_0_0_1: AIModel = {
  id: 'anthropic:claude-sonnet-4-5-20250514',
  version: '0.0.1',
  name: 'Anthropic Claude Sonnet 4.5',
  description:
    'Claude Sonnet 4.5 by Anthropic - balanced performance and speed',
  provider: 'anthropic',
  providerUrl: 'https://www.anthropic.com/claude/sonnet',
  default: false,
  available: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
  tokensLimit: 64000,
};

export const ANTHROPIC_CLAUDE_SONNET_4_20250514_0_0_1: AIModel = {
  id: 'anthropic:claude-sonnet-4-20250514',
  version: '0.0.1',
  name: 'Anthropic Claude Sonnet 4',
  description: 'Claude Sonnet 4 by Anthropic - strong reasoning and coding',
  provider: 'anthropic',
  providerUrl: 'https://www.anthropic.com/claude/sonnet',
  default: false,
  available: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
  tokensLimit: 64000,
};

export const AZURE_OPENAI_GPT_4_1_MINI_0_0_1: AIModel = {
  id: 'azure-openai:gpt-4.1-mini',
  version: '0.0.1',
  name: 'Azure OpenAI GPT-4.1 Mini',
  description: 'GPT-4.1 Mini via Azure OpenAI - compact version',
  provider: 'azure-openai',
  providerUrl:
    'https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure',
  default: false,
  available: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  tokensLimit: 32768,
};

export const AZURE_OPENAI_GPT_4_1_NANO_0_0_1: AIModel = {
  id: 'azure-openai:gpt-4.1-nano',
  version: '0.0.1',
  name: 'Azure OpenAI GPT-4.1 Nano',
  description: 'GPT-4.1 Nano via Azure OpenAI - smallest and fastest',
  provider: 'azure-openai',
  providerUrl:
    'https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure',
  default: false,
  available: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  tokensLimit: 32768,
};

export const AZURE_OPENAI_GPT_4_1_0_0_1: AIModel = {
  id: 'azure-openai:gpt-4.1',
  version: '0.0.1',
  name: 'Azure OpenAI GPT-4.1',
  description: 'GPT-4.1 via Azure OpenAI - strong general purpose',
  provider: 'azure-openai',
  providerUrl:
    'https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure',
  default: false,
  available: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  tokensLimit: 32768,
};

export const AZURE_OPENAI_GPT_4O_MINI_0_0_1: AIModel = {
  id: 'azure-openai:gpt-4o-mini',
  version: '0.0.1',
  name: 'Azure OpenAI GPT-4o Mini',
  description: 'GPT-4o Mini via Azure OpenAI - compact enterprise deployment',
  provider: 'azure-openai',
  providerUrl:
    'https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure',
  default: false,
  available: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  tokensLimit: 16384,
};

export const AZURE_OPENAI_GPT_4O_0_0_1: AIModel = {
  id: 'azure-openai:gpt-4o',
  version: '0.0.1',
  name: 'Azure OpenAI GPT-4o',
  description: 'GPT-4o via Azure OpenAI - enterprise deployment',
  provider: 'azure-openai',
  providerUrl:
    'https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure',
  default: false,
  available: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  tokensLimit: 16384,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-fable-5',
  version: '0.0.1',
  name: 'Bedrock Claude Fable 5',
  description: 'Claude Fable 5 via AWS Bedrock',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: false,
  available: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 64000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-4-6-v1',
  version: '0.0.1',
  name: 'Bedrock Claude Opus 4.6',
  description: 'Claude Opus 4.6 via AWS Bedrock',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: false,
  available: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 32000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-4-8',
  version: '0.0.1',
  name: 'Bedrock Claude Opus 4.8',
  description: 'Claude Opus 4.8 via AWS Bedrock',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: false,
  available: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 32000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
  version: '0.0.1',
  name: 'Bedrock Claude Opus 4',
  description: 'Claude Opus 4 via AWS Bedrock - highest capability',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: false,
  available: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 32000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-5',
  version: '0.0.1',
  name: 'Bedrock Claude Opus 5',
  description: 'Claude Opus 5 via AWS Bedrock - the current frontier model',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: false,
  available: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 32000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0_0_0_1: AIModel =
  {
    id: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    version: '0.0.1',
    name: 'Bedrock Claude Sonnet 4.5',
    description: 'Claude Sonnet 4.5 via AWS Bedrock - balanced performance',
    provider: 'bedrock',
    providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
    default: false,
    available: false,
    requiredEnvVars: [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_DEFAULT_REGION',
    ],
    tokensLimit: 64000,
  };

export const BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6_0_0_1: AIModel = {
  id: 'bedrock:us.anthropic.claude-sonnet-4-6',
  version: '0.0.1',
  name: 'Bedrock Claude Sonnet 4.6',
  description: 'Claude Sonnet 4.6 via AWS Bedrock - balanced performance',
  provider: 'bedrock',
  providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
  default: true,
  available: true,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
  tokensLimit: 64000,
  capabilities: ['chat', 'tools', 'judge'],
  contextWindow: 200000,
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0_0_0_1: AIModel =
  {
    id: 'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
    version: '0.0.1',
    name: 'Bedrock Claude Sonnet 4',
    description: 'Claude Sonnet 4 via AWS Bedrock - strong reasoning',
    provider: 'bedrock',
    providerUrl: 'https://aws.amazon.com/bedrock/anthropic/',
    default: false,
    available: false,
    requiredEnvVars: [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_DEFAULT_REGION',
    ],
    tokensLimit: 64000,
  };

export const CLOUDFLARE_GTW_TYPESAFE_JEV_0_0_1: AIModel = {
  id: 'cloudflare:gtw/typesafe/jev',
  version: '0.0.1',
  name: 'Jev (Cloudflare AI Gateway)',
  description:
    "Typesafe's typed-judgment model through the account's AI Gateway - noul, choice and score questions answered as calibrated probabilities; 32k context; zero data retention; the gateway keeps the logs and bills from its credits",
  provider: 'cloudflare',
  providerUrl: 'https://docs.typesafe.ai/models',
  default: false,
  available: true,
  requiredEnvVars: [],
  capabilities: ['judgments'],
  billing: 'credits',
  route: 'ai-gateway',
  contextWindow: 32000,
  zeroDataRetention: true,
  requestLogging: 'gateway',
  pricing: { inputUsdPerMillion: 0.042, outputUsdPerMillion: 0.0 },
};

export const CLOUDFLARE_WRK_GOOGLE_GEMMA_4_26B_A4B_IT_0_0_1: AIModel = {
  id: 'cloudflare:wrk/google/gemma-4-26b-a4b-it',
  version: '0.0.1',
  name: 'Cloudflare Gemma 4 26B',
  description:
    'Google Gemma 4 26B (a4b, instruction-tuned) on Cloudflare Workers AI - 256k context, tool calling, standard billing',
  provider: 'cloudflare',
  providerUrl:
    'https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 16384,
  capabilities: ['chat', 'tools', 'codemode'],
  billing: 'standard',
  route: 'workers-ai',
  contextWindow: 256000,
  aliases: ['cloudflare:google/gemma-4-26b-a4b-it'],
};

export const CLOUDFLARE_WRK_ZAI_ORG_GLM_5_2_0_0_1: AIModel = {
  id: 'cloudflare:wrk/zai-org/glm-5.2',
  version: '0.0.1',
  name: 'Cloudflare GLM-5.2',
  description:
    'Z.ai GLM-5.2 on Cloudflare Workers AI - 262k context, tool calling; a frontier model billed from AI Gateway credits',
  provider: 'cloudflare',
  providerUrl: 'https://developers.cloudflare.com/workers-ai/models/glm-5.2/',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode'],
  billing: 'credits',
  route: 'workers-ai',
  contextWindow: 262144,
  aliases: ['cloudflare:zai-org/glm-5.2'],
};

export const CLOUDFLARE_WRK_OPENAI_GPT_OSS_120B_0_0_1: AIModel = {
  id: 'cloudflare:wrk/openai/gpt-oss-120b',
  version: '0.0.1',
  name: 'Cloudflare gpt-oss-120b',
  description:
    'OpenAI gpt-oss-120b on Cloudflare Workers AI - 128k context, tool calling, standard billing',
  provider: 'cloudflare',
  providerUrl:
    'https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode', 'judge'],
  billing: 'standard',
  route: 'workers-ai',
  contextWindow: 128000,
  aliases: ['cloudflare:openai/gpt-oss-120b'],
};

export const CLOUDFLARE_WRK_MOONSHOTAI_KIMI_K2_6_0_0_1: AIModel = {
  id: 'cloudflare:wrk/moonshotai/kimi-k2.6',
  version: '0.0.1',
  name: 'Cloudflare Kimi K2.6',
  description:
    'Moonshot Kimi K2.6 on Cloudflare Workers AI - 262k context, tool calling; a frontier model billed from AI Gateway credits',
  provider: 'cloudflare',
  providerUrl: 'https://developers.cloudflare.com/workers-ai/models/kimi-k2.6/',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 32768,
  capabilities: ['chat', 'tools', 'codemode'],
  billing: 'credits',
  route: 'workers-ai',
  contextWindow: 262144,
  aliases: ['cloudflare:moonshotai/kimi-k2.6'],
};

export const CLOUDFLARE_WRK_META_LLAMA_3_3_70B_INSTRUCT_FP8_FAST_0_0_1: AIModel =
  {
    id: 'cloudflare:wrk/meta/llama-3.3-70b-instruct-fp8-fast',
    version: '0.0.1',
    name: 'Cloudflare Llama 3.3 70B',
    description:
      'Meta Llama 3.3 70B Instruct (fp8, fast) on Cloudflare Workers AI - 24k context, tool calling, standard billing',
    provider: 'cloudflare',
    providerUrl:
      'https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/',
    default: false,
    available: true,
    requiredEnvVars: [],
    tokensLimit: 8192,
    capabilities: ['chat', 'tools', 'codemode'],
    billing: 'standard',
    route: 'workers-ai',
    contextWindow: 24000,
    aliases: ['cloudflare:meta/llama-3.3-70b-instruct-fp8-fast'],
  };

export const CLOUDFLARE_WRK_QWEN_QWEN3_8_27B_0_0_1: AIModel = {
  id: 'cloudflare:wrk/qwen/qwen3.8-27b',
  version: '0.0.1',
  name: 'Cloudflare Qwen3.8 27B',
  description:
    'Qwen3.8 27B on Cloudflare Workers AI - 262k context, tool calling, standard billing',
  provider: 'cloudflare',
  providerUrl:
    'https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/',
  default: false,
  available: true,
  requiredEnvVars: [],
  tokensLimit: 16384,
  capabilities: ['chat', 'tools', 'codemode'],
  billing: 'standard',
  route: 'workers-ai',
  contextWindow: 262144,
  aliases: ['cloudflare:qwen/qwen3.8-27b'],
};

export const CLOUDFLARE_WRK_TYPESAFE_JEV_0_0_1: AIModel = {
  id: 'cloudflare:wrk/typesafe/jev',
  version: '0.0.1',
  name: 'Jev (Cloudflare Workers AI)',
  description:
    "Typesafe's typed-judgment model at Workers AI's own endpoint - noul, choice and score questions answered as calibrated probabilities; 32k context; zero data retention; billed from the account's credits, no gateway in the way",
  provider: 'cloudflare',
  providerUrl: 'https://docs.typesafe.ai/models',
  default: false,
  available: true,
  requiredEnvVars: [],
  capabilities: ['judgments'],
  billing: 'credits',
  route: 'workers-ai',
  contextWindow: 32000,
  zeroDataRetention: true,
  requestLogging: 'none',
  pricing: { inputUsdPerMillion: 0.042, outputUsdPerMillion: 0.0 },
};

export const OLLAMA_GEMMA3_4B_0_0_1: AIModel = {
  id: 'ollama:gemma3:4b',
  version: '0.0.1',
  name: 'Gemma 3 4B (Ollama)',
  description:
    'Gemma 3 4B running locally through Ollama - small and fast, no tool calling',
  provider: 'ollama',
  providerUrl: 'https://ollama.com/library/gemma3:4b',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 4096,
  local: true,
  capabilities: ['chat'],
};

export const OLLAMA_LLAMA3_1_8B_0_0_1: AIModel = {
  id: 'ollama:llama3.1:8b',
  version: '0.0.1',
  name: 'Llama 3.1 8B (Ollama)',
  description:
    'Meta Llama 3.1 8B running locally through Ollama - tool calling, no data leaves the machine',
  provider: 'ollama',
  providerUrl: 'https://ollama.com/library/llama3.1:8b',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 4096,
  local: true,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const OLLAMA_QWEN2_5_CODER_7B_0_0_1: AIModel = {
  id: 'ollama:qwen2.5-coder:7b',
  version: '0.0.1',
  name: 'Qwen2.5 Coder 7B (Ollama)',
  description:
    'Qwen2.5 Coder 7B running locally through Ollama - code-focused with tool calling',
  provider: 'ollama',
  providerUrl: 'https://ollama.com/library/qwen2.5-coder:7b',
  default: false,
  available: false,
  requiredEnvVars: [],
  tokensLimit: 4096,
  local: true,
  capabilities: ['chat', 'tools', 'codemode'],
};

export const OPENAI_GPT_4_1_MINI_0_0_1: AIModel = {
  id: 'openai:gpt-4.1-mini',
  version: '0.0.1',
  name: 'OpenAI GPT-4.1 Mini',
  description: 'GPT-4.1 Mini by OpenAI - compact version of GPT-4.1',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/gpt-4.1-mini',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 32768,
};

export const OPENAI_GPT_4_1_NANO_0_0_1: AIModel = {
  id: 'openai:gpt-4.1-nano',
  version: '0.0.1',
  name: 'OpenAI GPT-4.1 Nano',
  description: 'GPT-4.1 Nano by OpenAI - smallest and fastest',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/gpt-4.1-nano',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 32768,
};

export const OPENAI_GPT_4_1_0_0_1: AIModel = {
  id: 'openai:gpt-4.1',
  version: '0.0.1',
  name: 'OpenAI GPT-4.1',
  description: 'GPT-4.1 by OpenAI - strong general purpose model',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/gpt-4.1',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 32768,
};

export const OPENAI_GPT_4O_MINI_0_0_1: AIModel = {
  id: 'openai:gpt-4o-mini',
  version: '0.0.1',
  name: 'OpenAI GPT-4o Mini',
  description: 'GPT-4o Mini by OpenAI - compact and cost-effective',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 16384,
};

export const OPENAI_GPT_4O_0_0_1: AIModel = {
  id: 'openai:gpt-4o',
  version: '0.0.1',
  name: 'OpenAI GPT-4o',
  description: 'GPT-4o by OpenAI - fast multimodal model',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/gpt-4o',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 16384,
};

export const OPENAI_O3_MINI_0_0_1: AIModel = {
  id: 'openai:o3-mini',
  version: '0.0.1',
  name: 'OpenAI o3 Mini',
  description: 'o3 Mini by OpenAI - reasoning-focused compact model',
  provider: 'openai',
  providerUrl: 'https://platform.openai.com/docs/models/o3-mini',
  default: false,
  available: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
  tokensLimit: 100000,
};

// ============================================================================
// AI Model Catalog
// ============================================================================

export const AI_MODEL_CATALOGUE: Record<string, AIModel> = {
  'alibaba:qwen-max': ALIBABA_QWEN_MAX_0_0_1,
  'alibaba:qwen3-32b': ALIBABA_QWEN3_32B_0_0_1,
  'alibaba:qwen3.6-flash': ALIBABA_QWEN3_6_FLASH_0_0_1,
  'alibaba:qwen3.6-plus': ALIBABA_QWEN3_6_PLUS_0_0_1,
  'alibaba:qwen3.7-plus': ALIBABA_QWEN3_7_PLUS_0_0_1,
  'anthropic:claude-3-5-haiku-20241022':
    ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_0_0_1,
  'anthropic:claude-opus-4-20250514': ANTHROPIC_CLAUDE_OPUS_4_20250514_0_0_1,
  'anthropic:claude-sonnet-4-5-20250514':
    ANTHROPIC_CLAUDE_SONNET_4_5_20250514_0_0_1,
  'anthropic:claude-sonnet-4-20250514':
    ANTHROPIC_CLAUDE_SONNET_4_20250514_0_0_1,
  'azure-openai:gpt-4.1-mini': AZURE_OPENAI_GPT_4_1_MINI_0_0_1,
  'azure-openai:gpt-4.1-nano': AZURE_OPENAI_GPT_4_1_NANO_0_0_1,
  'azure-openai:gpt-4.1': AZURE_OPENAI_GPT_4_1_0_0_1,
  'azure-openai:gpt-4o-mini': AZURE_OPENAI_GPT_4O_MINI_0_0_1,
  'azure-openai:gpt-4o': AZURE_OPENAI_GPT_4O_0_0_1,
  'bedrock:us.anthropic.claude-fable-5':
    BEDROCK_US_ANTHROPIC_CLAUDE_FABLE_5_0_0_1,
  'bedrock:us.anthropic.claude-opus-4-6-v1':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0_0_1,
  'bedrock:us.anthropic.claude-opus-4-8':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_8_0_0_1,
  'bedrock:us.anthropic.claude-opus-4-20250514-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0_0_0_1,
  'bedrock:us.anthropic.claude-opus-5':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_5_0_0_1,
  'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0_0_0_1,
  'bedrock:us.anthropic.claude-sonnet-4-6':
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6_0_0_1,
  'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0_0_0_1,
  'cloudflare:gtw/typesafe/jev': CLOUDFLARE_GTW_TYPESAFE_JEV_0_0_1,
  'cloudflare:wrk/google/gemma-4-26b-a4b-it':
    CLOUDFLARE_WRK_GOOGLE_GEMMA_4_26B_A4B_IT_0_0_1,
  'cloudflare:wrk/zai-org/glm-5.2': CLOUDFLARE_WRK_ZAI_ORG_GLM_5_2_0_0_1,
  'cloudflare:wrk/openai/gpt-oss-120b':
    CLOUDFLARE_WRK_OPENAI_GPT_OSS_120B_0_0_1,
  'cloudflare:wrk/moonshotai/kimi-k2.6':
    CLOUDFLARE_WRK_MOONSHOTAI_KIMI_K2_6_0_0_1,
  'cloudflare:wrk/meta/llama-3.3-70b-instruct-fp8-fast':
    CLOUDFLARE_WRK_META_LLAMA_3_3_70B_INSTRUCT_FP8_FAST_0_0_1,
  'cloudflare:wrk/qwen/qwen3.8-27b': CLOUDFLARE_WRK_QWEN_QWEN3_8_27B_0_0_1,
  'cloudflare:wrk/typesafe/jev': CLOUDFLARE_WRK_TYPESAFE_JEV_0_0_1,
  'ollama:gemma3:4b': OLLAMA_GEMMA3_4B_0_0_1,
  'ollama:llama3.1:8b': OLLAMA_LLAMA3_1_8B_0_0_1,
  'ollama:qwen2.5-coder:7b': OLLAMA_QWEN2_5_CODER_7B_0_0_1,
  'openai:gpt-4.1-mini': OPENAI_GPT_4_1_MINI_0_0_1,
  'openai:gpt-4.1-nano': OPENAI_GPT_4_1_NANO_0_0_1,
  'openai:gpt-4.1': OPENAI_GPT_4_1_0_0_1,
  'openai:gpt-4o-mini': OPENAI_GPT_4O_MINI_0_0_1,
  'openai:gpt-4o': OPENAI_GPT_4O_0_0_1,
  'openai:o3-mini': OPENAI_O3_MINI_0_0_1,
};

/**
 * The ids a model answered to before its id moved, to the id it has now.
 * Kept apart from the catalogue, which lists each model once.
 */
export const AI_MODEL_ALIASES: Record<string, string> = {
  'cloudflare:google/gemma-4-26b-a4b-it':
    'cloudflare:wrk/google/gemma-4-26b-a4b-it',
  'cloudflare:zai-org/glm-5.2': 'cloudflare:wrk/zai-org/glm-5.2',
  'cloudflare:openai/gpt-oss-120b': 'cloudflare:wrk/openai/gpt-oss-120b',
  'cloudflare:moonshotai/kimi-k2.6': 'cloudflare:wrk/moonshotai/kimi-k2.6',
  'cloudflare:meta/llama-3.3-70b-instruct-fp8-fast':
    'cloudflare:wrk/meta/llama-3.3-70b-instruct-fp8-fast',
  'cloudflare:qwen/qwen3.8-27b': 'cloudflare:wrk/qwen/qwen3.8-27b',
};

/** A model by its id, or by an id it had before; undefined when the catalogue has neither. */
export function getModel(modelId: string): AIModel | undefined {
  return AI_MODEL_CATALOGUE[AI_MODEL_ALIASES[modelId] ?? modelId];
}

/**
 * A model a chat can run on: not a typed-judgment model (Jev), which
 * answers typed questions about a state and nothing else. A spec that
 * states no capability is read as a chat model.
 */
export function isChatModel(model: AIModel): boolean {
  return !(model.capabilities ?? []).includes('judgments');
}

/** The models a person choosing a chat model is offered from. */
export function listChatModels(): AIModel[] {
  return Object.values(AI_MODEL_CATALOGUE).filter(isChatModel);
}

export const DEFAULT_MODEL: AIModelId =
  AIModels.BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6;
export const DEFAULT_MODEL_SPEC: AIModel =
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_6_0_0_1;
