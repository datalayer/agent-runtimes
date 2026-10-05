# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps init`: a new application's folder (LOOP P-01)."""

import asyncio
from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel
from typer.testing import CliRunner

from agent_runtimes.commands.apps import PASSES, app, validate_file
from agent_runtimes.loop.apps import AppHost, MemoryChannel, load_application
from agent_runtimes.loop.apps.build import build, read_code_marks
from agent_runtimes.loop.apps.scaffold import (
    BLANK_AGENT,
    InitRefused,
    examples,
    init,
)

pytest.importorskip("agentspecs.apps")

runner = CliRunner()


def _spec(folder: Path) -> Any:
    return yaml.safe_load((folder / "app.yaml").read_text())


def test_a_blank_chat_is_a_spec_that_passes_the_instant_checks(tmp_path: Path) -> None:
    written = init("my-app", tmp_path)
    assert written.files == ["app.yaml"]
    assert written.folder == tmp_path / "my-app"
    spec = _spec(written.folder)
    assert (spec["id"], spec["kind"], spec["agent"]) == ("my-app", "chat", BLANK_AGENT)
    assert validate_file(written.folder / "app.yaml").verdict == PASSES


def test_a_blank_python_application_builds_its_spec_and_answers_through_its_agent(
    tmp_path: Path,
) -> None:
    written = init("my-widget", tmp_path, kind="widget", python=True)
    assert written.files == ["app.py", "app.yaml"]
    text = (written.folder / "app.yaml").read_text()
    assert text == build(written.folder / "app.py").text
    assert [mark.moment for mark in read_code_marks(text)] == ["message"]
    assert _spec(written.folder)["kind"] == "widget"

    async def scenario() -> None:
        channel = MemoryChannel()
        host = AppHost(
            load_application(written.folder / "app.py"),
            channel,
            agent=lambda spec: Agent(TestModel(custom_output_text="Hello there.")),
        )
        session = await host.open(user="ada")
        await host.message(session, "Hello")
        assert channel.messages[-1].text == "Hello there."

    asyncio.run(scenario())


@pytest.mark.parametrize("kind", ["worker", "decision"])
def test_a_blank_worker_or_decision_is_refused_in_a_sentence(
    tmp_path: Path, kind: str
) -> None:
    with pytest.raises(InitRefused, match="start from an example with --from"):
        init("mine", tmp_path, kind=kind)
    assert not (tmp_path / "mine").exists()


def test_a_folder_that_is_there_is_never_overwritten(tmp_path: Path) -> None:
    (tmp_path / "mine").mkdir()
    (tmp_path / "mine" / "app.yaml").write_text("kept")
    with pytest.raises(InitRefused, match="is there already"):
        init("mine", tmp_path)
    assert (tmp_path / "mine" / "app.yaml").read_text() == "kept"


def test_an_unknown_example_is_refused_with_the_examples(tmp_path: Path) -> None:
    with pytest.raises(InitRefused, match="support-desk"):
        init("mine", tmp_path, example="nope")


def test_an_id_the_spec_refuses_writes_nothing(tmp_path: Path) -> None:
    with pytest.raises(InitRefused):
        init("Not An Id", tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("python", [False, True])
@pytest.mark.parametrize("example", examples())
def test_every_example_starts_an_application_under_the_new_id(
    tmp_path: Path, example: str, python: bool
) -> None:
    written = init("mine", tmp_path, example=example, python=python)
    has_code = (written.folder / "app.py").exists()
    assert has_code == (
        python or example in ("customer-interview", "report-from-a-file")
    )
    spec = _spec(written.folder)
    assert spec["id"] == "mine"
    if has_code:
        assert (written.folder / "app.yaml").read_text() == build(
            written.folder / "app.py"
        ).text
    assert validate_file(written.folder / "app.yaml").verdict != "Not ready"


def test_the_command_writes_the_folder_and_lists_the_examples(tmp_path: Path) -> None:
    result = runner.invoke(
        app, ["init", "desk", "--from", "support-desk", "--dir", str(tmp_path)]
    )
    assert result.exit_code == 0, result.output
    assert "desk written to" in result.output
    assert "from the support-desk example" in result.output
    assert _spec(tmp_path / "desk")["id"] == "desk"

    again = runner.invoke(app, ["init", "desk", "--dir", str(tmp_path)])
    assert again.exit_code == 1
    assert "is there already" in again.output

    unnamed = runner.invoke(app, ["init", "--dir", str(tmp_path)])
    assert unnamed.exit_code == 1
    assert "Name the application" in unnamed.output

    listed = runner.invoke(app, ["init", "--examples"])
    assert listed.exit_code == 0
    assert listed.output.split() == examples()
