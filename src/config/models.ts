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

// ============================================================================
// AIModel Type
// ============================================================================

export interface AIModel {
  /** Unique model identifier (e.g., 'anthropic:claude-sonnet-4-5-20250514') */
  id: string;
  /** Display name for the model */
  name: string;
  /** Model description */
  description: string;
  /** Provider name (anthropic, openai, bedrock, azure-openai) */
  provider: string;
  /** Whether this is the default model */
  default: boolean;
  /** Required environment variable names */
  requiredEnvVars: string[];
}

// ============================================================================
// AIModels Enum
// ============================================================================

export const AIModels = {
  ANTHROPIC_CLAUDE_3_5_HAIKU_20241022: 'anthropic:claude-3-5-haiku-20241022',
  ANTHROPIC_CLAUDE_OPUS_4_20250514: 'anthropic:claude-opus-4-20250514',
  ANTHROPIC_CLAUDE_SONNET_4_5_20250514: 'anthropic:claude-sonnet-4-5-20250514',
  ANTHROPIC_CLAUDE_SONNET_4_20250514: 'anthropic:claude-sonnet-4-20250514',
  AZURE_OPENAI_GPT_4_1_MINI: 'azure-openai:gpt-4.1-mini',
  AZURE_OPENAI_GPT_4_1_NANO: 'azure-openai:gpt-4.1-nano',
  AZURE_OPENAI_GPT_4_1: 'azure-openai:gpt-4.1',
  AZURE_OPENAI_GPT_4O_MINI: 'azure-openai:gpt-4o-mini',
  AZURE_OPENAI_GPT_4O: 'azure-openai:gpt-4o',
  BEDROCK_US_ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_V1_0:
    'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0:
    'bedrock:us.anthropic.claude-opus-4-6-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0:
    'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0:
    'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0:
    'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
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

export const ANTHROPIC_CLAUDE_3_5_HAIKU_20241022: AIModel = {
  id: 'anthropic:claude-3-5-haiku-20241022',
  name: 'Anthropic Claude Haiku 3.5',
  description: 'Claude Haiku 3.5 by Anthropic - fast and efficient',
  provider: 'anthropic',
  default: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
};

export const ANTHROPIC_CLAUDE_OPUS_4_20250514: AIModel = {
  id: 'anthropic:claude-opus-4-20250514',
  name: 'Anthropic Claude Opus 4',
  description: 'Claude Opus 4 by Anthropic - highest capability model',
  provider: 'anthropic',
  default: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
};

export const ANTHROPIC_CLAUDE_SONNET_4_5_20250514: AIModel = {
  id: 'anthropic:claude-sonnet-4-5-20250514',
  name: 'Anthropic Claude Sonnet 4.5',
  description:
    'Claude Sonnet 4.5 by Anthropic - balanced performance and speed',
  provider: 'anthropic',
  default: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
};

export const ANTHROPIC_CLAUDE_SONNET_4_20250514: AIModel = {
  id: 'anthropic:claude-sonnet-4-20250514',
  name: 'Anthropic Claude Sonnet 4',
  description: 'Claude Sonnet 4 by Anthropic - strong reasoning and coding',
  provider: 'anthropic',
  default: false,
  requiredEnvVars: ['ANTHROPIC_API_KEY'],
};

export const AZURE_OPENAI_GPT_4_1_MINI: AIModel = {
  id: 'azure-openai:gpt-4.1-mini',
  name: 'Azure OpenAI GPT-4.1 Mini',
  description: 'GPT-4.1 Mini via Azure OpenAI - compact version',
  provider: 'azure-openai',
  default: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
};

export const AZURE_OPENAI_GPT_4_1_NANO: AIModel = {
  id: 'azure-openai:gpt-4.1-nano',
  name: 'Azure OpenAI GPT-4.1 Nano',
  description: 'GPT-4.1 Nano via Azure OpenAI - smallest and fastest',
  provider: 'azure-openai',
  default: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
};

export const AZURE_OPENAI_GPT_4_1: AIModel = {
  id: 'azure-openai:gpt-4.1',
  name: 'Azure OpenAI GPT-4.1',
  description: 'GPT-4.1 via Azure OpenAI - strong general purpose',
  provider: 'azure-openai',
  default: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
};

export const AZURE_OPENAI_GPT_4O_MINI: AIModel = {
  id: 'azure-openai:gpt-4o-mini',
  name: 'Azure OpenAI GPT-4o Mini',
  description: 'GPT-4o Mini via Azure OpenAI - compact enterprise deployment',
  provider: 'azure-openai',
  default: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
};

export const AZURE_OPENAI_GPT_4O: AIModel = {
  id: 'azure-openai:gpt-4o',
  name: 'Azure OpenAI GPT-4o',
  description: 'GPT-4o via Azure OpenAI - enterprise deployment',
  provider: 'azure-openai',
  default: false,
  requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_V1_0: AIModel = {
  id: 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0',
  name: 'Bedrock Claude Haiku 3.5',
  description: 'Claude Haiku 3.5 via AWS Bedrock - fast and efficient',
  provider: 'bedrock',
  default: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-4-6-v1:0',
  name: 'Bedrock Claude Opus 4.6',
  description: 'Claude Opus 4.6 via AWS Bedrock - latest flagship model',
  provider: 'bedrock',
  default: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0: AIModel = {
  id: 'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
  name: 'Bedrock Claude Opus 4',
  description: 'Claude Opus 4 via AWS Bedrock - highest capability',
  provider: 'bedrock',
  default: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0: AIModel = {
  id: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  name: 'Bedrock Claude Sonnet 4.5',
  description: 'Claude Sonnet 4.5 via AWS Bedrock - balanced performance',
  provider: 'bedrock',
  default: true,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
};

export const BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0: AIModel = {
  id: 'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
  name: 'Bedrock Claude Sonnet 4',
  description: 'Claude Sonnet 4 via AWS Bedrock - strong reasoning',
  provider: 'bedrock',
  default: false,
  requiredEnvVars: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ],
};

export const OPENAI_GPT_4_1_MINI: AIModel = {
  id: 'openai:gpt-4.1-mini',
  name: 'OpenAI GPT-4.1 Mini',
  description: 'GPT-4.1 Mini by OpenAI - compact version of GPT-4.1',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

export const OPENAI_GPT_4_1_NANO: AIModel = {
  id: 'openai:gpt-4.1-nano',
  name: 'OpenAI GPT-4.1 Nano',
  description: 'GPT-4.1 Nano by OpenAI - smallest and fastest',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

export const OPENAI_GPT_4_1: AIModel = {
  id: 'openai:gpt-4.1',
  name: 'OpenAI GPT-4.1',
  description: 'GPT-4.1 by OpenAI - strong general purpose model',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

export const OPENAI_GPT_4O_MINI: AIModel = {
  id: 'openai:gpt-4o-mini',
  name: 'OpenAI GPT-4o Mini',
  description: 'GPT-4o Mini by OpenAI - compact and cost-effective',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

export const OPENAI_GPT_4O: AIModel = {
  id: 'openai:gpt-4o',
  name: 'OpenAI GPT-4o',
  description: 'GPT-4o by OpenAI - fast multimodal model',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

export const OPENAI_O3_MINI: AIModel = {
  id: 'openai:o3-mini',
  name: 'OpenAI o3 Mini',
  description: 'o3 Mini by OpenAI - reasoning-focused compact model',
  provider: 'openai',
  default: false,
  requiredEnvVars: ['OPENAI_API_KEY'],
};

// ============================================================================
// AI Model Catalog
// ============================================================================

export const AI_MODEL_CATALOGUE: Record<string, AIModel> = {
  'anthropic:claude-3-5-haiku-20241022': ANTHROPIC_CLAUDE_3_5_HAIKU_20241022,
  'anthropic:claude-opus-4-20250514': ANTHROPIC_CLAUDE_OPUS_4_20250514,
  'anthropic:claude-sonnet-4-5-20250514': ANTHROPIC_CLAUDE_SONNET_4_5_20250514,
  'anthropic:claude-sonnet-4-20250514': ANTHROPIC_CLAUDE_SONNET_4_20250514,
  'azure-openai:gpt-4.1-mini': AZURE_OPENAI_GPT_4_1_MINI,
  'azure-openai:gpt-4.1-nano': AZURE_OPENAI_GPT_4_1_NANO,
  'azure-openai:gpt-4.1': AZURE_OPENAI_GPT_4_1,
  'azure-openai:gpt-4o-mini': AZURE_OPENAI_GPT_4O_MINI,
  'azure-openai:gpt-4o': AZURE_OPENAI_GPT_4O,
  'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_3_5_HAIKU_20241022_V1_0,
  'bedrock:us.anthropic.claude-opus-4-6-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_6_V1_0,
  'bedrock:us.anthropic.claude-opus-4-20250514-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_OPUS_4_20250514_V1_0,
  'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0,
  'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0':
    BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0,
  'openai:gpt-4.1-mini': OPENAI_GPT_4_1_MINI,
  'openai:gpt-4.1-nano': OPENAI_GPT_4_1_NANO,
  'openai:gpt-4.1': OPENAI_GPT_4_1,
  'openai:gpt-4o-mini': OPENAI_GPT_4O_MINI,
  'openai:gpt-4o': OPENAI_GPT_4O,
  'openai:o3-mini': OPENAI_O3_MINI,
};

export const DEFAULT_MODEL: AIModelId =
  AIModels.BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0;
export const DEFAULT_MODEL_SPEC: AIModel =
  BEDROCK_US_ANTHROPIC_CLAUDE_SONNET_4_5_20250929_V1_0;
