# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Gmail, reached in the name of whom a deployed application acts for (STUDIO W-02).

The catalogue's `google-workspace` server runs as a local HTTP process in its
external OAuth provider mode; each run of a deployment's agent reaches it with
a toolset of its own whose every request carries an access token IAM minted —
asked with the person's token naming the application (I-04) for a connection
`as: user`, with the principal's (I-03) for one `as: owner`. Without one, the
run has no Gmail tool and says why; nobody else's mailbox is reached.
"""

from __future__ import annotations

import socket
import sys
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from agent_runtimes.guardrails import credentials
from agent_runtimes.loop.apps import acting, principal
from agent_runtimes.mcp import google_workspace as gw
from agent_runtimes.mcp.catalog_mcp_servers import get_catalog_server
from agent_runtimes.models.models import remember_app_instance

AGENT = "agent-gmail"
DEPLOYMENT = "dep-1"


def _connection(server: str, acts_as: str) -> Any:
    return SimpleNamespace(server=server, acts_as=acts_as)


@pytest.fixture(autouse=True)
def fresh() -> Any:
    gw.forget_tokens()
    yield
    gw.forget_tokens()
    gw.use_iam(None)
    gw.remember_gmail_connection(AGENT, None)
    remember_app_instance(AGENT, None)


@pytest.fixture
def deployed() -> None:
    remember_app_instance(AGENT, {"app_uid": "01APP", "deployment_uid": DEPLOYMENT})


@pytest.fixture
def iam() -> list[str]:
    """IAM's token route, as a list of the bearers it was asked with."""
    asked: list[str] = []

    async def mint(bearer: str) -> dict[str, Any]:
        asked.append(bearer)
        return {
            "access_token": f"ya29.minted-{len(asked)}-for-a-mailbox",
            "expires_in": 3599,
        }

    gw.use_iam(mint)
    return asked


def test_the_catalogue_server_is_gmail_over_http_with_no_credential_of_its_own() -> (
    None
):
    server = get_catalog_server("google-workspace")
    assert server is not None
    assert (
        server.transport == "streamable-http"
        and server.url == "http://127.0.0.1:9711/mcp"
    )
    assert (
        server.env["MCP_ENABLE_OAUTH21"] == "true"
        and server.env["EXTERNAL_OAUTH21_PROVIDER"] == "true"
    )
    assert server.env["WORKSPACE_MCP_HOST"] == "127.0.0.1"
    # No Google client secret, no account secret: what it opens is each request's token.
    assert server.required_env_vars == []
    assert not any("${" in value for value in (server.env or {}).values())
    assert "gmail:send" in server.args


def test_it_remembers_in_whose_name_an_application_reaches_gmail() -> None:
    gw.remember_gmail_connection(
        AGENT,
        [_connection("tavily", "owner"), _connection("google-workspace:0.0.1", "user")],
    )
    assert gw.acts_as_of(AGENT) == "user"
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "owner")])
    assert gw.acts_as_of(AGENT) == "owner"
    gw.remember_gmail_connection(AGENT, [_connection("tavily", "owner")])
    assert gw.acts_as_of(AGENT) == ""


@pytest.mark.asyncio
async def test_no_deployment_reaches_nobodys_gmail(iam: list[str]) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "user")])
    with pytest.raises(gw.GmailRefused, match="deployed application"):
        await gw.gmail_access_token(AGENT, "persons-own-token")
    assert iam == []


@pytest.mark.asyncio
async def test_in_the_users_name_iam_is_asked_with_the_persons_acting_token(
    deployed: None, iam: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "user")])
    seen: list[tuple[str, str | None]] = []

    async def acting_token(deployment: str, bearer: str | None) -> str:
        seen.append((deployment, bearer))
        return "acting-token-of-the-person" if bearer else ""

    monkeypatch.setattr(acting, "acting_token", acting_token)
    token = await gw.gmail_access_token(AGENT, "persons-own-token")
    assert token == "ya29.minted-1-for-a-mailbox"
    assert iam == ["acting-token-of-the-person"]
    assert seen == [(DEPLOYMENT, "persons-own-token")]
    # Held until it nearly ends: asked once.
    assert await gw.gmail_access_token(AGENT, "persons-own-token") == token
    assert iam == ["acting-token-of-the-person"]
    # Withheld wherever it would be shown (R-19).
    assert token not in credentials.withhold(f"the header was {token}")
    # Somebody signed in who has not let it act in their name: nothing.
    with pytest.raises(gw.GmailRefused, match="have not let it act in their name"):
        await gw.gmail_access_token(AGENT, None)


@pytest.mark.asyncio
async def test_a_token_near_its_end_is_asked_again(
    deployed: None, iam: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "owner")])
    monkeypatch.setattr(
        principal, "principal_token", lambda deployment: "principal-token"
    )

    async def short(bearer: str) -> dict[str, Any]:
        iam.append(bearer)
        return {
            "access_token": f"ya29.short-{len(iam)}-lived-token",
            "expires_in": gw.REFRESH_MARGIN_SECONDS - 1,
        }

    gw.use_iam(short)
    first = await gw.gmail_access_token(AGENT, None)
    second = await gw.gmail_access_token(AGENT, None)
    assert first != second and iam == ["principal-token", "principal-token"]


