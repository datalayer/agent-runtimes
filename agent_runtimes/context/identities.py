# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Request-scoped identity context for passing OAuth tokens to skill execution.

This module provides a context variable to store OAuth identities during request
processing, allowing skill executors to access tokens without threading them
through all the pydantic-ai layers.

Usage:
    # In the transport layer (vercel_ai.py):
    from agent_runtimes.context.identities import set_request_identities, clear_request_identities
    
    async def handle_vercel_request(self, request: Request):
        identities = body.get("identities")
        set_request_identities(identities)
        try:
            # Process request...
        finally:
            clear_request_identities()
    
    # In skill executor or toolset:
    from agent_runtimes.context.identities import get_identity_env
    
    env = get_identity_env()  # Returns {"GITHUB_TOKEN": "...", ...}
"""

from __future__ import annotations

import contextvars
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Context variable to store identities for the current request
_request_identities: contextvars.ContextVar[list[dict[str, Any]] | None] = contextvars.ContextVar(
    "request_identities",
    default=None,
)


def set_request_identities(identities: list[dict[str, Any]] | None) -> None:
    """Set the identities for the current request context.
    
    Args:
        identities: List of identity objects with provider and accessToken.
    """
    _request_identities.set(identities)
    if identities:
        providers = [i.get("provider") for i in identities]
        logger.debug(f"Set request identities for providers: {providers}")


def get_request_identities() -> list[dict[str, Any]] | None:
    """Get the identities for the current request context.
    
    Returns:
        List of identity objects, or None if not set.
    """
    return _request_identities.get()


def clear_request_identities() -> None:
    """Clear the identities for the current request context."""
    _request_identities.set(None)


def get_identity_env() -> dict[str, str]:
    """Get environment variables for identities in the current request context.
    
    Maps OAuth identities to their corresponding environment variable names:
    - github -> GITHUB_TOKEN
    - gitlab -> GITLAB_TOKEN
    - google -> GOOGLE_ACCESS_TOKEN
    - microsoft -> AZURE_ACCESS_TOKEN
    
    Returns:
        Dictionary of environment variable names to token values.
    """
    identities = get_request_identities()
    if not identities:
        return {}
    
    env: dict[str, str] = {}
    
    # Map provider names to environment variable names
    provider_env_map = {
        "github": "GITHUB_TOKEN",
        "gitlab": "GITLAB_TOKEN",
        "google": "GOOGLE_ACCESS_TOKEN",
        "microsoft": "AZURE_ACCESS_TOKEN",
        "bitbucket": "BITBUCKET_TOKEN",
        "linkedin": "LINKEDIN_ACCESS_TOKEN",
        "kaggle": "KAGGLE_TOKEN",
        "huggingface": "HUGGINGFACE_TOKEN",
        "slack": "SLACK_TOKEN",
        "notion": "NOTION_TOKEN",
    }
    
    for identity in identities:
        provider = identity.get("provider", "").lower()
        access_token = identity.get("accessToken")
        
        if provider and access_token:
            env_var = provider_env_map.get(provider)
            if env_var:
                env[env_var] = access_token
                logger.debug(f"Mapped identity {provider} -> {env_var}")
            else:
                # Use generic pattern for unknown providers
                env_var = f"{provider.upper()}_TOKEN"
                env[env_var] = access_token
                logger.debug(f"Mapped identity {provider} -> {env_var} (generic)")
    
    return env


class IdentityContextManager:
    """Context manager for setting identities during request processing.
    
    Usage:
        async with IdentityContextManager(identities):
            # Process request...
    """
    
    def __init__(self, identities: list[dict[str, Any]] | None):
        self.identities = identities
        self._token: contextvars.Token | None = None
    
    def __enter__(self) -> "IdentityContextManager":
        self._token = _request_identities.set(self.identities)
        if self.identities:
            providers = [i.get("provider") for i in self.identities]
            logger.debug(f"Entering identity context for providers: {providers}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._token is not None:
            _request_identities.reset(self._token)
            logger.debug("Exited identity context")
    
    async def __aenter__(self) -> "IdentityContextManager":
        return self.__enter__()
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.__exit__(exc_type, exc_val, exc_tb)
