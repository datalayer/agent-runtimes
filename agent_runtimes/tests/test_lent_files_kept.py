# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The folder's own instructions file is kept (VSCODE VS-23, SHIELD SH-21).

A person's ``CLAUDE.md`` — one Datalayer did not write — is never written
over: the application's instructions go beside it (``.datalayer/CLAUDE.md``,
read-only), reach the harness ahead of the session's first prompt, and the
session's first line says so. A file Datalayer wrote (its first line is the
mark) is written again in place, as before.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from agent_runtimes.adapters.harness_skills import (
    LENT_DIR,
    LENT_MARK,
    kept_said,
    write_lent_files,
)

from .test_acp_agent import (  # noqa: F401 — the workspace fixture
    an_agent,
    an_app,
    of,
    reading_skills,
    texts,
    turn,
    workspace,
)


class TestTheFoldersOwnInstructionsFileIsKept:
    def test_a_file_datalayer_did_not_write_is_kept_and_the_instructions_go_beside(
        self, tmp_path: Path
    ) -> None:
        own = tmp_path / "CLAUDE.md"
        own.write_text("# Mine\n\nNever touch this.\n", encoding="utf-8")
        harness = reading_skills()
        lent = write_lent_files(tmp_path, harness, an_app(), ["earthdata"])
        assert own.read_text(encoding="utf-8") == "# Mine\n\nNever touch this.\n"
        assert lent.kept == own
        assert lent.instructions == tmp_path / LENT_DIR / "CLAUDE.md"
        beside = lent.instructions.read_text(encoding="utf-8")
        assert beside.startswith(LENT_MARK + "\n# Coder\n")
        assert "Be brief. Never touch the tests." in beside
        assert (lent.instructions.stat().st_mode & 0o777) == 0o444
        # The lent file is read-only to the agent; the person's own is not.
        assert lent.protects(lent.instructions)
        assert not lent.protects(own)
        assert lent.preface() == beside
        said = kept_said(lent, harness, tmp_path)
        assert said == (
            "Your CLAUDE.md is kept as it is: Fake agent reads it as its own. The "
            "application's instructions were written beside it, as .datalayer/CLAUDE.md, "
            "and go to Fake agent ahead of this session's first prompt."
        )
        # Written again, the person's file is still untouched.
        write_lent_files(tmp_path, harness, an_app(instructions="Terse."))
        assert own.read_text(encoding="utf-8") == "# Mine\n\nNever touch this.\n"
        assert "Terse." in lent.instructions.read_text(encoding="utf-8")

    def test_a_file_datalayer_wrote_is_written_again_in_place(
        self, tmp_path: Path
    ) -> None:
        harness = reading_skills()
        first = write_lent_files(tmp_path, harness, an_app())
        assert first.kept is None
        assert first.instructions == tmp_path / "CLAUDE.md"
        assert first.preface() == ""
        assert kept_said(first, harness, tmp_path) == ""
        again = write_lent_files(tmp_path, harness, an_app(instructions="Terse."))
        assert again.kept is None and again.instructions == tmp_path / "CLAUDE.md"
        assert "Terse." in (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
        assert not (tmp_path / LENT_DIR).exists()

    @pytest.mark.asyncio
    async def test_the_harness_is_handed_the_instructions_with_its_first_prompt(
        self, workspace: Path
    ) -> None:
        own = workspace / "CLAUDE.md"
        own.write_text("# Mine\n\nNever touch this.\n", encoding="utf-8")
        harness = reading_skills()
        lent = write_lent_files(workspace, harness, an_app())
        agent = an_agent(workspace, harness=harness, lent_files=lent)
        try:
            first = await turn(agent, "read CLAUDE.md")
            second = await turn(agent, "read .datalayer/CLAUDE.md")
            refused = await turn(agent, "write .datalayer/CLAUDE.md")
        finally:
            await agent.cleanup()
        said = texts(first)
        # The first line says what was kept, before anything else.
        assert said.index("Your CLAUDE.md is kept as it is") < said.index(
            "instructions:"
        )
        # The instructions went ahead of the first prompt, once: the fake
        # says their first line back, and reads the person's own file.
        assert f"instructions: {LENT_MARK}" in said
        assert "# Mine" in str(of(first, "tool_result"))
        assert "instructions:" not in texts(second)
        assert LENT_MARK[:40] in str(of(second, "tool_result"))
        assert "read-only to the agent" in texts(refused)
        assert own.read_text(encoding="utf-8") == "# Mine\n\nNever touch this.\n"
