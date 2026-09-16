# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the terminal offers, and what it is built with.

Two things the terminal got wrong once and should not get wrong again: the
models it says may be picked, and the attributes its own constructor sets.
"""

from __future__ import annotations

import re
from pathlib import Path

import agent_runtimes
from agent_runtimes.chat.banner import (
    BANNER,
    GOODBYE_MESSAGE,
    LOOP_VERSION,
    LOOP_WORDMARK,
    LOOP_WORDMARK_VERB,
    TOKENS_DOWN,
    TOKENS_UP,
)
from agent_runtimes.chat.cli import _available_model_ids_by_env, _quiet_the_logs
from agent_runtimes.chat.tux import CliTux
from agent_runtimes.specs.models import list_models

CHAT_DIR = Path(__file__).resolve().parent.parent / "chat"


class TestModelsOffered:
    def test_a_model_switched_off_in_the_catalogue_is_not_offered(self) -> None:
        offered_ids, lines, total = _available_model_ids_by_env()
        enabled = {model.id for model in list_models() if model.available}
        disabled = {model.id for model in list_models() if not model.available}

        assert total == len(enabled)
        assert offered_ids <= enabled
        # The line the terminal prints names none of the switched-off ones.
        printed = " ".join(lines)
        for model_id in disabled:
            assert model_id not in offered_ids
            assert model_id not in printed

    def test_the_catalogue_has_something_switched_off_to_check_against(self) -> None:
        # Otherwise the test above passes by having nothing to exclude.
        assert any(not model.available for model in list_models())


class TestTerminalConstruction:
    def test_the_terminal_carries_its_prompt_session(self) -> None:
        # The tail of `__init__` once fell inside a property, under its own
        # `return`, so these were never set and the first keystroke raised
        # `'CliTux' object has no attribute 'prompt_session'`.
        tux = CliTux(
            agent_url="http://127.0.0.1:1/agent",
            server_url="http://127.0.0.1:1",
            agent_id="chat",
        )
        assert tux.prompt_session is None  # built on first use, but present
        assert tux.prompt_style is not None

    def test_no_statement_sits_after_a_return_in_the_terminal(self) -> None:
        # How that happened: an insertion split the constructor in two. Dead
        # code after a `return` is the shape of the bug, not just its cause.
        source = (CHAT_DIR / "tux.py").read_text()
        for block in re.findall(
            r"\n        return .*\n((?:        [^\n]*\n|\n)*)", source
        ):
            assert not [
                line
                for line in block.splitlines()
                if line.strip() and not line.strip().startswith("#")
            ], block


class TestWordmark:
    def test_the_terminal_writes_the_loop_with_eyes(self) -> None:
        assert LOOP_WORDMARK == "L\U0001f440P"
        assert LOOP_WORDMARK in BANNER

    def test_the_wordmark_is_written_in_one_place(self) -> None:
        for path in CHAT_DIR.rglob("*.py"):
            assert "LOOP ⟳" not in path.read_text(), path

    def test_the_banner_box_stays_square(self) -> None:
        # The eyes take two terminal columns; the padding beside them counts
        # on it, so a box that lines up is the proof the count is right.
        def columns(line: str) -> int:
            bare = re.sub(r"\x1b\[[0-9;]*m", "", line)
            return sum(2 if ord(char) > 0x1F000 else 1 for char in bare)

        widths = {columns(line) for line in BANNER.strip("\n").splitlines()}
        assert len(widths) == 1, widths


class TestVersionShown:
    def test_the_terminal_shows_the_version_of_the_library_it_is_part_of(self) -> None:
        # It used to show the chat package's own number, frozen at 0.0.2,
        # which said nothing about what was installed.
        assert LOOP_VERSION == agent_runtimes.__version__

    def test_no_version_is_typed_into_a_panel_title(self) -> None:
        for path in CHAT_DIR.rglob("*.py"):
            source = path.read_text()
            assert "0.0.2" not in source, path
            assert "{LOOP_WORDMARK} 0." not in source, path


class TestGoodbye:
    def test_it_keeps_looping_with_the_eyes(self) -> None:
        assert LOOP_WORDMARK_VERB == "L\U0001f440ping"
        assert LOOP_WORDMARK_VERB in GOODBYE_MESSAGE
        assert "\u27f3" not in GOODBYE_MESSAGE
        assert "looping" not in GOODBYE_MESSAGE
        # The bars sit with the name at the end, not in front of the line.
        assert GOODBYE_MESSAGE.startswith("Keep ")
        assert "\u2630 Datalayer!" in GOODBYE_MESSAGE


class TestUsageDirection:
    def test_the_token_counts_say_which_way_they_went(self) -> None:
        assert (TOKENS_UP, TOKENS_DOWN) == ("\u25b2", "\u25bc")
        for name in ("tux.py", "commands/status.py"):
            source = (CHAT_DIR / name).read_text()
            assert "TOKENS_UP" in source and "TOKENS_DOWN" in source, name
            # The words the arrows replaced are gone from the counts.
            assert " in / " not in source, name
            assert " out)" not in source and " out · " not in source, name


class TestShortcuts:
    def test_no_two_commands_claim_the_same_key(self) -> None:
        # Three of them claimed `escape l`, so two were never bound at all
        # and the terminal warned about it on every start.
        tux = CliTux(
            agent_url="http://127.0.0.1:1/agent",
            server_url="http://127.0.0.1:1",
            agent_id="chat",
        )
        claimed: dict[str, list[str]] = {}
        for spec in tux.command_registry:
            shortcut = getattr(spec, "shortcut", None)
            if shortcut:
                claimed.setdefault(shortcut, []).append(spec.name)
        clashes = {key: names for key, names in claimed.items() if len(names) > 1}
        assert not clashes, clashes


class TestQuietTerminal:
    def test_library_logging_stays_out_of_the_conversation(self) -> None:
        import logging

        before = {
            name: logging.getLogger(name).level for name in ("", "httpx", "httpcore")
        }
        try:
            logging.getLogger().setLevel(logging.INFO)
            _quiet_the_logs(debug=False)
            assert logging.getLogger("httpx").getEffectiveLevel() >= logging.ERROR
            assert logging.getLogger().getEffectiveLevel() >= logging.ERROR

            _quiet_the_logs(debug=True)
            assert logging.getLogger().getEffectiveLevel() == logging.DEBUG
        finally:
            for name, level in before.items():
                logging.getLogger(name).setLevel(level)


class TestNoEchoOfItsOwnTurn:
    def test_the_terminal_tells_the_sync_about_the_reply_it_showed(self) -> None:
        # The sync reads the shared history back; a reply this end already
        # printed would otherwise be announced again as news from the browser.
        source = (CHAT_DIR / "tux.py").read_text()
        assert "self.sync.note_local(response_text)" in source
