# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The demo books, for a catalogue Battle played on them.

Two Battles of the catalogue race scenes on Odoo books — the invoice race
(Sales & Accounting) and the month-end report challenge (Month-end Close) —
whose members reach the gateway's ``odoo-accounting`` toolset. A visitor
plays them signed out, and the nightly rehearsal plays them too, so the
runtimes that play their members — the visitors' runtime, and a pool runtime
serving the member's deployment — need a key for the books, and nobody's own
account is there to give one.

**The key.** The deployment gives these runtimes a key of the account that
keeps the demo books (``DATALAYER_BATTLE_BOOKS_API_KEY``): the gateway reads
the Odoo credentials from that account's secrets, so the key reaches those
books and no other. It is taken out of the environment as the runtime starts
(:func:`take_books_key`), so that nothing started from it — an MCP server's
process, a command, a sandbox — inherits it; held, so that it is withheld
from whatever the model reads; never logged.

**Who reaches the books with it.** A run of a catalogue Battle's member
only: the visitor's token names the Battle (ai-inference's ``battle``,
verified at ``whoami``), the gate marks the run with it
(:func:`agent_runtimes.apps.visitors.battle_of_the_run`), and only the
gateway's Odoo servers the Battle's scenes connect to are reached with the
key, read only as every visitor's run is (`visitors.visitor_refusal`). Any
other run on the visitors' runtime leaves those servers out. A runtime given
no key keeps its own rule: a pool runtime reaches the books as its
deployment's principal (its owner's, which it serves to visitors already),
and the visitors' runtime, holding no key at all, never starts them.

