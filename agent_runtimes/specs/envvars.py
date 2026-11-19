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

ANTHROPIC_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="ANTHROPIC_API_KEY",
    version="0.0.1",
    name="Anthropic API Key",
    description="API key for Anthropic's Claude API, the person's own, never a Claude.ai subscription login. Required to use Anthropic's models everywhere, on a Datalayer runtime too: Anthropic is a direct provider (`via: direct`), called by the agent with this key, and nothing of it goes through ai-inference. Also required by the Claude Code harness run locally, and by any harness configured with Anthropic as its model provider there.",
    registrationUrl="https://platform.claude.com/settings/keys",
    tags=["authentication", "api-key", "anthropic", "harness"],
    icon="key",
    emoji="🔑",
)

BLUESKY_APP_PASSWORD_SPEC_0_0_1 = EnvvarSpec(
    id="BLUESKY_APP_PASSWORD",
    version="0.0.1",
    name="Bluesky App Password",
    description="An app password of the Bluesky account, made for this integration alone — Settings, Privacy and security, App passwords, Add app password — never the account's own password. Read by the Bluesky MCP server with the handle beside it; revoke it there to cut the server off.",
    registrationUrl="https://bsky.app/settings/app-passwords",
    tags=["authentication", "password", "bluesky", "social"],
    icon="key",
    emoji="🔑",
)

BLUESKY_IDENTIFIER_SPEC_0_0_1 = EnvvarSpec(
    id="BLUESKY_IDENTIFIER",
    version="0.0.1",
    name="Bluesky Handle",
    description="The handle of the Bluesky account the server acts as, `name.bsky.social` or a custom domain. Read by the Bluesky MCP server with the app password beside it.",
    registrationUrl="https://bsky.app",
    tags=["authentication", "username", "bluesky", "social"],
    icon="key",
    emoji="🦋",
)

BLUESKY_SERVICE_URL_SPEC_0_0_1 = EnvvarSpec(
    id="BLUESKY_SERVICE_URL",
    version="0.0.1",
    name="Bluesky Service URL",
    description="The AT Protocol service the Bluesky MCP server signs in to. `https://bsky.social` for an account on Bluesky's own servers; a self-hosted PDS names its own address.",
    registrationUrl="https://atproto.com/guides/self-hosting",
    tags=["configuration", "url", "bluesky"],
    icon="link",
    emoji="🔗",
)

BOOKING_AFFILIATE_ID_SPEC_0_0_1 = EnvvarSpec(
    id="BOOKING_AFFILIATE_ID",
    version="0.0.1",
    name="Booking.com Affiliate ID",
    description="The digit-only affiliate id of a Booking.com partner account, issued at partner onboarding. Sent as x-booking-affiliate-id to Booking.com's MCP server at https://demandapi-mcp.booking.com/v1/sp/mcp/, with the Demand API key.",
    registrationUrl="https://www.booking.com/affiliate-program/v2/index.html",
    tags=["authentication", "booking", "travel", "partner"],
    icon="key",
    emoji="🔑",
)

BOOKING_DEMAND_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="BOOKING_DEMAND_API_KEY",
    version="0.0.1",
    name="Booking.com Demand API Key",
    description="The Demand API key Booking.com issues to a partner at onboarding. Sent unchanged, with no Bearer prefix, as x-booking-authorization to Booking.com's MCP server at https://demandapi-mcp.booking.com/v1/sp/mcp/, with the affiliate id; the tools it answers are those enabled for the partner's account.",
    registrationUrl="https://developers.booking.com/mcp-server/docs/get-started",
    tags=["authentication", "api-key", "booking", "travel", "partner"],
    icon="key",
    emoji="🔑",
)

