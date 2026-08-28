# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for keeping the terminal and the browser on the same conversation."""

from __future__ import annotations

import asyncio

from agent_runtimes.loop import SessionSync


def _history(*messages: tuple[str, str]) -> list[dict]:
    return [{"role": role, "content": content} for role, content in messages]


def _poll(sync: SessionSync, messages: list[dict]):
    async def fetch():
        return messages

    return asyncio.run(sync.poll(fetch=fetch))


class TestBaseline:
    def test_the_first_look_reports_nothing(self) -> None:
        sync = SessionSync(server_url="http://server")

        # Whatever was already there is not news; announcing it would replay the
        # conversation the reader has just been having.
        assert _poll(sync, _history(("user", "hello"), ("assistant", "hi"))) == []

    def test_an_empty_history_is_a_fine_baseline(self) -> None:
        sync = SessionSync(server_url="http://server")

        assert _poll(sync, []) == []
        turns = _poll(sync, _history(("user", "from the browser")))
        assert [t.content for t in turns] == ["from the browser"]


class TestForeignTurns:
    def test_a_turn_from_the_other_end_is_reported(self) -> None:
        sync = SessionSync(server_url="http://server")
        messages = _history(("user", "hello"))
        _poll(sync, messages)

        messages.extend(_history(("user", "typed in the browser"), ("assistant", "sure")))
        turns = _poll(sync, messages)

        assert [(t.role, t.content) for t in turns] == [
            ("user", "typed in the browser"),
            ("assistant", "sure"),
        ]

    def test_this_end_does_not_hear_its_own_echo(self) -> None:
        sync = SessionSync(server_url="http://server")
        messages = _history(("user", "first"))
        _poll(sync, messages)

        # The terminal sends something; it appears in the shared history.
        sync.note_local("typed here")
        messages.extend(_history(("user", "typed here"), ("assistant", "answered")))
        turns = _poll(sync, messages)

        # Only the reply is news — being told your own message came from the
        # browser would be worse than silence.
        assert [(t.role, t.content) for t in turns] == [("assistant", "answered")]

    def test_the_same_text_twice_only_swallows_one_echo(self) -> None:
        sync = SessionSync(server_url="http://server")
        _poll(sync, [])
        sync.note_local("again")

        turns = _poll(sync, _history(("user", "again"), ("user", "again")))

        # One was ours; the second really did come from somewhere else.
        assert [t.content for t in turns] == ["again"]

    def test_nothing_new_reports_nothing(self) -> None:
        sync = SessionSync(server_url="http://server")
        messages = _history(("user", "hello"))
        _poll(sync, messages)

        assert _poll(sync, messages) == []

    def test_blank_messages_are_skipped(self) -> None:
        sync = SessionSync(server_url="http://server")
        _poll(sync, [])

        assert _poll(sync, _history(("assistant", "   "))) == []


class TestFailure:
    def test_an_unreachable_server_is_not_an_error_worth_showing(self) -> None:
        sync = SessionSync(server_url="http://server")

        async def fetch():
            return None

        # The two ends are out of step for a moment, which the next poll fixes.
        assert asyncio.run(sync.poll(fetch=fetch)) == []

    def test_it_recovers_without_replaying_the_conversation(self) -> None:
        sync = SessionSync(server_url="http://server")
        messages = _history(("user", "hello"), ("assistant", "hi"))
        _poll(sync, messages)

        async def failed():
            return None

        asyncio.run(sync.poll(fetch=failed))
        messages.extend(_history(("user", "new")))

        assert [t.content for t in _poll(sync, messages)] == ["new"]


class TestUrl:
    def test_it_reads_the_shared_history(self) -> None:
        sync = SessionSync(server_url="http://server/", agent_id="loop-base")

        assert sync.history_url == "http://server/api/v1/history"
        assert sync.agent_id == "loop-base"
