# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Authenticating to MCP servers, once, for every front-end."""

from agent_runtimes.mcp.auth.oauth import (
    CLIENT_NAME,
    OAuthError,
    PendingFlow,
    ServerMetadata,
    authorization_url,
    choose_scope,
    discover,
    exchange_code,
    generate_pkce,
    refresh_token,
    register_client,
    revoke,
)
from agent_runtimes.mcp.auth.machine import (
    CLIENT_ASSERTION_TYPE,
    ClientCredentials,
    MachineAuthError,
    MachineTokenProvider,
    build_assertion,
    exchange_for_subagent,
    fetch_token,
)
from agent_runtimes.mcp.auth.tokens import (
    KEYRING_SERVICE,
    KeyringTokenStore,
    MemoryTokenStore,
    OAuthToken,
    PlatformTokenStore,
    TokenStore,
    get_token_store,
)

__all__ = [
    "CLIENT_ASSERTION_TYPE",
    "CLIENT_NAME",
    "ClientCredentials",
    "KEYRING_SERVICE",
    "KeyringTokenStore",
    "MachineAuthError",
    "MachineTokenProvider",
    "MemoryTokenStore",
    "OAuthError",
    "OAuthToken",
    "PendingFlow",
    "PlatformTokenStore",
    "ServerMetadata",
    "TokenStore",
    "authorization_url",
    "build_assertion",
    "choose_scope",
    "discover",
    "exchange_code",
    "exchange_for_subagent",
    "fetch_token",
    "generate_pkce",
    "get_token_store",
    "refresh_token",
    "register_client",
    "revoke",
]