DISCORD_BOT_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="DISCORD_BOT_TOKEN",
    version="0.0.1",
    name="Discord Bot Token",
    description="The token of a Discord bot, from its application's Bot page in the Discord Developer Portal (Reset Token to see it once). The bot is invited to the server with the permissions of what the agent may do, and the Message Content intent when it reads messages. Read by the Discord MCP server as DISCORD_TOKEN.",
    registrationUrl="https://discord.com/developers/applications",
    tags=["authentication", "token", "discord", "social"],
    icon="key",
    emoji="🔑",
)

DISCORD_GUILD_ID_SPEC_0_0_1 = EnvvarSpec(
    id="DISCORD_GUILD_ID",
    version="0.0.1",
    name="Discord Server ID",
    description="The id of the Discord server (guild) the bot works in by default — copied from the server with Developer Mode on, Copy Server ID. Optional; a tool may name another server.",
    registrationUrl="https://support.discord.com/hc/en-us/articles/206346498",
    tags=["configuration", "discord"],
    icon="link",
    emoji="🔗",
)

EARTHDATA_PASSWORD_SPEC_0_0_1 = EnvvarSpec(
    id="EARTHDATA_PASSWORD",
    version="0.0.1",
    name="Earthdata Login Password",
    description="The password of a NASA Earthdata Login. Read in the code sandbox by the script that the download tool of the Earthdata MCP server writes, to download granules; searching needs none.",
    registrationUrl="https://urs.earthdata.nasa.gov/users/new",
    tags=["authentication", "password", "earthdata", "sandbox"],
    icon="key",
    emoji="🔑",
)

EARTHDATA_USERNAME_SPEC_0_0_1 = EnvvarSpec(
    id="EARTHDATA_USERNAME",
    version="0.0.1",
    name="Earthdata Login Username",
    description="The username of a NASA Earthdata Login. Read in the code sandbox by the script that the download tool of the Earthdata MCP server writes, to download granules; searching needs none.",
    registrationUrl="https://urs.earthdata.nasa.gov/users/new",
    tags=["authentication", "username", "earthdata", "sandbox"],
    icon="key",
    emoji="🔑",
)

FREEPIK_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="FREEPIK_API_KEY",
    version="0.0.1",
    name="Freepik API Key",
    description="API key for Freepik's stock content (its API is now served as Magnific's, with the same key), for the stock image skill to search and download its photos. Optional, as one stock image provider's key is enough.",
    registrationUrl="https://www.magnific.com/api",
    tags=["authentication", "api-key", "images", "stock", "skill"],
    icon="key",
    emoji="🔑",
)

GEMINI_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="GEMINI_API_KEY",
    version="0.0.1",
    name="Gemini API Key",
    description="API key for Google's Gemini API. Required by the Gemini CLI harness in place of a Google login; the person's own.",
    registrationUrl="https://aistudio.google.com/apikey",
    tags=["authentication", "api-key", "google", "harness"],
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

GOOGLE_MAPS_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="GOOGLE_MAPS_API_KEY",
    version="0.0.1",
    name="Google Maps Platform API Key",
    description="A Google Maps Platform API key from a Google Cloud project with billing on and the Maps Experience agent tools API (mapstools.googleapis.com) enabled, restricted to that API. Sent as X-Goog-Api-Key to Google's Maps MCP server at https://mapstools.googleapis.com/mcp for places, routes and weather; Google bills the key's project.",
    registrationUrl="https://console.cloud.google.com/google/maps-apis/credentials",
    tags=["authentication", "api-key", "google", "maps", "travel"],
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
    tags=[
        "authentication",
        "oauth",
        "google",
        "workspace",
        "client-secret",
        "security",
    ],
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

KAGGLE_API_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="KAGGLE_API_TOKEN",
    version="0.0.1",
    name="Kaggle API Token",
    description="API token for accessing Kaggle datasets, competitions, notebooks, and models. Required for Kaggle MCP server authentication.",
    registrationUrl="https://www.kaggle.com/settings/account",
    tags=["authentication", "api-key", "kaggle", "data"],
    icon="key",
    emoji="🔑",
)

