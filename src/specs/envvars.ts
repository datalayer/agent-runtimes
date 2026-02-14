/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Environment Variable Catalog
 *
 * Predefined environment variable specifications.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

export interface EnvvarSpec {
  id: string;
  name: string;
  description: string;
  registrationUrl?: string;
  tags: string[];
  icon?: string;
  emoji?: string;
}

// ============================================================================
// Environment Variable Definitions
// ============================================================================

export const ALPHAVANTAGE_API_KEY_SPEC: EnvvarSpec = {
  id: 'ALPHAVANTAGE_API_KEY',
  name: 'Alpha Vantage API Key',
  description:
    'API key for accessing Alpha Vantage financial market data and stock information. Provides real-time and historical stock prices, forex data, and cryptocurrency information.',
  registrationUrl: 'https://www.alphavantage.co/support/#api-key',
  tags: ['authentication', 'api-key', 'finance', 'stocks', 'market-data'],
  icon: 'key',
  emoji: '🔑',
};

export const GITHUB_TOKEN_SPEC: EnvvarSpec = {
  id: 'GITHUB_TOKEN',
  name: 'GitHub Token',
  description:
    'GitHub API token for repository management and code operations. Required for GitHub MCP server and GitHub skill to interact with GitHub repositories programmatically.',
  registrationUrl: 'https://github.com/settings/tokens',
  tags: ['authentication', 'token', 'github', 'git', 'mcp-server', 'skill'],
  icon: 'key',
  emoji: '🔑',
};

export const GOOGLE_OAUTH_CLIENT_ID_SPEC: EnvvarSpec = {
  id: 'GOOGLE_OAUTH_CLIENT_ID',
  name: 'Google OAuth Client ID',
  description:
    'OAuth 2.0 client ID for Google Workspace authentication. Required for Google Drive, Gmail, Calendar, and Docs integration through the Google Workspace MCP server.',
  registrationUrl: 'https://console.cloud.google.com/apis/credentials',
  tags: ['authentication', 'oauth', 'google', 'workspace', 'client-id'],
  icon: 'key',
  emoji: '🔑',
};

export const GOOGLE_OAUTH_CLIENT_SECRET_SPEC: EnvvarSpec = {
  id: 'GOOGLE_OAUTH_CLIENT_SECRET',
  name: 'Google OAuth Client Secret',
  description:
    'OAuth 2.0 client secret for Google Workspace authentication. Used in conjunction with client ID for secure API access to Google services.',
  registrationUrl: 'https://console.cloud.google.com/apis/credentials',
  tags: [
    'authentication',
    'oauth',
    'google',
    'workspace',
    'client-secret',
    'security',
  ],
  icon: 'lock',
  emoji: '🔒',
};

export const HF_TOKEN_SPEC: EnvvarSpec = {
  id: 'HF_TOKEN',
  name: 'Hugging Face Token',
  description:
    'Access token for Hugging Face API. Required for Hugging Face MCP server authentication. Create a READ token from your settings.',
  registrationUrl: 'https://huggingface.co/settings/tokens',
  tags: ['authentication', 'api-key', 'huggingface', 'machine-learning'],
  icon: 'key',
  emoji: '🔑',
};

export const KAGGLE_TOKEN_SPEC: EnvvarSpec = {
  id: 'KAGGLE_TOKEN',
  name: 'Kaggle API Token',
  description:
    'API token for accessing Kaggle datasets, competitions, notebooks, and models. Required for Kaggle MCP server authentication.',
  registrationUrl: 'https://www.kaggle.com/settings/account',
  tags: ['authentication', 'api-key', 'kaggle', 'data'],
  icon: 'key',
  emoji: '🔑',
};

export const SLACK_BOT_TOKEN_SPEC: EnvvarSpec = {
  id: 'SLACK_BOT_TOKEN',
  name: 'Slack Bot Token',
  description:
    'OAuth token for Slack bot authentication. Required for Slack MCP server to send messages, manage channels, and interact with workspace members.',
  registrationUrl: 'https://api.slack.com/apps',
  tags: ['authentication', 'oauth', 'token', 'slack', 'messaging', 'bot'],
  icon: 'key',
  emoji: '🔑',
};

export const SLACK_CHANNEL_IDS_SPEC: EnvvarSpec = {
  id: 'SLACK_CHANNEL_IDS',
  name: 'Slack Channel IDs',
  description:
    'Comma-separated list of Slack channel IDs that the bot is allowed to access. Restricts bot operations to specific channels for security and organization.',
  tags: ['configuration', 'slack', 'channels', 'identifier'],
  icon: 'hash',
  emoji: undefined,
};

export const SLACK_TEAM_ID_SPEC: EnvvarSpec = {
  id: 'SLACK_TEAM_ID',
  name: 'Slack Team ID',
  description:
    'Unique identifier for the Slack workspace (team). Required to specify which workspace the bot should connect to.',
  registrationUrl: 'https://api.slack.com/apps',
  tags: ['configuration', 'slack', 'workspace', 'identifier'],
  icon: 'organization',
  emoji: '🏢',
};

export const TAVILY_API_KEY_SPEC: EnvvarSpec = {
  id: 'TAVILY_API_KEY',
  name: 'Tavily API Key',
  description:
    'API key for Tavily web search and research capabilities. Required for web crawling, content extraction, and search operations.',
  registrationUrl: 'https://tavily.com/api-keys',
  tags: ['authentication', 'api-key', 'search', 'web', 'research'],
  icon: 'key',
  emoji: '🔑',
};

// ============================================================================
// Environment Variable Catalog
// ============================================================================

export const ENVVAR_CATALOG: Record<string, EnvvarSpec> = {
  ALPHAVANTAGE_API_KEY: ALPHAVANTAGE_API_KEY_SPEC,
  GITHUB_TOKEN: GITHUB_TOKEN_SPEC,
  GOOGLE_OAUTH_CLIENT_ID: GOOGLE_OAUTH_CLIENT_ID_SPEC,
  GOOGLE_OAUTH_CLIENT_SECRET: GOOGLE_OAUTH_CLIENT_SECRET_SPEC,
  HF_TOKEN: HF_TOKEN_SPEC,
  KAGGLE_TOKEN: KAGGLE_TOKEN_SPEC,
  SLACK_BOT_TOKEN: SLACK_BOT_TOKEN_SPEC,
  SLACK_CHANNEL_IDS: SLACK_CHANNEL_IDS_SPEC,
  SLACK_TEAM_ID: SLACK_TEAM_ID_SPEC,
  TAVILY_API_KEY: TAVILY_API_KEY_SPEC,
};

export function getEnvvarSpec(envvarId: string): EnvvarSpec {
  const spec = ENVVAR_CATALOG[envvarId];
  if (!spec) {
    throw new Error(`Unknown environment variable: ${envvarId}`);
  }
  return spec;
}
