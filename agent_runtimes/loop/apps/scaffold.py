# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A new application's folder: what ``loop apps init`` writes (LOOP P-01, E-13).

A folder named by the application's id, holding its Appspec, ``app.yaml``,
and — written in Python — the ``app.py`` that is its source, the spec beside
it built from it (`loop apps build`, P-07), so the two agree from the start:

- **blank**: a chat or a widget, its agent the one a blank application starts
  with in the Studio (``example-simple``) — written in Python, the blank
  agent this process builds (``example-blank``, P-32); a worker or a decision says more
  than a name (what starts its work, what it decides), so it starts from an
  example;
- **from an example** of the catalogue (``--from support-desk``): its spec,
  and its ``app.py`` when it was written in Python, under the new id. With
  ``python``, an example written as a spec gets an ``app.py`` holding that spec,
  ready for code.

Beside them, ``tests/test_app.py``: what the folder's CI runs with
``pytest`` (LOOP E-13) — the spec passes the instant checks, each of its
test conversations says what it is asked and what it should do, and, written
in Python, the ``app.py`` still builds the spec committed beside it (E-02).
Its test conversations themselves are asked of a model by a validation run,
on the Validate tab once the application is pushed.

Every folder written is checked as `loop apps validate` checks a file: a
scaffold that would not validate is refused, never written.
"""

from __future__ import annotations

import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import yaml

from agent_runtimes.loop.apps.application import Application
from agent_runtimes.loop.apps.build import build
from agent_runtimes.loop.apps.loading import AppNotRunnable

#: The agentspec a blank application starts with, as in the Studio.
BLANK_AGENT = "example-simple:0.0.1"

#: The agentspec a blank ``app.py`` starts with (LOOP P-32): a model and
#: nothing else — no prompt of its own over the application's instructions,
#: nothing only a runtime brings — so an `AppHost` builds it in this process
#: as a runtime does.
BLANK_PYTHON_AGENT = "example-blank:0.0.1"

#: The kinds a blank application can be: the others say more than a name.
BLANK_KINDS = ("chat", "widget")

SPEC_FILE = "app.yaml"
PYTHON_FILE = "app.py"
TESTS_FILE = "tests/test_app.py"

_TOP_ID = re.compile(r"^id: (?P<id>\S+)$", re.MULTILINE)


class InitRefused(ValueError):
    """Why a folder was not written, in a sentence."""


@dataclass(frozen=True)
class Scaffold:
    """What `init` wrote."""

    folder: Path
    files: List[str]
    example: Optional[str] = None


def catalogue() -> Path:
    """The folder of agentspecs' application examples."""
    from agentspecs import apps as module

    return Path(module.__file__).parent


def examples() -> List[str]:
    """The ids of the catalogue's examples, sorted."""
    return sorted(
        path.stem
        for path in catalogue().glob("*.yaml")
        if _TOP_ID.search(path.read_text())
    )


def spec_problems(path: Path) -> List[str]:
    """What the schema and the catalogue refuse in an Appspec file, as `validate` says it."""
    from agentspecs import apps as module

    try:
        return list(
            module.app_problems(module.parse_app(yaml.safe_load(path.read_text())))
        )
    except module.AppError as error:
        return [str(error)]


def _blank_python(app_id: str, kind: str) -> str:
    """The ``app.py`` of a blank application: its agent answers each message."""
    return f'''"""{app_id}: an application written in Python.

Written by `loop apps init`. This file is the application's source:

    loop apps run app.py --watch            # here, rebuilt on every change
    loop apps build app.py --out app.yaml   # its Appspec, after a change
    loop apps validate app.py               # the instant checks
"""

from agent_runtimes.loop.apps import Application, Session

app = Application(id="{app_id}", kind="{kind}", agent="{BLANK_PYTHON_AGENT}")
app.starter("Say hello", "Hello! What can you do?")


@app.message
async def reply(session: Session, text: str) -> None:
    async with session.step("Answering", kind="model", input=text) as step:
        answer = await session.agent.run(text)
        step.output = answer.text
    await session.send(answer.text)
'''


def _python_of_spec(
    text: str, app_id: str, example: str, *, by: str = "loop apps init"
) -> str:
    """An ``app.py`` holding a spec — an example's, or one ejected — ready for code."""
    origin = (
        f"the `{example}` example"
        if by == "loop apps init"
        else f"`{example}`, its spec until then"
    )
    if '"""' in text or "\\" in text:
        raise InitRefused(
            f"{origin[0].upper()}{origin[1:]} cannot be held in an app.py as it is written."
        )
    return f'''"""{app_id}: an application written in Python.

Written by `{by}` from {origin}, written as a spec:
its spec is held below, ready for code; with no reaction of its own, its agent
answers. This file is the application's source:

    loop apps run app.py --watch            # here, rebuilt on every change
    loop apps build app.py --out app.yaml   # its Appspec, after a change
    loop apps validate app.py               # the instant checks
"""

import yaml

from agent_runtimes.loop.apps import Application

SPEC = """\\
{text}"""

app = Application.from_spec(yaml.safe_load(SPEC))
'''