LINKEDIN_LI_AT_SPEC_0_0_1 = EnvvarSpec(
    id="LINKEDIN_LI_AT",
    version="0.0.1",
    name="LinkedIn session cookie (li_at)",
    description="Your LinkedIn session for your agents' reading: the **value of the cookie named `li_at`** on `www.linkedin.com`, copied from a browser where you are signed in to LinkedIn. Not `JSESSIONID`, `bcookie`, `bscookie`, `liap` or `lidc`: only `li_at`. It is a long string, usually starting with `AQED`.\n\n**Chrome or Edge:** open https://www.linkedin.com signed in, press F12 (or right-click › Inspect), then Application › Storage › Cookies › `https://www.linkedin.com`, find the row named `li_at` and copy its Value column (double-click the value, then copy).\n\n**Firefox:** open https://www.linkedin.com signed in, press F12, then Storage › Cookies › `https://www.linkedin.com`, select the row `li_at` and copy its Value.\n\n**Safari:** Settings › Advanced › Show features for web developers, then Develop › Show Web Inspector › Storage › Cookies › `www.linkedin.com` › `li_at`.\n\nPaste it in Settings › LinkedIn (or as a secret named `LINKEDIN_LI_AT`). It is stored encrypted in your Vault secrets and handed to each new runtime of yours whose agent reads LinkedIn (the Marketer's linkedin MCP server), never to anybody else's. It works until you sign out of LinkedIn in that browser, or it expires (about a year): then paste a new one. Treat it like a password: whoever holds it is signed in to LinkedIn as you.",
    registrationUrl="https://www.linkedin.com",
    tags=["authentication", "cookie", "linkedin", "social"],
    icon="key",
    emoji="🔑",
)

LLM_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="LLM_API_KEY",
    version="0.0.1",
    name="OpenHands LLM API Key",
    description="The model provider's key the OpenHands CLI reads, with LLM_MODEL, when started with --override-with-envs. Required by the OpenHands harness; the person's own key at their provider.",
    registrationUrl="https://docs.openhands.dev/openhands/usage/cli/installation",
    tags=["authentication", "api-key", "openhands", "harness"],
    icon="key",
    emoji="🔑",
)

OPENAI_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="OPENAI_API_KEY",
    version="0.0.1",
    name="OpenAI API Key",
    description="API key for OpenAI's API, the person's own. Required to use OpenAI's models everywhere, on a Datalayer runtime too: OpenAI is a direct provider (`via: direct`), called by the agent with this key, and nothing of it goes through ai-inference. Also required by the Codex harness run locally, which takes it in place of a ChatGPT login.",
    registrationUrl="https://platform.openai.com/api-keys",
    tags=["authentication", "api-key", "openai", "harness"],
    icon="key",
    emoji="🔑",
)

OPENROUTER_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="OPENROUTER_API_KEY",
    version="0.0.1",
    name="OpenRouter API Key",
    description="API key for OpenRouter, one key in front of the models of many vendors, the person's own. Required to use OpenRouter's models everywhere, on a Datalayer runtime too: OpenRouter is a direct provider (`via: direct`), called by the agent with this key, and nothing of it goes through ai-inference. Also required by any harness configured with OpenRouter as its model provider run locally.",
    registrationUrl="https://openrouter.ai/settings/keys",
    tags=["authentication", "api-key", "openrouter", "harness"],
    icon="key",
    emoji="🔑",
)

PEXELS_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="PEXELS_API_KEY",
    version="0.0.1",
    name="Pexels API Key",
    description="API key for Pexels, for the stock image skill to search its photos (200 requests an hour). Optional, as one stock image provider's key is enough.",
    registrationUrl="https://www.pexels.com/api/",
    tags=["authentication", "api-key", "images", "stock", "skill"],
    icon="key",
    emoji="🔑",
)

