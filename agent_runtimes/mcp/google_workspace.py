# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Gmail, reached in the name of the person an application acts for (STUDIO W-02).

The catalogue's ``google-workspace`` server is ``workspace-mcp`` in its
external OAuth provider mode: a local HTTP process (its spec's ``command``,
reached at its ``url``) that holds no Google credential and opens the mailbox
of whichever Google access token each request carries.

Where the token comes from: the person connected Gmail in Google's own consent
screen, at *can read* or *can read and send*, and Datalayer's IAM keeps the
refresh token as their secret. For each run of a deployed application's agent
the runtime makes a toolset of its own, bound to who the run is for, whose
every HTTP request to the server carries an access token IAM minted
(``POST /api/iam/v1/oauth2/google-workspace/token``) — asked with

- the person's token naming the application (LOOP I-04, ``loop.apps.acting``)
  when the application's connection to Gmail is in the name of who uses it
  (``as: user``);
- the application's principal's token (I-03) when it is in its owner's;

and narrowed by IAM to the connection's level (``access: read`` is *can read*,
``write`` *can read and send*). The access token is held in memory until
:data:`REFRESH_MARGIN_SECONDS` before it ends, never in the environment, the
record or the model's context (R-19); the refresh token never leaves IAM.

A run nobody's Gmail can be reached for — no deployment (a Preview, a local
run), the person has not let it act in their name, Gmail not connected or at a
lower level — has no Gmail tools, and why is logged in a sentence: nothing is
reached with anybody else's mailbox, and the run's other tools still work.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Awaitable, Callable, Iterable, Optional
from urllib.parse import urlparse

import httpx
from pydantic_ai.toolsets import AbstractToolset, WrapperToolset

logger = logging.getLogger(__name__)

__all__ = [
    "GOOGLE_WORKSPACE_SERVER",
    "REFRESH_MARGIN_SECONDS",
    "GmailRefused",
    "GoogleWorkspaceToolset",
    "IamAccessTokenAuth",
    "acts_as_of",
    "forget_tokens",
    "gmail_access_token",
    "process_env",
    "remember_gmail_connection",
    "start_http_process",
    "toolset_for_the_run",
    "use_iam",
]

#: The catalogue's server whose every call carries a token IAM minted.
GOOGLE_WORKSPACE_SERVER = "google-workspace"

#: Asked again when less than this is left of an access token.
REFRESH_MARGIN_SECONDS = 120

#: agent id -> in whose name its application's connection to Gmail is (`user`, `owner`).
_ACTS_AS: dict[str, str] = {}

#: (who asks, deployment) -> {"token", "expires_at"}. Process memory only.
_HELD: dict[tuple[str, str], dict[str, Any]] = {}


class GmailRefused(Exception):
    """Why a run reaches nobody's Gmail, in a sentence."""


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def remember_gmail_connection(agent_id: str, connections: Iterable[Any] | None) -> None:
    """Keep in whose name an agent's application reaches Gmail; none forgets."""
    for connection in connections or ():
        if _id_of(getattr(connection, "server", "")) == GOOGLE_WORKSPACE_SERVER:
            acting = getattr(connection, "acts_as", "owner")
            _ACTS_AS[agent_id] = str(getattr(acting, "value", acting) or "owner")
            return
    _ACTS_AS.pop(agent_id, None)


def acts_as_of(agent_id: str | None) -> str:
    """In whose name an agent's application reaches Gmail, or ``""`` when it does not."""
    return _ACTS_AS.get(agent_id or "", "")


def forget_tokens() -> None:
    """Forget every access token held: a test, or a runtime told to."""
    _HELD.clear()


