# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The demo books, for a catalogue Battle played on them (B4-01).

The invoice race and the report challenge race scenes whose members reach
the gateway's ``odoo-accounting``: played signed out and rehearsed nightly,
their members' runtimes reach the books with the key of the account that
keeps them — for a Battle's run only, the key out of every environment.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from agent_runtimes.apps import battle_books
from agent_runtimes.apps.battle_books import (
    BOOKS_KEY_ENV,
    books_bearer,
    books_left_out,
    books_servers_of,
    books_start_key,
    take_books_key,
)
from agent_runtimes.apps.visitors import (
    battle_of_a2a,
    battle_of_the_run,
    enter_battle_run,
    leave_battle_run,
)
from agent_runtimes.guardrails.credentials import redact, release

BOOKS = "books-key-of-the-demo-account"


@pytest.fixture(autouse=True)
def fresh(monkeypatch: pytest.MonkeyPatch):
    battle_books.forget_books_key()
    monkeypatch.delenv(BOOKS_KEY_ENV, raising=False)
    monkeypatch.delenv("AGENT_RUNTIMES_VISITORS", raising=False)
    yield
    battle_books.forget_books_key()
    release(BOOKS)


def _given(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(BOOKS_KEY_ENV, BOOKS)


class _InTheRun:
    def __init__(self, battle: str):
        self.battle = battle

    def __enter__(self):
        self.token = enter_battle_run(self.battle)

    def __exit__(self, *_: Any):
        leave_battle_run(self.token)


def test_the_key_leaves_the_environment_and_is_withheld(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import os

    _given(monkeypatch)
    assert take_books_key() == BOOKS
    assert BOOKS_KEY_ENV not in os.environ
    assert take_books_key() == BOOKS
    assert BOOKS not in redact(f"the key is {BOOKS}")


def test_the_odoo_battles_play_on_the_books_and_the_others_not() -> None:
    assert books_servers_of("invoice-race") == {"odoo-accounting"}
    assert books_servers_of("report-challenge:0.0.1") == {"odoo-accounting"}
    for battle in ("pong", "invaders", "deck-race", "sheet-race", "not-a-battle", ""):
        assert books_servers_of(battle) == frozenset()


def test_the_visitors_runtime_starts_the_books_server_with_the_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _given(monkeypatch)
    # Not the visitors' runtime: nothing.
    assert books_start_key("odoo-accounting", {}) == ""
    monkeypatch.setenv("AGENT_RUNTIMES_VISITORS", "accounting")
    assert books_start_key("odoo-accounting", {}) == BOOKS
    # A key of its own, or a server that is not the books: nothing.
    assert books_start_key("odoo-accounting", {"DATALAYER_API_KEY": "own"}) == ""
    assert books_start_key("tavily", {}) == ""
    assert books_start_key("datalayer", {}) == ""


def test_only_a_battles_run_reaches_the_books(monkeypatch: pytest.MonkeyPatch) -> None:
    _given(monkeypatch)
    monkeypatch.setenv("AGENT_RUNTIMES_VISITORS", "accounting")
    books_start_key("odoo-accounting", {})
    # No Battle: a server started with the key is left out; any other keeps its rule.
    assert books_bearer("odoo-accounting") == ""
    assert books_bearer("tavily") is None
    with _InTheRun("invoice-race"):
        assert battle_of_the_run() == "invoice-race"
        assert books_bearer("odoo-accounting") == BOOKS
    # A Battle not on the books does not reach them.
    with _InTheRun("pong"):
        assert books_bearer("odoo-accounting") == ""
    assert battle_of_the_run() == ""


def test_a_runtime_given_no_key_keeps_its_own_rule() -> None:
    # A pool runtime's server started with its principal: the owner's books, as before.
    with _InTheRun("report-challenge"):
        assert books_bearer("odoo-accounting") is None
    assert books_bearer("odoo-accounting") is None


def test_the_process_toolsets_keep_the_books_for_a_battle_alone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _given(monkeypatch)
    monkeypatch.setenv("AGENT_RUNTIMES_VISITORS", "accounting")
    books_start_key("odoo-accounting", {})
    chart, books = SimpleNamespace(id="chart"), SimpleNamespace(id="odoo-accounting")
    assert books_left_out([chart, books]) == [chart]
    with _InTheRun("invoice-race"):
        assert books_left_out([chart, books]) == [chart, books]


def test_the_gateway_is_reached_with_the_books_key_in_a_battle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.mcp import datalayer_gateway
    from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run

    _given(monkeypatch)
    seen: list[dict[str, str]] = []
    monkeypatch.setattr(
        datalayer_gateway, "tracing_client", lambda headers: seen.append(headers)
    )
    monkeypatch.delenv("DATALAYER_MCP_SERVER_URL", raising=False)
    process = [SimpleNamespace(id="chart"), SimpleNamespace(id="odoo-accounting")]
    with _InTheRun("invoice-race"):
        toolsets = toolsets_for_the_run(process, "the-principals-token")
    assert [toolset.id for toolset in toolsets] == ["chart", "odoo-accounting"]
    assert seen == [{"Authorization": f"Bearer {BOOKS}"}]
    # Out of a Battle, the principal's as before.
    seen.clear()
    toolsets_for_the_run(process, "the-principals-token")
    assert seen == [{"Authorization": "Bearer the-principals-token"}]


def _run_request(meta: dict[str, Any]) -> bytes:
    return json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "SendStreamingMessage",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"text": "Open invoices?"}],
                    "metadata": meta,
                }
            },
        }
    ).encode()


def _meta_of(body: bytes) -> dict[str, Any]:
    return json.loads(body)["params"]["message"]["metadata"]


def test_the_gate_marks_the_battle_the_visitors_token_names_and_no_other() -> None:
    from agent_runtimes.apps.a2a import _RUN_METHODS, _with_credential, as_visitors_run

    assert "SendStreamingMessage" in _RUN_METHODS
    forged = {"datalayer": {"battle": "invoice-race", "visitor": "someone"}}
    marked = _meta_of(
        as_visitors_run(
            _run_request(forged), "tab-0001-visitor", None, "report-challenge"
        )
    )
    assert battle_of_a2a(marked) == "report-challenge"
    # A visitor's token naming no Battle: the message's is dropped.
    assert (
        battle_of_a2a(
            _meta_of(as_visitors_run(_run_request(forged), "tab-0001-visitor", None))
        )
        == ""
    )
    # A caller with a key granted to the route never names one.
    assert (
        battle_of_a2a(_meta_of(_with_credential(_run_request(forged), "route-key")))
        == ""
    )


def test_a_visitor_is_told_by_the_battle_ai_inference_says() -> None:
    from agent_runtimes.apps.callers import Caller

    assert Caller(kind="visitor", uid="tab-0001-visitor").battle == ""
    assert (
        Caller(kind="visitor", uid="tab-0001-visitor", battle="invoice-race").battle
        == "invoice-race"
    )