**A public demo of the account that keeps the books.** The key is that
account's own (datalayer-demo, whose Accounting the Stages show reading the
same books with its principal). A visitor's run of one of that account's
public deployments — the Accountant's and Terra's demos (the user, 19
November 2026: "the demo agents should try to start mcp server as much as
possible") — reaches with the key the gateway's servers its application
connects to read only in its owner's account (`access: read`, `as: owner`):
the deployment's owner, as ai-agents said it when the address was resolved
(``owner_uid`` of its instance), must be the account IAM says the key is of
(:func:`books_account`, asked once). Anybody else's deployment, a write
connection or one in each user's name never is; every visitor's call is
still held to reading (`visitors.visitor_refusal`).
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

__all__ = [
    "BOOKS_KEY_ENV",
    "books_bearer",
    "books_account",
    "books_left_out",
    "books_key",
    "books_servers_of",
    "books_start_key",
    "forget_books_key",
    "is_books_server",
    "owners_servers",
    "owners_servers_of_the_run",
    "remember_owners_servers",
    "take_books_key",
]

#: The variable the deployment gives the key in: read once, then taken out of the environment.
BOOKS_KEY_ENV = "DATALAYER_BATTLE_BOOKS_API_KEY"

_LOCK = threading.Lock()
_KEY: dict[str, str] = {}
#: The servers this process started with the books key: no run but a Battle's reaches them.
_STARTED_WITH_KEY: set[str] = set()
#: agent id -> the gateway's servers its application connects to read only, in its owner's account.
_OWNERS_SERVERS: dict[str, frozenset[str]] = {}
#: The account the books key is of, once IAM said it.
_ACCOUNT: dict[str, str] = {}


def take_books_key() -> str:
    """The books key, taken out of the environment the first time; ``""`` when none is given."""
    from agent_runtimes.guardrails.credentials import hold

    with _LOCK:
        if "key" not in _KEY:
            _KEY["key"] = (os.environ.pop(BOOKS_KEY_ENV, "") or "").strip()
        key = _KEY["key"]
    if key:
        hold(key)
    return key


def books_key() -> str:
    """The books key this runtime holds, ``""`` for none."""
    return take_books_key()


def forget_books_key() -> None:
    """Forget the key and what was started with it (tests, and a runtime handing it back)."""
    with _LOCK:
        _KEY.clear()
        _STARTED_WITH_KEY.clear()
        _OWNERS_SERVERS.clear()
        _ACCOUNT.clear()


def is_books_server(server_id: str) -> bool:
    """Whether a server of the catalogue is one of the gateway's Odoo toolsets (``odoo-accounting``)."""
    from agent_runtimes.mcp.catalog_mcp_servers import get_catalog_server
    from agent_runtimes.mcp.datalayer_gateway import gateway_query

    if not gateway_query(server_id):
        return False
    server = get_catalog_server(server_id)
    return server is not None and "odoo" in (server.tags or [])


def _base(ref: str) -> str:
    return str(ref or "").split(":", 1)[0]


def _is_gateway_server(server_id: str) -> bool:
    """Whether a server of the catalogue is the gateway with some of its toolsets (``only=…``)."""
    from agent_runtimes.mcp.datalayer_gateway import gateway_query

    return bool(gateway_query(server_id))


def _word(value: object, default: str) -> str:
    """An enum's value or a plain string, as a connection says it."""
    return str(getattr(value, "value", value) or default)


def remember_owners_servers(agent_id: str, connections: object) -> None:
    """Keep the gateway's servers an agent's application connects to read only, in its owner's account.

    ``None`` or no such connection forgets the agent.
    """
    servers = frozenset(
        _base(str(getattr(connection, "server", "") or ""))
        for connection in (connections or ())  # type: ignore[attr-defined]
        if _word(getattr(connection, "access", None), "read") == "read"
        and _word(getattr(connection, "acts_as", None), "owner") == "owner"
        and _is_gateway_server(_base(str(getattr(connection, "server", "") or "")))
    )
    with _LOCK:
        if servers:
            _OWNERS_SERVERS[agent_id] = servers
        else:
            _OWNERS_SERVERS.pop(agent_id, None)


def owners_servers(agent_id: str | None) -> frozenset[str]:
    """The gateway's servers an agent's application connects to read only, in its owner's account."""
    with _LOCK:
        return _OWNERS_SERVERS.get(agent_id or "", frozenset())


async def _whoami(key: str) -> str:
    """The uid of the account a key is of, as IAM says it; ``""`` when it cannot be read."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    iam = str(getattr(DatalayerURLs.from_environment(), "iam_url", "") or "").rstrip(
        "/"
    )
    if not iam:
        return ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            answered = await client.get(
                f"{iam}/api/iam/v1/whoami", headers={"Authorization": f"Bearer {key}"}
            )
        if answered.status_code != 200:
            return ""
        said = answered.json()
    except (httpx.HTTPError, ValueError):
        return ""
    profile = (
        (said.get("profile") or said.get("user") or said)
        if isinstance(said, dict)
        else {}
    )
    return (
        str(profile.get("uid") or profile.get("id") or "")
        if isinstance(profile, dict)
        else ""
    )


async def books_account() -> str:
    """The account the books key is of, asked of IAM once; ``""`` with no key or when unread."""
    key = books_key()
    if not key:
        return ""
    with _LOCK:
        known = _ACCOUNT.get("uid")
    if known:
        return known
    uid = await _whoami(key)
    if uid:
        with _LOCK:
            _ACCOUNT["uid"] = uid
    else:
        logger.warning(
            "  [battle-books] IAM did not say whose the books key is: no demo reaches the books."
        )
    return uid


async def owners_servers_of_the_run(
    agent_id: str | None, instance: dict | None
) -> frozenset[str]:
    """The gateway's servers a visitor's run reaches with the books key: its owner's own.

    On the visitors' runtime holding the key, for a deployment whose owner is
    the account the key is of: the servers its application connects to read
    only in its owner's account. None otherwise.
    """
    from agent_runtimes.apps.visitors import visitors_runtime

    servers = owners_servers(agent_id)
    owner = str((instance or {}).get("owner_uid") or "").strip()
    if not servers or not owner or not visitors_runtime() or not books_key():
        return frozenset()
    return servers if await books_account() == owner else frozenset()


def books_servers_of(battle: str) -> frozenset[str]:
    """The gateway's Odoo servers a catalogue Battle's contestants connect to; none for any other Battle."""
    from agent_runtimes.specs.apps import get_app
    from agent_runtimes.specs.battles import get_battle
    from agent_runtimes.specs.scenes import get_scene_spec

    spec = get_battle(battle) if battle else None
    if spec is None:
        return frozenset()
    apps: list[str] = []
    for contestant in spec.contestants:
        if contestant.app:
            apps.append(contestant.app)
        scene = get_scene_spec(contestant.scene) if contestant.scene else None
        if scene is not None:
            apps.extend(member.app for member in scene.cast if member.app)
    servers: set[str] = set()
    for ref in apps:
        app = get_app(ref)
        for connection in (app.connections if app else None) or []:
            server = _base(connection.server)
            if is_books_server(server):
                servers.add(server)
    return frozenset(servers)


def books_start_key(server_id: str, env: dict[str, str] | None = None) -> str:
    """The key a books server is started with on the visitors' runtime, which holds no key of its own.

    Started so that its tools are there for a Battle's run, which reaches it
    with the key; every other run leaves it out (:func:`books_bearer`).
    ``""`` elsewhere, for any other server, or with no key given.
    """
    from agent_runtimes.apps.visitors import visitors_runtime

    if (env or {}).get("DATALAYER_API_KEY") or not visitors_runtime():
        return ""
    # The books for a Battle, and any of the gateway's toolsets for a demo of
    # the account the key is of (Terra's Earthdata search).
    if not _is_gateway_server(server_id):
        return ""
    key = books_key()
    if not key:
        return ""
    with _LOCK:
        _STARTED_WITH_KEY.add(server_id)
    logger.info(
        "  [battle-books] '%s' is started with the books key: only a Battle's run, or a demo of the key's account, reaches it.",
        server_id,
    )
    return key


def books_bearer(server_id: str, owners: frozenset[str] = frozenset()) -> Optional[str]:
    """The bearer a gateway server is reached with in the run under way, as a Battle decides it.

    - The run serves a demo of the account the key is of, and ``owners``
      (:func:`owners_servers_of_the_run`) names this server: the key.
    - The run plays a catalogue Battle whose scenes connect to this Odoo
      server, and the runtime holds the books key: the key.
    - Otherwise, a server started with the books key: ``""``, left out.
    - Otherwise ``None``: the run's own rule holds.
    """
    from agent_runtimes.apps.visitors import battle_of_the_run

    if server_id in owners:
        own = books_key()
        if own:
            return own
    battle = battle_of_the_run()
    key = books_key() if battle else ""
    if key and server_id in books_servers_of(battle):
        return key
    with _LOCK:
        started_with_key = server_id in _STARTED_WITH_KEY
    return "" if started_with_key else None


def books_left_out(toolsets: list) -> list:
    """The run's toolsets as the process holds them, without a server started
    with the books key when the run is no Battle's on those books.
    """
    return [
        toolset
        for toolset in toolsets
        if books_bearer(str(getattr(toolset, "id", None) or "")) != ""
    ]