def _tests(app_id: str, python: bool) -> str:
    """The folder's ``tests/test_app.py``: what its CI runs with ``pytest``."""
    built = (
        f'''

def test_app_py_builds_the_spec_committed_beside_it() -> None:
    # The app.py is the source: after a change, `loop apps build app.py --out app.yaml`.
    assert build(FOLDER / "{PYTHON_FILE}").text == SPEC.read_text()
'''
        if python
        else ""
    )
    imports = "\nfrom agent_runtimes.loop.apps.build import build\n" if python else ""
    return f'''"""{app_id}: the checks its CI runs, `pytest tests` (written by `loop apps init`).

The instant checks of its spec, and that each of its test conversations says
what it is asked and what it should do. The conversations themselves are
asked of a model by a validation run: `loop apps push {SPEC_FILE}`, then
*Run its tests* on its Validate tab. The safety set every application
answers: `loop apps validate {SPEC_FILE} --safety --local`.
"""

from pathlib import Path

import yaml
from agentspecs.apps import app_problems, parse_app
{imports}
FOLDER = Path(__file__).resolve().parent.parent
SPEC = FOLDER / "{SPEC_FILE}"


def test_the_spec_passes_the_instant_checks() -> None:
    assert app_problems(parse_app(yaml.safe_load(SPEC.read_text()))) == []


def test_each_test_conversation_says_what_it_is_asked_and_what_it_should_do() -> None:
    for case in parse_app(yaml.safe_load(SPEC.read_text())).tests.cases:
        assert case.ask.strip() and case.expect.strip(), case
{built}'''


def _with_tests(folder: Path, app_id: str, files: List[str]) -> List[str]:
    """The files written, and the folder's tests beside them."""
    (folder / TESTS_FILE).parent.mkdir()
    (folder / TESTS_FILE).write_text(_tests(app_id, PYTHON_FILE in files))
    return [*files, TESTS_FILE]


def _renamed(text: str, old: str, new: str, said: str) -> str:
    """The text with the example's id, said once as ``said`` says it, renamed."""
    renamed, count = re.subn(re.escape(said.format(old)), said.format(new), text)
    if count != 1:
        raise InitRefused(
            f"The `{old}` example does not say its id once; it cannot be renamed."
        )
    return renamed


def _write_python(folder: Path, source: str) -> List[str]:
    """Write an ``app.py`` and the Appspec it builds beside it."""
    (folder / PYTHON_FILE).write_text(source)
    built = build(folder / PYTHON_FILE)
    (folder / SPEC_FILE).write_text(built.text)
    return [PYTHON_FILE, SPEC_FILE]


