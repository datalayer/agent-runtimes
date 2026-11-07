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

import type { EnvvarSpec } from '../types';

// ============================================================================
// Environment Variable Definitions
// ============================================================================

export const ALPHAVANTAGE_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'ALPHAVANTAGE_API_KEY',
  version: '0.0.1',
  name: 'Alpha Vantage API Key',
  description:
    'API key for accessing Alpha Vantage financial market data and stock information. Provides real-time and historical stock prices, forex data, and cryptocurrency information.',
  registrationUrl: 'https://www.alphavantage.co/support/#api-key',
  tags: ['authentication', 'api-key', 'finance', 'stocks', 'market-data'],
  icon: 'key',
  emoji: '🔑',
};

export const ANTHROPIC_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'ANTHROPIC_API_KEY',
  version: '0.0.1',
  name: 'Anthropic API Key',
  description:
    "API key for Anthropic's Claude API. Required by the Claude Code harness run locally, and by any harness configured with Anthropic as its model provider there; the person's own, never a Claude.ai subscription login. A Datalayer runtime takes no key: its model calls go through ai-inference.",
  registrationUrl: 'https://platform.claude.com/settings/keys',
  tags: ['authentication', 'api-key', 'anthropic', 'harness'],
  icon: 'key',
  emoji: '🔑',
};

export const BLUESKY_APP_PASSWORD_SPEC_0_0_1: EnvvarSpec = {
  id: 'BLUESKY_APP_PASSWORD',
  version: '0.0.1',
  name: 'Bluesky App Password',
  description:
    "An app password of the Bluesky account, made for this integration alone — Settings, Privacy and security, App passwords, Add app password — never the account's own password. Read by the Bluesky MCP server with the handle beside it; revoke it there to cut the server off.",
  registrationUrl: 'https://bsky.app/settings/app-passwords',
  tags: ['authentication', 'password', 'bluesky', 'social'],
  icon: 'key',
  emoji: '🔑',
};

export const BLUESKY_IDENTIFIER_SPEC_0_0_1: EnvvarSpec = {
  id: 'BLUESKY_IDENTIFIER',
  version: '0.0.1',
  name: 'Bluesky Handle',
  description:
    'The handle of the Bluesky account the server acts as, `name.bsky.social` or a custom domain. Read by the Bluesky MCP server with the app password beside it.',
  registrationUrl: 'https://bsky.app',
  tags: ['authentication', 'username', 'bluesky', 'social'],
  icon: 'key',
  emoji: '🦋',
};

export const BLUESKY_SERVICE_URL_SPEC_0_0_1: EnvvarSpec = {
  id: 'BLUESKY_SERVICE_URL',
  version: '0.0.1',
  name: 'Bluesky Service URL',
  description:
    "The AT Protocol service the Bluesky MCP server signs in to. `https://bsky.social` for an account on Bluesky's own servers; a self-hosted PDS names its own address.",
  registrationUrl: 'https://atproto.com/guides/self-hosting',
  tags: ['configuration', 'url', 'bluesky'],
  icon: 'link',
  emoji: '🔗',
};

export const DISCORD_BOT_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'DISCORD_BOT_TOKEN',
  version: '0.0.1',
  name: 'Discord Bot Token',
  description:
    "The token of a Discord bot, from its application's Bot page in the Discord Developer Portal (Reset Token to see it once). The bot is invited to the server with the permissions of what the agent may do, and the Message Content intent when it reads messages. Read by the Discord MCP server as DISCORD_TOKEN.",
  registrationUrl: 'https://discord.com/developers/applications',
  tags: ['authentication', 'token', 'discord', 'social'],
  icon: 'key',
  emoji: '🔑',
};

export const DISCORD_GUILD_ID_SPEC_0_0_1: EnvvarSpec = {
  id: 'DISCORD_GUILD_ID',
  version: '0.0.1',
  name: 'Discord Server ID',
  description:
    'The id of the Discord server (guild) the bot works in by default — copied from the server with Developer Mode on, Copy Server ID. Optional; a tool may name another server.',
  registrationUrl: 'https://support.discord.com/hc/en-us/articles/206346498',
  tags: ['configuration', 'discord'],
  icon: 'link',
  emoji: '🔗',
};

export const EARTHDATA_PASSWORD_SPEC_0_0_1: EnvvarSpec = {
  id: 'EARTHDATA_PASSWORD',
  version: '0.0.1',
  name: 'Earthdata Login Password',
  description:
    'The password of a NASA Earthdata Login. Read in the code sandbox by the script that the download tool of the Earthdata MCP server writes, to download granules; searching needs none.',
  registrationUrl: 'https://urs.earthdata.nasa.gov/users/new',
  tags: ['authentication', 'password', 'earthdata', 'sandbox'],
  icon: 'key',
  emoji: '🔑',
};

