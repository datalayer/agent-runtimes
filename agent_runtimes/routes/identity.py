# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Identity OAuth routes for token exchange.

Most OAuth providers (including GitHub, Google, Kaggle) don't support CORS on their
token endpoints, so we need a backend proxy to exchange the authorization code for
an access token.

Provider-specific notes:
- GitHub: Requires client_secret even with PKCE, returns errors as 200 with error body
- Google: Standard OAuth 2.1 with PKCE support
- Kaggle: Standard OAuth 2.1 with PKCE support
"""

import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/v1/identity", tags=["identity"])


class TokenExchangeRequest(BaseModel):
    """Request body for OAuth token exchange."""
    provider: str
    code: str
    code_verifier: str
    redirect_uri: str


class TokenExchangeResponse(BaseModel):
    """Response from OAuth token exchange."""
    access_token: str
    token_type: str = "Bearer"
    expires_in: Optional[int] = None
    refresh_token: Optional[str] = None
    scope: Optional[str] = None


# Provider token endpoint configurations
# Each provider has specific OAuth endpoint URLs
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
KAGGLE_TOKEN_URL = "https://www.kaggle.com/oauth/token"

PROVIDER_TOKEN_URLS = {
    "github": GITHUB_TOKEN_URL,
    "google": GOOGLE_TOKEN_URL,
    "kaggle": KAGGLE_TOKEN_URL,
}


def get_client_id(provider: str) -> str:
    """Get client ID from environment variables."""
    env_var = f"{provider.upper()}_CLIENT_ID"
    client_id = os.getenv(env_var)
    if not client_id:
        raise HTTPException(
            status_code=500,
            detail=f"Missing {env_var} environment variable"
        )
    return client_id


def get_client_secret(provider: str) -> Optional[str]:
    """Get client secret from environment variables (optional for PKCE)."""
    env_var = f"{provider.upper()}_CLIENT_SECRET"
    return os.getenv(env_var)


@router.post("/oauth/token", response_model=TokenExchangeResponse)
async def exchange_token(request: TokenExchangeRequest):
    """
    Exchange an authorization code for an access token.
    
    This endpoint proxies the token exchange to the OAuth provider,
    which is necessary because most providers don't support CORS.
    
    For PKCE flows, the client_secret is optional - the code_verifier
    provides the security instead.
    """
    if request.provider not in PROVIDER_TOKEN_URLS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {request.provider}"
        )
    
    token_url = PROVIDER_TOKEN_URLS[request.provider]
    client_id = get_client_id(request.provider)
    client_secret = get_client_secret(request.provider)
    
    # Build token request payload
    payload = {
        "client_id": client_id,
        "code": request.code,
        "code_verifier": request.code_verifier,
        "redirect_uri": request.redirect_uri,
        "grant_type": "authorization_code",
    }
    
    # Add client_secret if available (not required for PKCE, but some providers want it)
    if client_secret:
        payload["client_secret"] = client_secret
    
    # Set appropriate headers based on provider
    # Note: GitHub requires Accept: application/json header explicitly,
    # otherwise it returns form-encoded response
    headers = {"Accept": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data=payload,
                headers=headers,
                timeout=30.0,
            )
            
            if response.status_code != 200:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("error_description") or error_data.get("error") or response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Token exchange failed: {error_msg}"
                )
            
            token_data = response.json()
            
            # Handle GitHub-specific error format
            # GitHub returns HTTP 200 with error in body instead of HTTP error codes
            if "error" in token_data:
                raise HTTPException(
                    status_code=400,
                    detail=token_data.get("error_description") or token_data.get("error")
                )
            
            return TokenExchangeResponse(
                access_token=token_data["access_token"],
                token_type=token_data.get("token_type", "Bearer"),
                expires_in=token_data.get("expires_in"),
                refresh_token=token_data.get("refresh_token"),
                scope=token_data.get("scope"),
            )
            
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to {request.provider}: {str(e)}"
        )


# Provider userinfo endpoint configurations
PROVIDER_USERINFO_URLS = {
    "github": "https://api.github.com/user",
    "google": "https://www.googleapis.com/oauth2/v3/userinfo",
    "kaggle": "https://www.kaggle.com/api/v1/user/me",
}


class UserInfoRequest(BaseModel):
    """Request body for fetching user info."""
    provider: str
    access_token: str


class UserInfoResponse(BaseModel):
    """Response from userinfo endpoint."""
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    login: Optional[str] = None  # Username (GitHub calls it login)
    raw: dict  # Full response from provider


@router.post("/oauth/userinfo", response_model=UserInfoResponse)
async def get_userinfo(request: UserInfoRequest):
    """
    Fetch user information from the OAuth provider.
    
    This endpoint proxies the userinfo request to the OAuth provider,
    normalizing the response into a common format.
    """
    if request.provider not in PROVIDER_USERINFO_URLS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {request.provider}"
        )
    
    userinfo_url = PROVIDER_USERINFO_URLS[request.provider]
    
    headers = {
        "Authorization": f"Bearer {request.access_token}",
        "Accept": "application/json",
    }
    
    # GitHub requires User-Agent header
    if request.provider == "github":
        headers["User-Agent"] = "Datalayer-Agent-Runtimes"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                userinfo_url,
                headers=headers,
                timeout=30.0,
            )
            
            if response.status_code != 200:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("message") or error_data.get("error") or response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch user info: {error_msg}"
                )
            
            user_data = response.json()
            
            # Normalize user info based on provider
            if request.provider == "github":
                return UserInfoResponse(
                    id=str(user_data.get("id")),
                    name=user_data.get("name"),
                    email=user_data.get("email"),
                    avatar_url=user_data.get("avatar_url"),
                    login=user_data.get("login"),
                    raw=user_data,
                )
            elif request.provider == "google":
                return UserInfoResponse(
                    id=user_data.get("sub"),
                    name=user_data.get("name"),
                    email=user_data.get("email"),
                    avatar_url=user_data.get("picture"),
                    login=user_data.get("email"),
                    raw=user_data,
                )
            elif request.provider == "kaggle":
                return UserInfoResponse(
                    id=str(user_data.get("id")),
                    name=user_data.get("displayName"),
                    email=user_data.get("email"),
                    avatar_url=user_data.get("thumbnailUrl"),
                    login=user_data.get("userName"),
                    raw=user_data,
                )
            else:
                # Generic fallback
                return UserInfoResponse(
                    id=str(user_data.get("id") or user_data.get("sub")),
                    name=user_data.get("name"),
                    email=user_data.get("email"),
                    avatar_url=user_data.get("avatar_url") or user_data.get("picture"),
                    login=user_data.get("login") or user_data.get("username"),
                    raw=user_data,
                )
            
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to {request.provider}: {str(e)}"
        )