def _blank(folder: Path, app_id: str, kind: str, python: bool) -> List[str]:
    """Write a blank chat or widget; refuse a kind that says more than a name."""
    if kind not in BLANK_KINDS:
        raise InitRefused(
            f"A {kind} says more than a name — "
            + (
                "what starts its work and its goal"
                if kind == "worker"
                else "what it decides"
            )
            + ": start from an example with --from."
        )
    if python:
        return _write_python(folder, _blank_python(app_id, kind))
    application = Application(id=app_id, kind=kind, agent=BLANK_AGENT)
    application.starter("Say hello", "Hello! What can you do?")
    body = yaml.safe_dump(
        application.document,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    (folder / SPEC_FILE).write_text(
        "# Written by `loop apps init`: its Appspec, reviewed like code.\n" + body
    )
    return [SPEC_FILE]


def _from_example(folder: Path, app_id: str, example: str, python: bool) -> List[str]:
    """Write an example of the catalogue under the new id."""
    if example not in examples():
        raise InitRefused(
            f"There is no example `{example}`; the examples are "
            + ", ".join(examples())
            + "."
        )
    spec = catalogue() / f"{example}.yaml"
    code = catalogue() / example / PYTHON_FILE
    if code.is_file():
        return _write_python(
            folder, _renamed(code.read_text(), example, app_id, '"id": "{}"')
        )
    text = _renamed(spec.read_text(), example, app_id, "\nid: {}\n")
    if python:
        return _write_python(folder, _python_of_spec(text, app_id, example))
    (folder / SPEC_FILE).write_text(
        f"# Written by `loop apps init` from the `{example}` example.\n" + text
    )
    return [SPEC_FILE]


#: What ejecting does, said before it is done (LOOP P-13).
EJECT_SAID = (
    "Ejecting is one way: {file} becomes the source of {name}. From then on "
    "its spec is built from the file — push the file, not the spec — and "
    "the Studio shows its code in the Python tab, what the code decides "
    "locked on the Canvas. Its versions so far are kept."
)


def eject(spec_path: Path, out: Optional[Path] = None, *, force: bool = False) -> Path:
    """Write an application built by spec or on the Canvas as an ``app.py`` (LOOP P-13).

    The file holds the spec and builds it again, the same: checked before it
    is written, and refused otherwise.

    Parameters
    ----------
    spec_path : Path
        The application's Appspec (``loop apps pull`` writes it).
    out : Path, optional
        The file written; ``app.py`` beside the spec when unsaid.
    force : bool
        Overwrite a file that is there.

    Returns
    -------
    Path
        The file written.

    Raises
    ------
    InitRefused
        For a file that is not an application's spec, one that does not
        validate, a file there already, or a spec the file would not build
        the same.
    """
    text = spec_path.read_text()
    loaded = yaml.safe_load(text)
    if not isinstance(loaded, dict) or not isinstance(loaded.get("id"), str):
        raise InitRefused(f"{spec_path} is not an application's spec.")
    problems = spec_problems(spec_path)
    if problems:
        raise InitRefused(" ".join(problems))
    target = out or spec_path.with_name(PYTHON_FILE)
    if target.exists() and not force:
        raise InitRefused(f"{target} is there already; --force overwrites it.")
    source = _python_of_spec(text, loaded["id"], spec_path.name, by="loop apps eject")
    with tempfile.TemporaryDirectory() as scratch:
        staged = Path(scratch) / target.name
        staged.write_text(source)
        try:
            built = build(staged)
        except AppNotRunnable as refused:
            raise InitRefused(" ".join(refused.problems)) from None
    if built.document != loaded:
        raise InitRefused(
            f"The app.py written from {spec_path} would not build the same spec: "
            "nothing was written."
        )
    target.write_text(source)
    return target


@dataclass(frozen=True)
class Ejected:
    """An application ejected where no file is kept (LOOP P-13): its text."""

    code: str
    """The ``app.py`` that holds its spec, ready for code."""

    spec: str
    """The Appspec that file builds, as `loop apps build` writes it."""


def eject_text(spec: str) -> Ejected:
    """`eject`, on an Appspec's text rather than a file: what the Studio asks.

    The spec is written in a scratch folder and ejected there, checked as
    `eject` checks it; nothing is kept on this machine.

    Parameters
    ----------
    spec : str
        The application's Appspec, as YAML.

    Returns
    -------
    Ejected
        Its ``app.py``, and the spec that file builds.

    Raises
    ------
    InitRefused
        As `eject` refuses.
    """
    with tempfile.TemporaryDirectory() as scratch:
        spec_path = Path(scratch) / SPEC_FILE
        spec_path.write_text(spec)
        code = eject(spec_path)
        built = build(code)
        return Ejected(code=code.read_text(), spec=built.text)


def init(
    app_id: str,
    where: Path,
    *,
    kind: str = "chat",
    example: Optional[str] = None,
    python: bool = False,
) -> Scaffold:
    """Write a new application's folder, ``where / app_id``.

    Parameters
    ----------
    app_id : str
        The application's id, and its folder's name.
    where : Path
        The folder it is written in.
    kind : str
        A blank application's kind: ``chat`` or ``widget``.
    example : str or None
        The example of the catalogue it starts from.
    python : bool
        Written in Python: an ``app.py`` beside its spec.

    Returns
    -------
    Scaffold
        The folder and the files written.

    Raises
    ------
    InitRefused
        When the folder is there, the kind needs an example, the example is
        not known, or what would be written does not validate.
    """
    folder = where / app_id
    if folder.exists():
        raise InitRefused(f"{folder} is there already: init writes a new folder.")
    with tempfile.TemporaryDirectory() as scratch:
        staged = Path(scratch) / app_id
        staged.mkdir()
        try:
            files = (
                _from_example(staged, app_id, example, python)
                if example
                else _blank(staged, app_id, kind, python)
            )
        except AppNotRunnable as refused:
            raise InitRefused(" ".join(refused.problems)) from None
        files = _with_tests(staged, app_id, files)
        problems = spec_problems(staged / SPEC_FILE)
        if problems:
            raise InitRefused(" ".join(problems))
        shutil.copytree(staged, folder)
    return Scaffold(folder, files, example)