export const EARTHDATA_USERNAME_SPEC_0_0_1: EnvvarSpec = {
  id: 'EARTHDATA_USERNAME',
  version: '0.0.1',
  name: 'Earthdata Login Username',
  description:
    'The username of a NASA Earthdata Login. Read in the code sandbox by the script that the download tool of the Earthdata MCP server writes, to download granules; searching needs none.',
  registrationUrl: 'https://urs.earthdata.nasa.gov/users/new',
  tags: ['authentication', 'username', 'earthdata', 'sandbox'],
  icon: 'key',
  emoji: '🔑',
};

export const GEMINI_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'GEMINI_API_KEY',
  version: '0.0.1',
  name: 'Gemini API Key',
  description:
    "API key for Google's Gemini API. Required by the Gemini CLI harness in place of a Google login; the person's own.",
  registrationUrl: 'https://aistudio.google.com/apikey',
  tags: ['authentication', 'api-key', 'google', 'harness'],
  icon: 'key',
  emoji: '🔑',
};

export const GITHUB_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'GITHUB_TOKEN',
  version: '0.0.1',
  name: 'GitHub Token',
  description:
    'GitHub API token for repository management and code operations. Required for GitHub MCP server and GitHub skill to interact with GitHub repositories programmatically.',
  registrationUrl: 'https://github.com/settings/tokens',
  tags: ['authentication', 'token', 'github', 'git', 'mcp-server', 'skill'],
  icon: 'key',
  emoji: '🔑',
};

export const GOOGLE_OAUTH_CLIENT_ID_SPEC_0_0_1: EnvvarSpec = {
  id: 'GOOGLE_OAUTH_CLIENT_ID',
  version: '0.0.1',
  name: 'Google OAuth Client ID',
  description:
    'OAuth 2.0 client ID for Google Workspace authentication. Required for Google Drive, Gmail, Calendar, and Docs integration through the Google Workspace MCP server.',
  registrationUrl: 'https://console.cloud.google.com/apis/credentials',
  tags: ['authentication', 'oauth', 'google', 'workspace', 'client-id'],
  icon: 'key',
  emoji: '🔑',
};

export const GOOGLE_OAUTH_CLIENT_SECRET_SPEC_0_0_1: EnvvarSpec = {
  id: 'GOOGLE_OAUTH_CLIENT_SECRET',
  version: '0.0.1',
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

export const HF_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'HF_TOKEN',
  version: '0.0.1',
  name: 'Hugging Face Token',
  description:
    'Access token for Hugging Face API. Required for Hugging Face MCP server authentication. Create a READ token from your settings.',
  registrationUrl: 'https://huggingface.co/settings/tokens',
  tags: ['authentication', 'api-key', 'huggingface', 'machine-learning'],
  icon: 'key',
  emoji: '🔑',
};

export const KAGGLE_API_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'KAGGLE_API_TOKEN',
  version: '0.0.1',
  name: 'Kaggle API Token',
  description:
    'API token for accessing Kaggle datasets, competitions, notebooks, and models. Required for Kaggle MCP server authentication.',
  registrationUrl: 'https://www.kaggle.com/settings/account',
  tags: ['authentication', 'api-key', 'kaggle', 'data'],
  icon: 'key',
  emoji: '🔑',
};

export const LLM_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'LLM_API_KEY',
  version: '0.0.1',
  name: 'OpenHands LLM API Key',
  description:
    "The model provider's key the OpenHands CLI reads, with LLM_MODEL, when started with --override-with-envs. Required by the OpenHands harness; the person's own key at their provider.",
  registrationUrl:
    'https://docs.openhands.dev/openhands/usage/cli/installation',
  tags: ['authentication', 'api-key', 'openhands', 'harness'],
  icon: 'key',
  emoji: '🔑',
};

export const OPENAI_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'OPENAI_API_KEY',
  version: '0.0.1',
  name: 'OpenAI API Key',
  description:
    "API key for OpenAI's API. Required by the Codex harness run locally, which takes it in place of a ChatGPT login; the person's own. A Datalayer runtime takes no key: its model calls go through ai-inference.",
  registrationUrl: 'https://platform.openai.com/api-keys',
  tags: ['authentication', 'api-key', 'openai', 'harness'],
  icon: 'key',
  emoji: '🔑',
};

export const SLACK_BOT_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'SLACK_BOT_TOKEN',
  version: '0.0.1',
  name: 'Slack Bot Token',
  description:
    'OAuth token for Slack bot authentication. Required for Slack MCP server to send messages, manage channels, and interact with workspace members.',
  registrationUrl: 'https://api.slack.com/apps',
  tags: ['authentication', 'oauth', 'token', 'slack', 'messaging', 'bot'],
  icon: 'key',
  emoji: '🔑',
};

export const SLACK_CHANNEL_IDS_SPEC_0_0_1: EnvvarSpec = {
  id: 'SLACK_CHANNEL_IDS',
  version: '0.0.1',
  name: 'Slack Channel IDs',
  description:
    'Comma-separated list of Slack channel IDs that the bot is allowed to access. Restricts bot operations to specific channels for security and organization.',
  tags: ['configuration', 'slack', 'channels', 'identifier'],
  icon: 'hash',
  emoji: undefined,
};

