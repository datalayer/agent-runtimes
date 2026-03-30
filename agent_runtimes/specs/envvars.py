# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Environment Variable Catalog.

Predefined environment variable specifications.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import EnvvarSpec

# ============================================================================
# Environment Variable Definitions
# ============================================================================

ALPHAVANTAGE_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="ALPHAVANTAGE_API_KEY",
    version="0.0.1",
    name="Alpha Vantage API Key",
    description="API key for accessing Alpha Vantage financial market data and stock information. Provides real-time and historical stock prices, forex data, and cryptocurrency information.",
    registrationUrl="https://www.alphavantage.co/support/#api-key",
    tags=["authentication", "api-key", "finance", "stocks", "market-data"],
    icon="key",
    emoji="🔑",
)

GITHUB_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="GITHUB_TOKEN",
    version="0.0.1",
    name="GitHub Token",
    description="GitHub API token for repository management and code operations. Required for GitHub MCP server and GitHub skill to interact with GitHub repositories programmatically.",
    registrationUrl="https://github.com/settings/tokens",
    tags=["authentication", "token", "github", "git", "mcp-server", "skill"],
    icon="key",
    emoji="🔑",
)

GOOGLE_OAUTH_CLIENT_ID_SPEC_0_0_1 = EnvvarSpec(
    id="GOOGLE_OAUTH_CLIENT_ID",
    version="0.0.1",
    name="Google OAuth Client ID",
    description="OAuth 2.0 client ID for Google Workspace authentication. Required for Google Drive, Gmail, Calendar, and Docs integration through the Google Workspace MCP server.",
    registrationUrl="https://console.cloud.google.com/apis/credentials",
    tags=["authentication", "oauth", "google", "workspace", "client-id"],
    icon="key",
    emoji="🔑",
)

GOOGLE_OAUTH_CLIENT_SECRET_SPEC_0_0_1 = EnvvarSpec(
    id="GOOGLE_OAUTH_CLIENT_SECRET",
    version="0.0.1",
    name="Google OAuth Client Secret",
    description="OAuth 2.0 client secret for Google Workspace authentication. Used in conjunction with client ID for secure API access to Google services.",
    registrationUrl="https://console.cloud.google.com/apis/credentials",
    tags=["authentication", "oauth", "google", "workspace", "client-secret", "security"],
    icon="lock",
    emoji="🔒",
)

HF_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="HF_TOKEN",
    version="0.0.1",
    name="Hugging Face Token",
    description="Access token for Hugging Face API. Required for Hugging Face MCP server authentication. Create a READ token from your settings.",
    registrationUrl="https://huggingface.co/settings/tokens",
    tags=["authentication", "api-key", "huggingface", "machine-learning"],
    icon="key",
    emoji="🔑",
)

KAGGLE_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="KAGGLE_TOKEN",
    version="0.0.1",
    name="Kaggle API Token",
    description="API token for accessing Kaggle datasets, competitions, notebooks, and models. Required for Kaggle MCP server authentication.",
    registrationUrl="https://www.kaggle.com/settings/account",
    tags=["authentication", "api-key", "kaggle", "data"],
    icon="key",
    emoji="🔑",
)

SLACK_BOT_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="SLACK_BOT_TOKEN",
    version="0.0.1",
    name="Slack Bot Token",
    description="OAuth token for Slack bot authentication. Required for Slack MCP server to send messages, manage channels, and interact with workspace members.",
    registrationUrl="https://api.slack.com/apps",
    tags=["authentication", "oauth", "token", "slack", "messaging", "bot"],
    icon="key",
    emoji="🔑",
)

SLACK_CHANNEL_IDS_SPEC_0_0_1 = EnvvarSpec(
    id="SLACK_CHANNEL_IDS",
    version="0.0.1",
    name="Slack Channel IDs",
    description="Comma-separated list of Slack channel IDs that the bot is allowed to access. Restricts bot operations to specific channels for security and organization.",
    registrationUrl=None,
    tags=["configuration", "slack", "channels", "identifier"],
    icon="hash",
    emoji=None,
)

SLACK_TEAM_ID_SPEC_0_0_1 = EnvvarSpec(
    id="SLACK_TEAM_ID",
    version="0.0.1",
    name="Slack Team ID",
    description="Unique identifier for the Slack workspace (team). Required to specify which workspace the bot should connect to.",
    registrationUrl="https://api.slack.com/apps",
    tags=["configuration", "slack", "workspace", "identifier"],
    icon="organization",
    emoji="🏢",
)

TAVILY_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="TAVILY_API_KEY",
    version="0.0.1",
    name="Tavily API Key",
    description="API key for Tavily web search and research capabilities. Required for web crawling, content extraction, and search operations.",
    registrationUrl="https://tavily.com/api-keys",
    tags=["authentication", "api-key", "search", "web", "research"],
    icon="key",
    emoji="🔑",
)

# ============================================================================
# Environment Variable Catalog
# ============================================================================

ENVVAR_CATALOG: Dict[str, EnvvarSpec] = {
    "ALPHAVANTAGE_API_KEY": ALPHAVANTAGE_API_KEY_SPEC_0_0_1,
    "GITHUB_TOKEN": GITHUB_TOKEN_SPEC_0_0_1,
    "GOOGLE_OAUTH_CLIENT_ID": GOOGLE_OAUTH_CLIENT_ID_SPEC_0_0_1,
    "GOOGLE_OAUTH_CLIENT_SECRET": GOOGLE_OAUTH_CLIENT_SECRET_SPEC_0_0_1,
    "HF_TOKEN": HF_TOKEN_SPEC_0_0_1,
    "KAGGLE_TOKEN": KAGGLE_TOKEN_SPEC_0_0_1,
    "SLACK_BOT_TOKEN": SLACK_BOT_TOKEN_SPEC_0_0_1,
    "SLACK_CHANNEL_IDS": SLACK_CHANNEL_IDS_SPEC_0_0_1,
    "SLACK_TEAM_ID": SLACK_TEAM_ID_SPEC_0_0_1,
    "TAVILY_API_KEY": TAVILY_API_KEY_SPEC_0_0_1,
}


def get_envvar_spec(envvar_id: str) -> EnvvarSpec:
    """Get environment variable specification by ID (accepts both bare and versioned refs)."""
    spec = ENVVAR_CATALOG.get(envvar_id)
    if spec is not None:
        return spec
    # Try stripping version suffix for versioned refs like 'NAME:0.0.1'
    base, _, ver = envvar_id.rpartition(':')
    if base and '.' in ver:
        spec = ENVVAR_CATALOG.get(base)
    if spec is None:
        raise ValueError(f"Unknown environment variable: {envvar_id}")
    return spec
