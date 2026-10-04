# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps build` and `loop apps run app.py` (LOOP P-07, P-08, P-09)."""

import asyncio
import os
from pathlib import Path
from typing import Any, List

import pytest
import yaml
from rich.console import Console
from typer.testing import CliRunner

from agent_runtimes.commands import apps as commands
from agent_runtimes.commands.apps import NOT_READY, PASSES, app, validate_file
from agent_runtimes.loop.apps import Application
from agent_runtimes.loop.apps.build import (
    CodeMark,
    build,
    read_code_marks,
)
from agent_runtimes.loop.apps.loading import AppNotRunnable, load_app
from agent_runtimes.loop.apps.session import ChoiceQuestion, FormQuestion
from agent_runtimes.loop.apps.terminal import AppTux, TerminalChannel, ask_once
from agent_runtimes.types import AppSettingSpec

pytest.importorskip("agentspecs.apps")

runner = CliRunner()

APP_PY = """\
from agent_runtimes.loop.apps import Application, Session

app = Application(id="interview", kind="chat", agent="cog-crawler:0.0.1")
app.starter("Onboarding", "Interview me about my onboarding.")
app.rule("send the summary", applies_to="send", behaviour="ask_first")


@app.start
async def opening(session: Session) -> None:
    session.state["turns"] = 0
    await session.send("What do you want to learn?")


@app.message
async def reply(session: Session, text: str) -> None:
    session.state["turns"] += 1
    await session.send(f"{VERSION} heard {text} ({session.state['turns']})")


@app.action("save")
def save(session: Session, payload: dict) -> None:
    session.state["saved"] = payload

VERSION = "v1"
"""


def write(tmp_path: Path, text: str = APP_PY, name: str = "app.py") -> Path:
    path = tmp_path / name
    path.write_text(text)
    return path


# --- build (P-07) -----------------------------------------------------------------


def test_build_writes_the_spec_the_file_amounts_to_with_its_code_marked(
    tmp_path: Path,
) -> None:
    built = build(write(tmp_path))
    document = yaml.safe_load(built.text)
    assert document == built.document
    assert load_app(document).id == "interview"
    assert document["interface"]["starters"][0]["label"] == "Onboarding"
    assert (
        read_code_marks(built.text)
        == built.marks
        == [
            CodeMark("start", "opening", "app.py:8"),
            CodeMark("message", "reply", "app.py:14"),
            CodeMark("action save", "save", "app.py:20"),
        ]
    )
    assert "# loop:code message: reply (app.py:14)" in built.text.splitlines()


def test_the_command_prints_it_or_writes_it(tmp_path: Path) -> None:
    path = write(tmp_path)
    printed = runner.invoke(app, ["build", str(path)])
    assert printed.exit_code == 0, printed.output
    assert yaml.safe_load(printed.output)["id"] == "interview"
    out = tmp_path / "app.yaml"
    written = runner.invoke(app, ["build", str(path), "--out", str(out)])
    assert written.exit_code == 0, written.output
    assert "its code decides 3 things" in written.output
    assert read_code_marks(out.read_text())
    again = runner.invoke(app, ["build", str(path), "--out", str(out)])
    assert again.exit_code == 1 and "--force" in again.output
    assert (
        runner.invoke(app, ["build", str(path), "-o", str(out), "--force"]).exit_code
        == 0
    )


def test_a_workers_schedule_is_marked_as_code(tmp_path: Path) -> None:
    built = build(
        write(
            tmp_path,
            "from agent_runtimes.loop.apps import Application\n"
            "app = Application(id='triage', kind='worker', agent='cog-crawler:0.0.1',\n"
            "                  goal='Sort the inbox.')\n"
            "@app.schedule('0 8 * * *', description='Every morning')\n"
            "def digest(session):\n"
            "    pass\n",
        )
    )
    assert built.document["triggers"][0]["cron"] == "0 8 * * *"
    assert built.marks == [CodeMark("schedule digest", "digest", "app.py:4")]


def test_code_that_decides_nothing_is_said_so(tmp_path: Path) -> None:
    built = build(
        write(
            tmp_path,
            "from agent_runtimes.loop.apps import Application\n"
            "app = Application(id='plain', kind='chat', agent='cog-crawler:0.0.1')\n",
        )
    )
    assert built.marks == []
    assert "Its code decides nothing" in built.text