PIXABAY_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="PIXABAY_API_KEY",
    version="0.0.1",
    name="Pixabay API Key",
    description="API key for Pixabay, for the stock image skill to search its photos (100 requests a minute). Optional, as one stock image provider's key is enough.",
    registrationUrl="https://pixabay.com/api/docs/",
    tags=["authentication", "api-key", "images", "stock", "skill"],
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

STRIPE_TEST_AGENT_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="STRIPE_TEST_AGENT_API_KEY",
    version="0.0.1",
    name="Stripe Agent API Key (test mode)",
    description="A Stripe agent API key created in a sandbox (test mode), never a live key: sent as the Bearer token to Stripe's MCP server at https://mcp.stripe.com. Create it in the Stripe Dashboard of a sandbox (Developers › API keys › Create agent key) with only the permissions the agent needs (Checkout Sessions write, Products and Prices read). Since December 2026 Stripe's MCP server takes only agent API keys or OAuth, no secret or plain restricted key. In test mode no card is charged: Stripe's test cards (4242 4242 4242 4242) pay on Stripe's page.",
    registrationUrl="https://docs.stripe.com/keys#agent-keys",
    tags=["authentication", "api-key", "stripe", "payments", "test-mode"],
    icon="key",
    emoji="🔑",
)

TAVILY_API_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="TAVILY_API_KEY",
    version="0.0.1",
    name="Tavily API Key",
    description="API key for Tavily web search and research capabilities. Required for web crawling, content extraction, and search operations.",
    registrationUrl="https://app.tavily.com/home",
    tags=["authentication", "api-key", "search", "web", "research"],
    icon="key",
    emoji="🔑",
)

UNSPLASH_ACCESS_KEY_SPEC_0_0_1 = EnvvarSpec(
    id="UNSPLASH_ACCESS_KEY",
    version="0.0.1",
    name="Unsplash Access Key",
    description="Access key of an Unsplash application, for the stock image skill to search Unsplash's photos. Optional, as one stock image provider's key is enough. A new application is in demo mode (50 requests an hour); set UNSPLASH_TIER to production once Unsplash has approved it.",
    registrationUrl="https://unsplash.com/oauth/applications",
    tags=["authentication", "api-key", "images", "stock", "skill"],
    icon="key",
    emoji="🔑",
)

UNSPLASH_TIER_SPEC_0_0_1 = EnvvarSpec(
    id="UNSPLASH_TIER",
    version="0.0.1",
    name="Unsplash Tier",
    description="The rate limit of the Unsplash application whose key is UNSPLASH_ACCESS_KEY, either demo (50 requests an hour, the default) or production (1000 an hour, once Unsplash approved the application). A setting, not a secret; optional.",
    registrationUrl="https://unsplash.com/documentation#rate-limiting",
    tags=["setting", "images", "stock", "skill"],
    icon="gear",
    emoji="⚙️",
)

X_BEARER_TOKEN_SPEC_0_0_1 = EnvvarSpec(
    id="X_BEARER_TOKEN",
    version="0.0.1",
    name="X App-only Bearer Token",
    description="The App-only Bearer Token of an X app, from its Keys and tokens page in the X Developer Portal. Sent as the bearer to X's remote MCP server at https://api.x.com/mcp, which then answers its read tools — posts, search, users, news and trends — with no user context. Writing (bookmarks, articles) needs the xurl bridge and an OAuth 2.0 login instead.",
    registrationUrl="https://developer.x.com/en/portal/dashboard",
    tags=["authentication", "token", "x", "social"],
    icon="key",
    emoji="🔑",
)

# ============================================================================
# Environment Variable Catalog
# ============================================================================

