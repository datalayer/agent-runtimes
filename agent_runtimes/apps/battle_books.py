# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The demo books, for a catalogue Battle played on them (B4-01).

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
from whatever the model reads (R-19); never logged.

**Who reaches the books with it.** A run of a catalogue Battle's member
only: the visitor's token names the Battle (ai-inference's ``battle``,
verified at ``whoami``), the gate marks the run with it
(:func:`agent_runtimes.apps.visitors.battle_of_the_run`), and only the
gateway's Odoo servers the Battle's scenes connect to are reached with the
key, read only as every visitor's run is (`visitors.visitor_refusal`). Any
other run on the visitors' runtime leaves those servers out; a Battle on the
books with no key configured leaves them out too, in a log line, rather than
reaching another account's books.
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
    "books_left_out",
    "books_key",
    "books_servers_of",
    "books_start_key",
    "forget_books_key",
    "is_books_server",
    "take_books_key",
]

#: The variable the deployment gives the key in: read once, then taken out of the environment.
BOOKS_KEY_ENV = "DATALAYER_BATTLE_BOOKS_API_KEY"

_LOCK = threading.Lock()
_KEY: dict[str, str] = {}
#: The servers this process started with the books key: no run but a Battle's reaches them.
_STARTED_WITH_KEY: set[str] = set()


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
    if not is_books_server(server_id):
        return ""
    key = books_key()
    if not key:
        return ""
    with _LOCK:
        _STARTED_WITH_KEY.add(server_id)
    logger.info(
        "  [battle-books] '%s' is started with the books key: only a Battle's run reaches it.",
        server_id,
    )
    return key


def books_bearer(server_id: str) -> Optional[str]:
    """The bearer a gateway server is reached with in the run under way, as a Battle decides it.

    - The run plays a catalogue Battle whose scenes connect to this Odoo
      server: the books key — ``""`` (left out) when none is given.
    - Otherwise, a server started with the books key: ``""``, left out.
    - Otherwise ``None``: the run's own rule holds.
    """
    from agent_runtimes.apps.visitors import battle_of_the_run

    battle = battle_of_the_run()
    if battle and server_id in books_servers_of(battle):
        key = books_key()
        if not key:
            logger.warning(
                "The Battle %s plays on the books and this runtime was given no %s: "
                "'%s' is left out of its run.",
                battle,
                BOOKS_KEY_ENV,
                server_id,
            )
        return key
    with _LOCK:
        started_with_key = server_id in _STARTED_WITH_KEY
    return "" if started_with_key else None


def books_left_out(toolsets: list) -> list:
    """The run's toolsets as the process holds them, without a server started
    with the books key when the run is no Battle's on those books."""
    return [
        toolset
        for toolset in toolsets
        if books_bearer(str(getattr(toolset, "id", None) or "")) != ""
    ]