@pytest.mark.parametrize(
    ("text", "said"),
    [
        ("x = 1\n", "defines 0 applications; it has to define one"),
        (
            "from agent_runtimes.loop.apps import Application\n"
            "a = Application(id='a', agent='cog-crawler:0.0.1')\n"
            "b = Application(id='b', agent='cog-crawler:0.0.1')\n",
            "defines 2 applications; it has to define one",
        ),
        ("def broken(:\n", "app.py does not load: SyntaxError"),
        (
            "raise RuntimeError('no key')\n",
            "app.py does not load: RuntimeError: no key",
        ),
    ],
)
def test_build_refuses_with_a_sentence(tmp_path: Path, text: str, said: str) -> None:
    path = write(tmp_path, text)
    with pytest.raises(AppNotRunnable, match=said.replace("(", r"\(")):
        build(path)
    result = runner.invoke(app, ["build", str(path)])
    assert result.exit_code == 1
    assert said in result.output


def test_build_refuses_a_spec_that_does_not_validate(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        "from agent_runtimes.loop.apps import Application\n"
        "app = Application(id='lost', kind='chat', agent='no-such-agent:9.9.9')\n",
    )
    with pytest.raises(AppNotRunnable) as refused:
        build(path)
    result = runner.invoke(app, ["build", str(path)])
    assert result.exit_code == 1
    assert refused.value.problems[0] in result.output


def test_a_spec_is_not_built(tmp_path: Path) -> None:
    path = write(tmp_path, "id: x\n", name="app.yaml")
    result = runner.invoke(app, ["build", str(path)])
    assert result.exit_code == 1 and "is not an app.py" in result.output


# --- validate and push take an app.py (P-09) -------------------------------------


def test_validate_builds_an_app_py_first(tmp_path: Path) -> None:
    good = validate_file(write(tmp_path))
    assert good.verdict != NOT_READY, good.problems
    bad = validate_file(write(tmp_path, "x = 1\n", name="empty.py"))
    assert bad.verdict == NOT_READY
    assert "defines 0 applications" in bad.problems[0]
    plain = write(
        tmp_path,
        "from agent_runtimes.loop.apps import Application\n"
        "app = Application(id='plain', kind='chat', agent='cog-crawler:0.0.1')\n"
        "app.connection('tavily:0.0.1')\n",
        name="plain.py",
    )
    assert validate_file(plain).verdict == PASSES


def test_push_saves_the_built_spec(tmp_path: Path, monkeypatch) -> None:
    saved: List[str] = []
    monkeypatch.setattr(commands, "_store", lambda: object())
    monkeypatch.setattr(
        "agent_runtimes.loop.apps.store.push",
        lambda store, uid, text: (saved.append(text) or 3, "saved"),
    )
    result = runner.invoke(app, ["push", str(write(tmp_path)), "--app", "app-1"])
    assert result.exit_code == 0, result.output
    assert read_code_marks(saved[0]) and yaml.safe_load(saved[0])["id"] == "interview"


# --- run (P-08) ------------------------------------------------------------------


class _Process:
    def terminate(self) -> None:
        pass

    def join(self, timeout: float) -> None:
        pass


@pytest.fixture
def local_server(monkeypatch) -> List[Any]:
    """`run` with the server, the runtime and the renderer stood in for."""
    calls: List[Any] = []
    monkeypatch.setattr(
        "agent_runtimes.chat.cli._start_agent_runtime_server",
        lambda agent: (_Process(), 4321),
    )
    monkeypatch.setattr(
        "agent_runtimes.chat.cli._wait_for_server", lambda *a, **k: True
    )
    monkeypatch.setattr("agent_runtimes.loop.launch.speak_ag_ui", lambda url: True)
    monkeypatch.setattr(
        commands,
        "configure_on",
        lambda url, document: calls.append(("configure", url, document)) or {},
    )

    async def run_app_tux(application: Any, **kwargs: Any) -> None:
        calls.append(("tux", application, kwargs))

    async def run_tux(*args: Any, **kwargs: Any) -> None:
        calls.append(("plain tux", args, kwargs))

    monkeypatch.setattr("agent_runtimes.loop.apps.terminal.run_app_tux", run_app_tux)
    monkeypatch.setattr("agent_runtimes.chat.tux.run_tux", run_tux)
    return calls


def test_run_builds_an_app_py_and_runs_its_code_in_the_renderer(
    tmp_path: Path, local_server: List[Any]
) -> None:
    result = runner.invoke(app, ["run", str(write(tmp_path)), "--local"])
    assert result.exit_code == 0, result.output
    (configure, tux) = local_server
    assert configure[0] == "configure" and configure[1] == "http://127.0.0.1:4321"
    assert configure[2]["id"] == "interview"
    assert tux[0] == "tux" and isinstance(tux[1], Application)
    assert tux[1].handler("message").__name__ == "reply"
    assert tux[2]["extra_suggestions"] == ["Interview me about my onboarding."]
    assert tux[2]["reload"] is None


