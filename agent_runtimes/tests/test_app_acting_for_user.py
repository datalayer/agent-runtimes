# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's connections in the name of who uses it (plans/LOOP.md, I-04).

The gateway's servers an application reaches in each user's name are reached
with the token of the person talking to it, which IAM mints from what they let
it do; the others with its principal's. Without one, nothing of theirs is sent.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from agent_runtimes.loop.apps import acting
from agent_runtimes.mcp import datalayer_gateway
from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run

PRINCIPAL = "principal-token"
PERSON = "persons-token"


def _connection(server: str, acts_as: str) -> Any:
    return SimpleNamespace(server=server, acts_as=acts_as)


@pytest.fixture(autouse=True)
def fresh() -> Any:
    acting.forget_acting()
    yield
    acting.forget_acting()
    acting.use_iam(None)
    acting.remember_servers_in_users_name("agent-1", None)


def test_it_remembers_the_gateways_servers_in_each_users_name_only() -> None:
    acting.remember_servers_in_users_name(
        "agent-1",
        [
            _connection("datalayer:0.0.1", "user"),
            _connection("google-workspace", "user"),
            _connection("datalayer-mcp", "owner"),
        ],
    )
    # Another server is reached where it runs, never through the gateway.
    assert acting.servers_in_users_name("agent-1") == frozenset({"datalayer"})
    acting.remember_servers_in_users_name(
        "agent-1", [_connection("datalayer", "owner")]
    )
    assert acting.servers_in_users_name("agent-1") == frozenset()


@pytest.mark.asyncio
async def test_the_persons_token_is_asked_once_and_kept_until_it_runs_short() -> None:
    asked: list = []

    async def iam(deployment: str, bearer: str) -> dict[str, Any] | None:
        asked.append((deployment, bearer))
        return {"access_token": PERSON, "expires_in": 900}

    acting.use_iam(iam)
    assert await acting.acting_token("dep-1", "bearer") == PERSON
    assert await acting.acting_token("dep-1", "bearer") == PERSON
    assert asked == [("dep-1", "bearer")]
    # Another person is asked for on their own.
    assert await acting.acting_token("dep-1", "another") == PERSON
    assert len(asked) == 2


@pytest.mark.asyncio
async def test_nobody_signed_in_or_not_let_or_iam_failing_is_no_token() -> None:
    async def not_let(deployment: str, bearer: str) -> dict[str, Any] | None:
        return None

    async def failing(deployment: str, bearer: str) -> dict[str, Any] | None:
        raise httpx.ConnectError("down")

    acting.use_iam(not_let)
    assert await acting.acting_token("dep-1", None) == ""
    assert await acting.acting_token("dep-1", "bearer") == ""
    acting.use_iam(failing)
    assert await acting.acting_token("dep-1", "bearer") == ""


def test_the_servers_in_the_users_name_are_reached_with_their_token(
    monkeypatch: Any,
) -> None:
    seen: list = []

    def client(
        headers: dict[str, str] | None = None, **kwargs: Any
    ) -> httpx.AsyncClient:
        seen.append(dict(headers or {}))
        return httpx.AsyncClient(headers=headers)

    monkeypatch.setattr(datalayer_gateway, "tracing_client", client)
    toolsets_for_the_run(
        [SimpleNamespace(id="datalayer")],
        PRINCIPAL,
        in_users_name=frozenset({"datalayer"}),
        users_token=PERSON,
    )
    toolsets_for_the_run([SimpleNamespace(id="datalayer")], PRINCIPAL)
    # Not let act in their name: nothing of theirs, and never the principal's either.
    toolsets_for_the_run(
        [SimpleNamespace(id="datalayer")],
        PRINCIPAL,
        in_users_name=frozenset({"datalayer"}),
    )
    assert seen == [
        {"Authorization": f"Bearer {PERSON}"},
        {"Authorization": f"Bearer {PRINCIPAL}"},
        {"Authorization": "Bearer "},
    ]
