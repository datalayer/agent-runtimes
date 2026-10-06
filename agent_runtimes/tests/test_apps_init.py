# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps init`: a new application's folder (LOOP P-01)."""

import asyncio
import subprocess
import sys
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
    assert written.files == ["app.yaml", "tests/test_app.py"]
    assert written.folder == tmp_path / "my-app"
    spec = _spec(written.folder)
    assert (spec["id"], spec["kind"], spec["agent"]) == ("my-app", "chat", BLANK_AGENT)
    assert validate_file(written.folder / "app.yaml").verdict == PASSES


def test_a_blank_python_application_builds_its_spec_and_answers_through_its_agent(
    tmp_path: Path,
) -> None:
    written = init("my-widget", tmp_path, kind="widget", python=True)
    assert written.files == ["app.py", "app.yaml", "tests/test_app.py"]
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


@pytest.mark.parametrize(
    ("example", "python", "checks"),
    [(None, False, 2), ("support-desk", False, 2), ("report-from-a-file", False, 3)],
)
def test_the_folder_s_own_tests_pass_as_written(
    tmp_path: Path, example: Any, python: bool, checks: int
) -> None:
    # LOOP E-13: a starting repository, its CI's checks passing from the start.
    written = init("mine", tmp_path, example=example, python=python)
    assert "tests/test_app.py" in written.files
    ran = subprocess.run(  # noqa: S603  # nosec B603 - this interpreter, a fixed command
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"],
        cwd=written.folder,
        capture_output=True,
        text=True,
        check=False,
    )
    assert ran.returncode == 0, ran.stdout + ran.stderr
    assert f"{checks} passed" in ran.stdout


# --- P-13: eject ------------------------------------------------------------------


def test_eject_writes_an_app_py_that_builds_the_same_spec(tmp_path: Path) -> None:
    from agent_runtimes.loop.apps.scaffold import eject

    written = init("desk", tmp_path, example="support-desk")
    spec_path = written.folder / "app.yaml"
    code = eject(spec_path)
    assert code == written.folder / "app.py"
    assert "Written by `loop apps eject` from `app.yaml`" in code.read_text()
    assert build(code).document == yaml.safe_load(spec_path.read_text())
    application = load_application(code)
    assert application.spec.id == "desk"
    # Never over a file that is there, unless asked.
    with pytest.raises(InitRefused, match="is there already"):
        eject(spec_path)
    assert eject(spec_path, force=True) == code


def test_eject_refuses_what_is_not_a_spec_that_validates(tmp_path: Path) -> None:
    from agent_runtimes.loop.apps.scaffold import eject

    stray = tmp_path / "notes.yaml"
    stray.write_text("- a list\n")
    with pytest.raises(InitRefused, match="is not an application's spec"):
        eject(stray)
    held = tmp_path / "held.yaml"
    held.write_text('schema: loop.app/v1\nid: held\nname: "A \\\\ B"\nkind: chat\n')
    with pytest.raises(InitRefused):
        eject(held)
    assert not (tmp_path / "app.py").exists()


def test_the_command_says_eject_is_one_way_and_asks(tmp_path: Path) -> None:
    written = init("desk", tmp_path, example="support-desk")
    spec_path = written.folder / "app.yaml"
    # Not a terminal and no yes: said, and nothing is written.
    refused = runner.invoke(app, ["eject", str(spec_path)])
    assert refused.exit_code == 1
    assert "Ejecting is one way" in refused.output
    assert "Not without a yes" in refused.output
    assert not (written.folder / "app.py").exists()
    done = runner.invoke(app, ["eject", str(spec_path), "--yes"])
    assert done.exit_code == 0, done.output
    assert "Its versions so far are kept." in done.output
    assert (written.folder / "app.py").exists()
    assert "loop apps push app.py --app" in done.output
