# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for handing a live session from the terminal to a browser."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

import pytest

from agent_runtimes.routes.loop import HANDOFF_TTL_SECONDS, HandoffStore

if TYPE_CHECKING:
    from agent_runtimes.chat.tux import CliTux


class TestHandoffStore:
    def test_a_code_carries_the_session_and_dies_on_first_use(self) -> None:
        store = HandoffStore()
        code, _ = store.mint(
            "sess-1", {"agent_id": "loop-shell", "view": "notebook"}, now=1000.0
        )

        assert store.exchange(code, now=1005.0) == {
            "session_id": "sess-1",
            "agent_id": "loop-shell",
            "view": "notebook",
        }
        # Single use: a code left in scrollback is worthless after redemption.
        assert store.exchange(code, now=1005.0) is None
        assert len(store) == 0

    def test_a_code_expires(self) -> None:
        store = HandoffStore()
        code, expires_at = store.mint("sess-1", {}, now=1000.0)

        assert expires_at == 1000.0 + HANDOFF_TTL_SECONDS
        assert store.exchange(code, now=1000.0 + HANDOFF_TTL_SECONDS + 1) is None

    def test_an_unknown_code_is_refused(self) -> None:
        assert HandoffStore().exchange("not-a-code") is None

    def test_expired_codes_are_purged_rather_than_accumulating(self) -> None:
        store = HandoffStore()
        store.mint("old", {}, now=1000.0)
        store.mint("older", {}, now=1000.0)

        store.mint("fresh", {}, now=2000.0)

        assert len(store) == 1

    def test_codes_are_unguessable_and_distinct(self) -> None:
        store = HandoffStore()
        first, _ = store.mint("sess", {}, now=1000.0)
        second, _ = store.mint("sess", {}, now=1000.0)

        assert first != second
        assert len(first) >= 24


class TestEndpoints:
    def test_minting_returns_a_redeemable_code(self) -> None:
        from agent_runtimes.routes.loop import (
            HandoffRequest,
            create_handoff,
            exchange_handoff,
        )

        response = asyncio.run(
            create_handoff(
                "sess-42",
                HandoffRequest(
                    agent_id="loop-shell",
                    view="sandbox",
                    runtime={"where": "local"},
                ),
            )
        )

        assert response.url.endswith(response.code)
        session = asyncio.run(exchange_handoff(response.code))
        assert session["session_id"] == "sess-42"
        assert session["view"] == "sandbox"
        assert session["runtime"]["where"] == "local"

    def test_a_datalayer_runtime_travels_in_the_exchange_not_the_url(self) -> None:
        from agent_runtimes.routes.loop import (
            HandoffRequest,
            create_handoff,
            exchange_handoff,
        )

        runtime = {
            "where": "datalayer",
            "name": "ai-agents-pool-abc",
            "jupyter_url": "https://r1.example/jupyter/server/pool/abc",
            "jupyter_token": "secret-runtime-token",
        }
        response = asyncio.run(
            create_handoff(
                "sess-7",
                HandoffRequest(agent_id="cloud", view="notebook", runtime=runtime),
            )
        )

        # The token is redeemed once, by the page; the URL never carries it.
        assert "secret-runtime-token" not in response.url
        assert asyncio.run(exchange_handoff(response.code))["runtime"] == runtime

    def test_a_handoff_says_where_the_agent_runs(self) -> None:
        from pydantic import ValidationError

        from agent_runtimes.routes.loop import HandoffRequest

        with pytest.raises(ValidationError):
            HandoffRequest(agent_id="cloud")
        # On Datalayer the page needs the runtime's Jupyter: refused without it.
        with pytest.raises(ValidationError):
            HandoffRequest(agent_id="cloud", runtime={"where": "datalayer"})

    def test_a_bad_code_is_a_404(self) -> None:
        from fastapi import HTTPException

        from agent_runtimes.routes.loop import exchange_handoff

        with pytest.raises(HTTPException) as caught:
            asyncio.run(exchange_handoff("nope"))
        assert caught.value.status_code == 404


class TestHandoffRuntime:
    def _tux(self, **kwargs: object) -> "CliTux":
        values: dict[str, object] = {
            "where": None,
            "jupyter_url": None,
            "cloud_runtime": None,
        }
        values.update(kwargs)
        return cast("CliTux", SimpleNamespace(**values))

    def test_a_local_session_is_handed_over_as_local(self) -> None:
        from agent_runtimes.chat.commands.browser import _handoff_runtime

        assert _handoff_runtime(
            self._tux(jupyter_url="http://127.0.0.1:8888?token=t")
        ) == {"where": "local"}

    def test_a_cloud_session_names_its_runtime_and_jupyter(self) -> None:
        from agent_runtimes.chat.commands.browser import _handoff_runtime

        runtime = _handoff_runtime(
            self._tux(
                where="abc on Datalayer (ai-agents)",
                cloud_runtime="abc",
                jupyter_url="https://r1.example/jupyter/server/pool/abc/?token=tok",
            )
        )

        assert runtime == {
            "where": "datalayer",
            "name": "abc",
            "jupyter_url": "https://r1.example/jupyter/server/pool/abc",
            "jupyter_token": "tok",
        }

    def test_a_cloud_session_without_its_jupyter_is_refused(self) -> None:
        from agent_runtimes.chat.commands.browser import _handoff_runtime

        with pytest.raises(ValueError, match="no notebook to open"):
            _handoff_runtime(
                self._tux(where="abc on Datalayer (ai-agents)", cloud_runtime="abc")
            )


class TestBrowserCommand:
    def _tux(self, opened: list[str], code: str | None) -> SimpleNamespace:
        class FakeConsole:
            def print(self, *args, **kwargs) -> None:
                pass

        return SimpleNamespace(
            console=FakeConsole(),
            server_url="http://server",
            agent_id="loop-shell",
            session=SimpleNamespace(
                conversation_id="conv-9", model="openai:gpt-4o", sandbox={}
            ),
            _opened=opened,
            _code=code,
        )

    def _run(
        self, monkeypatch: pytest.MonkeyPatch, argv: str, code: str | None
    ) -> list[str]:
        from agent_runtimes.chat.commands import browser as browser_cmd

        opened: list[str] = []
        tux = self._tux(opened, code)

        async def mint(_tux, _view):
            return code

        monkeypatch.setattr(browser_cmd, "_mint_handoff", mint)
        monkeypatch.setattr(
            browser_cmd.webbrowser, "open", lambda url: opened.append(url)
        )
        asyncio.run(browser_cmd.execute(cast("CliTux", tux), argv))
        return opened

    def test_opens_the_workspace_with_the_handoff_code(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        opened = self._run(monkeypatch, "notebook", "abc123")

        assert opened == ["http://server/loop?handoff=abc123&view=notebook"]

    def test_chat_does_not_need_a_view_parameter(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        assert self._run(monkeypatch, "", "abc123") == [
            "http://server/loop?handoff=abc123"
        ]

    def test_falls_back_to_the_page_that_exists_when_handoff_is_unavailable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        opened = self._run(monkeypatch, "notebook", None)

        # An older server still opens something useful, just without continuity.
        assert opened == ["http://server/static/agent-notebook.html?agentId=loop-shell"]

    def test_an_unknown_view_opens_nothing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        assert self._run(monkeypatch, "hologram", "abc123") == []
