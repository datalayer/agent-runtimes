# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The person's GitHub repositories, with a token the runtime's identity provider gives.

No ``GITHUB_TOKEN`` is configured: the token is the person's, asked of the
runtime's identity provider (``identity.oauth_token("github", …)``). On
AgentCore it comes from AgentCore Identity's token vault, through the
organization's credential provider named ``github``; the first time, the
person is asked in the chat to connect GitHub. A grant declined, or not
given in time, ends the call with a sentence the agent reads.
"""

from __future__ import annotations

from typing import Any

import httpx

from agent_runtimes.plugins.points import (
    AuthorizationDeclined,
    AuthorizationTimedOut,
    IdentityRefused,
)

#: The credential provider's name, as agentspecs names providers.
PROVIDER = "github"

#: What the list needs: the person's profile, so their public repositories.
SCOPES = ("read:user",)

#: GitHub's API.
API = "https://api.github.com"

#: The most repositories one call answers.
MAX_LIMIT = 100


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=20.0)


async def github_repositories(limit: int = 30, sort: str = "updated") -> Any:
    """List the GitHub repositories of the person this agent works for.

    Args:
        limit: How many repositories to list, 1 to 100 (default 30).
        sort: ``updated``, ``created``, ``pushed`` or ``full_name``.

    Returns:
        ``{"login", "repositories": [{"full_name", "private", "description",
        "language", "stars", "updated_at", "url"}]}``, or a sentence when
        GitHub access was not granted.
    """
    from agent_runtimes import identity

    if sort not in ("updated", "created", "pushed", "full_name"):
        return f"{sort!r} is not a sort GitHub knows: updated, created, pushed or full_name."
    limit = max(1, min(int(limit), MAX_LIMIT))
    try:
        token = await identity.oauth_token(PROVIDER, scopes=list(SCOPES))
    except (AuthorizationDeclined, AuthorizationTimedOut, IdentityRefused) as refused:
        return str(refused)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with _client() as http:
        user = await http.get(f"{API}/user", headers=headers)
        if user.status_code != 200:
            return f"GitHub refused the person's token ({user.status_code}): {user.text[:200]}"
        repos = await http.get(
            f"{API}/user/repos",
            headers=headers,
            params={"per_page": limit, "sort": sort, "affiliation": "owner"},
        )
        if repos.status_code != 200:
            return f"GitHub did not list the repositories ({repos.status_code}): {repos.text[:200]}"
    return {
        "login": user.json().get("login"),
        "repositories": [
            {
                "full_name": repo.get("full_name"),
                "private": bool(repo.get("private")),
                "description": repo.get("description"),
                "language": repo.get("language"),
                "stars": repo.get("stargazers_count"),
                "updated_at": repo.get("updated_at"),
                "url": repo.get("html_url"),
            }
            for repo in repos.json()[:limit]
        ],
    }


__all__ = ["github_repositories"]