async def _ask_iam(bearer: str) -> dict[str, Any]:
    """Ask IAM for the access token on Gmail for whom ``bearer`` acts, or raise `GmailRefused`."""
    from datalayer_core.utils.urls import DatalayerURLs

    url = str(getattr(DatalayerURLs.from_environment(), "iam_url", "") or "").rstrip(
        "/"
    )
    if not url:
        raise GmailRefused("No IAM is configured here: Gmail is reached through it.")
    async with httpx.AsyncClient(timeout=20.0) as client:
        answer = await client.post(
            f"{url}/api/iam/v1/oauth2/google-workspace/token",
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if answer.status_code >= 300:
        try:
            detail = str((answer.json() or {}).get("detail") or "")
        except ValueError:
            detail = ""
        raise GmailRefused(
            detail or f"IAM gave no Gmail access token ({answer.status_code})."
        )
    return dict(answer.json() or {})


#: Who is asked; replaced by a test.
_iam: dict[str, Callable[[str], Awaitable[dict[str, Any]]]] = {"ask": _ask_iam}


def use_iam(asker: Optional[Callable[[str], Awaitable[dict[str, Any]]]]) -> None:
    """Who mints the access token: IAM, or a test; ``None`` for IAM."""
    _iam["ask"] = asker or _ask_iam


async def _iam_bearer(
    agent_id: str, deployment_uid: str, bearer: Optional[str]
) -> tuple[str, str]:
    """The token IAM is asked with, and who it stands for: `(token, key)`."""
    acting = acts_as_of(agent_id)
    if not acting:
        raise GmailRefused("This application has no connection to Gmail.")
    if acting == "user":
        from agent_runtimes.loop.apps.acting import acting_token

        person = await acting_token(deployment_uid, bearer)
        if not person:
            raise GmailRefused(
                "Gmail is reached in the name of who uses this application, and they have not let it "
                "act in their name (or nobody signed in is talking to it)."
            )
        return person, f"user:{hashlib.sha256((bearer or '').encode()).hexdigest()}"
    from agent_runtimes.loop.apps.principal import principal_token

    principal = principal_token(deployment_uid) or ""
    if not principal:
        raise GmailRefused(
            "This deployment holds no token of its application's principal: nothing reaches its owner's Gmail."
        )
    return principal, "owner"


async def gmail_access_token(agent_id: str, bearer: Optional[str]) -> str:
    """
    An access token on the Gmail of whom a run of ``agent_id`` acts for.

    Parameters
    ----------
    agent_id : str
        The deployed application's agent.
    bearer : str | None
        The token of the person talking to it, as their request carries it.

    Returns
    -------
    str
        A Google access token IAM minted, held until it nearly ends.

    Raises
    ------
    GmailRefused
        Nobody's Gmail can be reached for this run, and why.
    """
    from agent_runtimes.loop.apps.principal import deployment_of
    from agent_runtimes.models.models import app_instance_of

    deployment_uid = deployment_of(app_instance_of(agent_id))
    if not deployment_uid:
        raise GmailRefused(
            "Gmail is reached only by a deployed application, in the name of whom it acts for: "
            "not in a Preview or a local run."
        )
    iam_bearer, who = await _iam_bearer(agent_id, deployment_uid, bearer)
    key = (who, deployment_uid)
    held = _HELD.get(key)
    if held is not None and held["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS:
        return str(held["token"])
    try:
        answer = await _iam["ask"](iam_bearer)
    except GmailRefused:
        _HELD.pop(key, None)
        raise
    except Exception as error:  # noqa: BLE001 - said, and nothing is reached
        _HELD.pop(key, None)
        raise GmailRefused(
            f"IAM could not be asked for a Gmail access token ({type(error).__name__})."
        ) from None
    token = str(answer.get("access_token") or "")
    if not token:
        raise GmailRefused("IAM answered no Gmail access token.")
    from agent_runtimes.guardrails.credentials import hold, release

    if held is not None:
        release(held["token"])
    # Withheld wherever it would be shown, should a tool ever echo it (R-19).
    hold(token)
    _HELD[key] = {
        "token": token,
        "expires_at": time.time() + int(answer.get("expires_in") or 0),
    }
    return token


class IamAccessTokenAuth(httpx.Auth):
    """Each request to the server carries a fresh access token, asked when it nearly ends."""

    def __init__(self, token: Callable[[], Awaitable[str]]) -> None:
        self._token = token

    async def async_auth_flow(
        self, request: httpx.Request
    ) -> AsyncGenerator[httpx.Request, httpx.Response]:
        request.headers["Authorization"] = f"Bearer {await self._token()}"
        yield request


@dataclass
class GoogleWorkspaceToolset(WrapperToolset[Any]):
    """The Gmail server for one run, in the name of whom the run acts for.

    Entered with the run: the access token is asked first, and a run for which
    none can be had offers no Gmail tool (``refusal`` says why) rather than
    failing the whole run or reaching anybody else's mailbox.
    """

    agent_id: str = ""
    bearer: Optional[str] = None
    refusal: str = ""
    _entered: bool = field(default=False, repr=False)

    @property
    def id(self) -> str | None:
        return GOOGLE_WORKSPACE_SERVER

    @property
    def label(self) -> str:
        return "Gmail"

    async def __aenter__(self) -> "GoogleWorkspaceToolset":
        try:
            await gmail_access_token(self.agent_id, self.bearer)
        except GmailRefused as refused:
            self.refusal = str(refused)
            logger.warning(
                "No Gmail for this run of %s: %s", self.agent_id, self.refusal
            )
            return self
        await self.wrapped.__aenter__()
        self._entered = True
        return self

    async def __aexit__(self, *args: Any) -> bool | None:
        if not self._entered:
            return None
        self._entered = False
        return await self.wrapped.__aexit__(*args)

    async def get_tools(self, ctx: Any) -> dict[str, Any]:
        if not self._entered:
            return {}
        return await self.wrapped.get_tools(ctx)


def toolset_for_the_run(
    agent_id: str, bearer: Optional[str], url: str
) -> AbstractToolset[Any]:
    """
    The Gmail server's toolset for one run of ``agent_id``, bound to whom it acts for.

    Parameters
    ----------
    agent_id : str
        The agent the run is of.
    bearer : str | None
        The token of the person talking to it.
    url : str
        Where the server's process answers.
    """
    from pydantic_ai.mcp import MCPToolset

    from agent_runtimes.mcp.tracing import tracing_client

    async def token() -> str:
        return await gmail_access_token(agent_id, bearer)

    client = tracing_client(auth=IamAccessTokenAuth(token))
    inner = MCPToolset(url, id=GOOGLE_WORKSPACE_SERVER, http_client=client)
    return GoogleWorkspaceToolset(wrapped=inner, agent_id=agent_id, bearer=bearer)


def process_env(server_id: str, env: dict[str, str]) -> dict[str, str]:
    """The environment a server run as a local HTTP process starts with.

    The Gmail server, holding no Google client secret, signs nothing of its
    own but still asks for a signing key: a random one, per process, never
    kept.
    """
    env = dict(env)
    if server_id == GOOGLE_WORKSPACE_SERVER:
        env.setdefault(
            "FASTMCP_SERVER_AUTH_GOOGLE_JWT_SIGNING_KEY", secrets.token_urlsafe(32)
        )
    return env


async def start_http_process(
    server_id: str,
    command: str,
    args: list[str],
    env: dict[str, str],
    url: str,
    timeout: float,
) -> asyncio.subprocess.Process:
    """
    Start a server's command as a local HTTP process and wait until it listens at ``url``.

    Raises
    ------
    RuntimeError
        It exited, or did not listen within ``timeout`` seconds (it is then stopped).
    """
    address = urlparse(url)
    host = address.hostname or "127.0.0.1"
    port = address.port or (443 if address.scheme == "https" else 80)
    process = await asyncio.create_subprocess_exec(
        command,
        *args,
        env=process_env(server_id, env),
        stdin=asyncio.subprocess.DEVNULL,
    )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.returncode is not None:
            raise RuntimeError(
                f"MCP server '{server_id}' exited ({process.returncode}) before it listened at {url}"
            )
        try:
            _reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=1.0
            )
        except (OSError, asyncio.TimeoutError):
            await asyncio.sleep(0.5)
            continue
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass
        return process
    await stop_http_process(process)
    raise RuntimeError(
        f"MCP server '{server_id}' did not listen at {url} within {timeout:g}s"
    )


async def stop_http_process(process: asyncio.subprocess.Process) -> None:
    """Stop it: terminate, then kill when it does not go."""
    if process.returncode is not None:
        return
    try:
        process.terminate()
        await asyncio.wait_for(process.wait(), timeout=5.0)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
    except ProcessLookupError:
        pass