export const SLACK_TEAM_ID_SPEC_0_0_1: EnvvarSpec = {
  id: 'SLACK_TEAM_ID',
  version: '0.0.1',
  name: 'Slack Team ID',
  description:
    'Unique identifier for the Slack workspace (team). Required to specify which workspace the bot should connect to.',
  registrationUrl: 'https://api.slack.com/apps',
  tags: ['configuration', 'slack', 'workspace', 'identifier'],
  icon: 'organization',
  emoji: '🏢',
};

export const TAVILY_API_KEY_SPEC_0_0_1: EnvvarSpec = {
  id: 'TAVILY_API_KEY',
  version: '0.0.1',
  name: 'Tavily API Key',
  description:
    'API key for Tavily web search and research capabilities. Required for web crawling, content extraction, and search operations.',
  registrationUrl: 'https://tavily.com/api-keys',
  tags: ['authentication', 'api-key', 'search', 'web', 'research'],
  icon: 'key',
  emoji: '🔑',
};

export const X_BEARER_TOKEN_SPEC_0_0_1: EnvvarSpec = {
  id: 'X_BEARER_TOKEN',
  version: '0.0.1',
  name: 'X App-only Bearer Token',
  description:
    "The App-only Bearer Token of an X app, from its Keys and tokens page in the X Developer Portal. Sent as the bearer to X's remote MCP server at https://api.x.com/mcp, which then answers its read tools — posts, search, users, news and trends — with no user context. Writing (bookmarks, articles) needs the xurl bridge and an OAuth 2.0 login instead.",
  registrationUrl: 'https://developer.x.com/en/portal/dashboard',
  tags: ['authentication', 'token', 'x', 'social'],
  icon: 'key',
  emoji: '🔑',
};

// ============================================================================
// Environment Variable Catalog
// ============================================================================

export const ENVVAR_CATALOG: Record<string, EnvvarSpec> = {
  ALPHAVANTAGE_API_KEY: ALPHAVANTAGE_API_KEY_SPEC_0_0_1,
  ANTHROPIC_API_KEY: ANTHROPIC_API_KEY_SPEC_0_0_1,
  BLUESKY_APP_PASSWORD: BLUESKY_APP_PASSWORD_SPEC_0_0_1,
  BLUESKY_IDENTIFIER: BLUESKY_IDENTIFIER_SPEC_0_0_1,
  BLUESKY_SERVICE_URL: BLUESKY_SERVICE_URL_SPEC_0_0_1,
  DISCORD_BOT_TOKEN: DISCORD_BOT_TOKEN_SPEC_0_0_1,
  DISCORD_GUILD_ID: DISCORD_GUILD_ID_SPEC_0_0_1,
  EARTHDATA_PASSWORD: EARTHDATA_PASSWORD_SPEC_0_0_1,
  EARTHDATA_USERNAME: EARTHDATA_USERNAME_SPEC_0_0_1,
  GEMINI_API_KEY: GEMINI_API_KEY_SPEC_0_0_1,
  GITHUB_TOKEN: GITHUB_TOKEN_SPEC_0_0_1,
  GOOGLE_OAUTH_CLIENT_ID: GOOGLE_OAUTH_CLIENT_ID_SPEC_0_0_1,
  GOOGLE_OAUTH_CLIENT_SECRET: GOOGLE_OAUTH_CLIENT_SECRET_SPEC_0_0_1,
  HF_TOKEN: HF_TOKEN_SPEC_0_0_1,
  KAGGLE_API_TOKEN: KAGGLE_API_TOKEN_SPEC_0_0_1,
  LLM_API_KEY: LLM_API_KEY_SPEC_0_0_1,
  OPENAI_API_KEY: OPENAI_API_KEY_SPEC_0_0_1,
  SLACK_BOT_TOKEN: SLACK_BOT_TOKEN_SPEC_0_0_1,
  SLACK_CHANNEL_IDS: SLACK_CHANNEL_IDS_SPEC_0_0_1,
  SLACK_TEAM_ID: SLACK_TEAM_ID_SPEC_0_0_1,
  TAVILY_API_KEY: TAVILY_API_KEY_SPEC_0_0_1,
  X_BEARER_TOKEN: X_BEARER_TOKEN_SPEC_0_0_1,
};

function resolveEnvvarId(envvarId: string): string {
  if (envvarId in ENVVAR_CATALOG) return envvarId;
  const idx = envvarId.lastIndexOf(':');
  if (idx > 0) {
    const base = envvarId.slice(0, idx);
    if (base in ENVVAR_CATALOG) return base;
  }
  return envvarId;
}

export function getEnvvarSpec(envvarId: string): EnvvarSpec {
  const spec = ENVVAR_CATALOG[resolveEnvvarId(envvarId)];
  if (!spec) {
    throw new Error(`Unknown environment variable: ${envvarId}`);
  }
  return spec;
}
