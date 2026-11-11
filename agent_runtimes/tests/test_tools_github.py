# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The github-repositories tool: the person's token from the identity
provider, never a configured GITHUB_TOKEN; a refused grant said in a sentence."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from agent_runtimes import identity
from agent_runtimes.plugins.points import AuthorizationDeclined
from agent_runtimes.tools import github


def _github(seen: list[httpx.Request]) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/user":
            return httpx.Response(200, json={"login": "octo"})
        return httpx.Response(
            200,
            json=[
                {
                    "full_name": "octo/one",
                    "private": False,
                    "description": "First",
                    "language": "Python",
                    "stargazers_count": 3,
                    "updated_at": "2026-11-10T10:00:00Z",
                    "html_url": "https://github.com/octo/one",
                }
            ],
        )

    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_the_person_s_repositories_with_the_provider_s_token(monkeypatch) -> None:
    asked: list[tuple[str, list[str]]] = []

    async def oauth_token(provider: str, *, scopes: list[str]) -> str:
        asked.append((provider, scopes))
        return "gho_person"

    seen: list[httpx.Request] = []
    monkeypatch.setattr(identity, "oauth_token", oauth_token)
    monkeypatch.setattr(github, "_client", _github(seen))
    monkeypatch.setenv("GITHUB_TOKEN", "never-used")

    answer = asyncio.run(github.github_repositories(limit=500))

    assert asked == [("github", ["read:user"])]
    assert answer == {
        "login": "octo",
        "repositories": [
            {
                "full_name": "octo/one",
                "private": False,
                "description": "First",
                "language": "Python",
                "stars": 3,
                "updated_at": "2026-11-10T10:00:00Z",
                "url": "https://github.com/octo/one",
            }
        ],
    }
    assert {r.headers["authorization"] for r in seen} == {"Bearer gho_person"}
    assert seen[1].url.params["per_page"] == "100"


def test_a_declined_grant_is_a_sentence(monkeypatch) -> None:
    async def oauth_token(provider: str, *, scopes: list[str]) -> str:
        raise AuthorizationDeclined("Access to github was declined.")

    monkeypatch.setattr(identity, "oauth_token", oauth_token)

    assert asyncio.run(github.github_repositories()) == "Access to github was declined."


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("[Errno 111] Connection refused"),
        httpx.ReadTimeout("timed out"),
    ],
)
def test_github_unreachable_is_a_sentence(monkeypatch, error) -> None:
    async def oauth_token(provider: str, *, scopes: list[str]) -> str:
        return "gho_person"

    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    monkeypatch.setattr(identity, "oauth_token", oauth_token)
    monkeypatch.setattr(
        github,
        "_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    answer = asyncio.run(github.github_repositories())

    assert isinstance(answer, str)
    assert answer.startswith("GitHub could not be reached")
    assert type(error).__name__ in answer
    assert "gho_person" not in answer


def test_an_unknown_sort_is_a_sentence() -> None:
    assert "not a sort" in asyncio.run(github.github_repositories(sort="stars"))


@pytest.mark.parametrize("name", ["limit", "sort"])
def test_the_tool_s_arguments_are_the_model_s_alone(name) -> None:
    import inspect

    assert name in inspect.signature(github.github_repositories).parameters
    assert set(inspect.signature(github.github_repositories).parameters) == {
        "limit",
        "sort",
    }