@pytest.mark.asyncio
async def test_in_the_owners_name_iam_is_asked_with_the_principals_token(
    deployed: None, iam: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "owner")])
    monkeypatch.setattr(
        principal, "principal_token", lambda deployment: "principal-token"
    )
    assert (
        await gw.gmail_access_token(AGENT, "a-visitors-token")
        == "ya29.minted-1-for-a-mailbox"
    )
    assert iam == ["principal-token"]
    monkeypatch.setattr(principal, "principal_token", lambda deployment: None)
    gw.forget_tokens()
    with pytest.raises(gw.GmailRefused, match="principal"):
        await gw.gmail_access_token(AGENT, None)


@pytest.mark.asyncio
async def test_iams_refusal_is_said_and_nothing_is_held(
    deployed: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "owner")])
    monkeypatch.setattr(
        principal, "principal_token", lambda deployment: "principal-token"
    )

    async def refuse(bearer: str) -> dict[str, Any]:
        raise gw.GmailRefused(
            "Gmail is not connected: connect it from the application's Permissions."
        )

    gw.use_iam(refuse)
    with pytest.raises(gw.GmailRefused, match="not connected"):
        await gw.gmail_access_token(AGENT, None)


@pytest.mark.asyncio
async def test_every_request_to_the_server_carries_the_minted_token() -> None:
    tokens = iter(["ya29.first", "ya29.second"])
    seen: list[str] = []

    async def token() -> str:
        return next(tokens)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), auth=gw.IamAccessTokenAuth(token)
    ) as client:
        await client.post("http://127.0.0.1:9711/mcp", json={})
        await client.post("http://127.0.0.1:9711/mcp", json={})
    assert seen == ["Bearer ya29.first", "Bearer ya29.second"]


@pytest.mark.asyncio
async def test_a_run_nobodys_gmail_is_reached_for_has_no_gmail_tool(
    iam: list[str],
) -> None:
    gw.remember_gmail_connection(AGENT, [_connection("google-workspace", "user")])
    entered: list[str] = []

    class Inner:
        async def __aenter__(self) -> Any:
            entered.append("entered")
            return self

        async def __aexit__(self, *args: Any) -> None:
            entered.append("left")

    toolset = gw.GoogleWorkspaceToolset(
        wrapped=Inner(), agent_id=AGENT, bearer="persons-own-token"
    )  # type: ignore[arg-type]
    async with toolset:
        assert await toolset.get_tools(None) == {}
    assert "deployed application" in toolset.refusal
    assert entered == [] and iam == []
    assert toolset.id == "google-workspace"


def test_the_run_toolset_is_bound_to_whom_it_acts_for() -> None:
    toolset = gw.toolset_for_the_run(
        AGENT, "persons-own-token", "http://127.0.0.1:9711/mcp"
    )
    assert isinstance(toolset, gw.GoogleWorkspaceToolset)
    assert toolset.agent_id == AGENT and toolset.bearer == "persons-own-token"


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.mark.asyncio
async def test_a_server_process_is_started_and_waited_for_and_stopped() -> None:
    port = _free_port()
    process = await gw.start_http_process(
        "google-workspace",
        sys.executable,
        ["-m", "http.server", str(port), "--bind", "127.0.0.1"],
        {"PATH": "/usr/bin:/bin"},
        f"http://127.0.0.1:{port}/mcp",
        20.0,
    )
    try:
        async with httpx.AsyncClient() as client:
            assert (await client.get(f"http://127.0.0.1:{port}/")).status_code == 200
    finally:
        await gw.stop_http_process(process)
    assert process.returncode is not None
    with pytest.raises(RuntimeError, match="exited"):
        await gw.start_http_process(
            "google-workspace",
            sys.executable,
            ["-c", "raise SystemExit(3)"],
            {},
            f"http://127.0.0.1:{_free_port()}/mcp",
            20.0,
        )


def test_the_gmail_process_gets_a_signing_key_of_its_own() -> None:
    env = gw.process_env("google-workspace", {"A": "1"})
    assert len(env["FASTMCP_SERVER_AUTH_GOOGLE_JWT_SIGNING_KEY"]) >= 32
    assert (
        gw.process_env("google-workspace", {})[
            "FASTMCP_SERVER_AUTH_GOOGLE_JWT_SIGNING_KEY"
        ]
        != env["FASTMCP_SERVER_AUTH_GOOGLE_JWT_SIGNING_KEY"]
    )
    assert "FASTMCP_SERVER_AUTH_GOOGLE_JWT_SIGNING_KEY" not in gw.process_env(
        "tavily", {}
    )


@pytest.mark.asyncio
async def test_the_lifecycle_runs_an_http_server_and_asks_it_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
    from agent_runtimes.types import MCPServer

    port = _free_port()
    config = MCPServer(
        id="google-workspace",
        name="Google Workspace",
        command=sys.executable,
        args=["-m", "http.server", str(port), "--bind", "127.0.0.1"],
        transport="streamable-http",
        url=f"http://127.0.0.1:{port}/mcp",
        env={"WORKSPACE_MCP_PORT": str(port)},
    )
    manager = MCPLifecycleManager()
    instance = await manager.start_server("google-workspace", config)
    try:
        assert instance is not None and instance.is_running and instance.tools == []
        assert (
            manager.get_running_server("google-workspace", is_config=None) is instance
        )
    finally:
        assert await manager.stop_server("google-workspace")