ENVVAR_CATALOG: Dict[str, EnvvarSpec] = {
    "ALPHAVANTAGE_API_KEY": ALPHAVANTAGE_API_KEY_SPEC_0_0_1,
    "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY_SPEC_0_0_1,
    "BLUESKY_APP_PASSWORD": BLUESKY_APP_PASSWORD_SPEC_0_0_1,
    "BLUESKY_IDENTIFIER": BLUESKY_IDENTIFIER_SPEC_0_0_1,
    "BLUESKY_SERVICE_URL": BLUESKY_SERVICE_URL_SPEC_0_0_1,
    "BOOKING_AFFILIATE_ID": BOOKING_AFFILIATE_ID_SPEC_0_0_1,
    "BOOKING_DEMAND_API_KEY": BOOKING_DEMAND_API_KEY_SPEC_0_0_1,
    "DISCORD_BOT_TOKEN": DISCORD_BOT_TOKEN_SPEC_0_0_1,
    "DISCORD_GUILD_ID": DISCORD_GUILD_ID_SPEC_0_0_1,
    "EARTHDATA_PASSWORD": EARTHDATA_PASSWORD_SPEC_0_0_1,
    "EARTHDATA_USERNAME": EARTHDATA_USERNAME_SPEC_0_0_1,
    "FREEPIK_API_KEY": FREEPIK_API_KEY_SPEC_0_0_1,
    "GEMINI_API_KEY": GEMINI_API_KEY_SPEC_0_0_1,
    "GITHUB_TOKEN": GITHUB_TOKEN_SPEC_0_0_1,
    "GOOGLE_MAPS_API_KEY": GOOGLE_MAPS_API_KEY_SPEC_0_0_1,
    "GOOGLE_OAUTH_CLIENT_ID": GOOGLE_OAUTH_CLIENT_ID_SPEC_0_0_1,
    "GOOGLE_OAUTH_CLIENT_SECRET": GOOGLE_OAUTH_CLIENT_SECRET_SPEC_0_0_1,
    "HF_TOKEN": HF_TOKEN_SPEC_0_0_1,
    "KAGGLE_API_TOKEN": KAGGLE_API_TOKEN_SPEC_0_0_1,
    "LINKEDIN_LI_AT": LINKEDIN_LI_AT_SPEC_0_0_1,
    "LLM_API_KEY": LLM_API_KEY_SPEC_0_0_1,
    "OPENAI_API_KEY": OPENAI_API_KEY_SPEC_0_0_1,
    "OPENROUTER_API_KEY": OPENROUTER_API_KEY_SPEC_0_0_1,
    "PEXELS_API_KEY": PEXELS_API_KEY_SPEC_0_0_1,
    "PIXABAY_API_KEY": PIXABAY_API_KEY_SPEC_0_0_1,
    "SLACK_BOT_TOKEN": SLACK_BOT_TOKEN_SPEC_0_0_1,
    "SLACK_CHANNEL_IDS": SLACK_CHANNEL_IDS_SPEC_0_0_1,
    "SLACK_TEAM_ID": SLACK_TEAM_ID_SPEC_0_0_1,
    "STRIPE_TEST_AGENT_API_KEY": STRIPE_TEST_AGENT_API_KEY_SPEC_0_0_1,
    "TAVILY_API_KEY": TAVILY_API_KEY_SPEC_0_0_1,
    "UNSPLASH_ACCESS_KEY": UNSPLASH_ACCESS_KEY_SPEC_0_0_1,
    "UNSPLASH_TIER": UNSPLASH_TIER_SPEC_0_0_1,
    "X_BEARER_TOKEN": X_BEARER_TOKEN_SPEC_0_0_1,
}


def get_envvar_spec(envvar_id: str) -> EnvvarSpec:
    """Get environment variable specification by ID (accepts both bare and versioned refs)."""
    spec = ENVVAR_CATALOG.get(envvar_id)
    if spec is not None:
        return spec
    # Try stripping version suffix for versioned refs like 'NAME:0.0.1'
    base, _, ver = envvar_id.rpartition(":")
    if base and "." in ver:
        spec = ENVVAR_CATALOG.get(base)
    if spec is None:
        raise ValueError(f"Unknown environment variable: {envvar_id}")
    return spec