def test_a_spec_runs_as_before_and_watches_when_asked(
    tmp_path: Path, local_server: List[Any]
) -> None:
    spec = tmp_path / "app.yaml"
    spec.write_text(build(write(tmp_path)).text)
    assert runner.invoke(app, ["run", str(spec), "--local"]).exit_code == 0
    assert local_server[-1][0] == "plain tux"
    assert runner.invoke(app, ["run", str(spec), "--local", "--watch"]).exit_code == 0
    assert local_server[-1][0] == "tux" and callable(local_server[-1][2]["reload"])


def test_run_refuses_an_app_py_that_does_not_build(
    tmp_path: Path, local_server: List[Any]
) -> None:
    result = runner.invoke(app, ["run", str(write(tmp_path, "x = 1\n")), "--local"])
    assert result.exit_code == 1
    assert "defines 0 applications" in result.output
    assert local_server == []


def test_the_watcher_rebuilds_and_reconfigures_on_a_change(
    tmp_path: Path, monkeypatch
) -> None:
    configured: List[Any] = []
    monkeypatch.setattr(
        commands, "configure_on", lambda url, document: configured.append(document)
    )
    path = write(tmp_path)
    reload = commands._watcher(path, "http://runtime")
    assert reload() is None
    path.write_text(APP_PY.replace('"v1"', '"v2"'))
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 5))
    rebuilt = reload()
    assert isinstance(rebuilt, Application) and configured[0]["id"] == "interview"
    assert reload() is None
    path.write_text("x = 1\n")
    os.utime(path, (stat.st_atime, stat.st_mtime + 10))
    with pytest.raises(AppNotRunnable, match="defines 0 applications"):
        reload()


# --- the terminal: the code in process ---------------------------------------------


def _console() -> Console:
    return Console(record=True, width=200, force_terminal=False)


def test_ask_once_runs_start_then_message(tmp_path: Path) -> None:
    console = _console()
    asyncio.run(ask_once(build(write(tmp_path)).application, "hello", console))
    said = console.export_text()
    assert "What do you want to learn?" in said
    assert "v1 heard hello (1)" in said


def test_the_terminal_channel_asks_at_the_prompt() -> None:
    answers = iter(["2", "warm", ""])
    channel = TerminalChannel(_console(), read=lambda prompt: next(answers))
    choice = asyncio.run(channel.ask("s", ChoiceQuestion("Which?", ("a", "b"))))
    assert choice == "b"
    form = asyncio.run(
        channel.ask(
            "s",
            FormQuestion(
                "Settings",
                (
                    AppSettingSpec(
                        id="tone", type="select", label="Tone", options=["warm", "dry"]
                    ),
                    AppSettingSpec(id="note", type="text", label="Note"),
                ),
            ),
        )
    )
    assert form == {"tone": "warm"}


def test_the_renderer_routes_to_the_code_and_reloads_with_the_state(
    tmp_path: Path,
) -> None:
    path = write(tmp_path)
    rebuilt: List[Any] = []
    tux = AppTux(
        build(path).application,
        reload=lambda: rebuilt.pop() if rebuilt else None,
        agent_url="http://runtime/api/v1/ag-ui/default/",
        server_url="http://runtime",
        agent_id="default",
    )
    tux.console = tux.channel.console = _console()

    async def go() -> None:
        async def prompt(self: Any) -> str:
            return "hello"

        # The first prompt opens the session: the code's start runs.
        original = AppTux.__mro__[1].show_prompt
        AppTux.__mro__[1].show_prompt = prompt
        try:
            assert await tux.show_prompt() == "hello"
            await tux.send_message("hello")
            assert await tux.handle_command('/action save {"a": 1}') is None
            path.write_text(APP_PY.replace('"v1"', '"v2"'))
            rebuilt.append(build(path).application)
            await tux.show_prompt()
            await tux.send_message("again")
        finally:
            AppTux.__mro__[1].show_prompt = original

    asyncio.run(go())
    said = tux.console.export_text()
    assert "What do you want to learn?" in said
    assert "v1 heard hello (1)" in said
    assert "rebuilt" in said
    # The session went on, its state kept, through the new code.
    assert "v2 heard again (2)" in said
    assert tux.app_session is not None
    assert tux.app_session.state["saved"] == {"a": 1}
