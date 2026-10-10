# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An ``app.py`` to its Appspec: what ``loop apps build`` writes (LOOP P-07).

The Appspec a file amounts to is `Application.spec`, as YAML. What the code
decides — a reaction the spec cannot say in its fields — is marked as code in
the spec, in comments the YAML keeps and a reader sees::

    # Built from app.py by `loop apps build`: the file is the source; edit it there.
    # loop:code start: opening (app.py:14)
    # loop:code message: reply (app.py:18)
    # loop:code action save: save (app.py:23)
    # loop:code tool lookup_order: lookup_order (app.py:30)

A spec forbids fields it does not define, so the marks are comments: the same
file validates, is pushed and is deployed as any Appspec is, and a spec without
its file runs with its agent answering, as if it had no code.

`build` refuses with a sentence: a file that does not load, one that defines
no `Application` or more than one, and a spec that does not validate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Union

from agent_runtimes.loop.apps.application import EVENTS, Application, load_application
from agent_runtimes.loop.apps.loading import AppNotRunnable

#: The prefix of a line that marks what the code decides.
CODE_MARK = "# loop:code "

_MARK = re.compile(
    r"^# loop:code (?P<moment>[^:]+): (?P<handler>\S+) \((?P<where>[^)]*)\)"
)


@dataclass(frozen=True)
class CodeMark:
    """One thing the code decides: a moment, and the handler that decides it."""

    moment: str
    """``start``, ``message``…, ``action <name>``, ``schedule <name>``,
    ``command <name>``, or what its code adds (LOOP P-06): ``tool <name>``,
    ``check <name>``, ``test <name>``; and ``agent <framework>``, the agent
    its code gives it (P-23): ``function``, ``langgraph``, ``langchain``,
    ``llamaindex-agent`` or ``llamaindex-workflow``."""

    handler: str
    """The handler's name."""

    where: str
    """Where it is: ``app.py:18``."""

    def line(self) -> str:
        """The mark as the spec says it."""
        return f"{CODE_MARK}{self.moment}: {self.handler} ({self.where})"


@dataclass
class Built:
    """An application built from its file."""

    application: Application
    """The application, its handlers attached."""

    document: Dict[str, Any]
    """The Appspec, as a document."""

    marks: List[CodeMark] = field(default_factory=list)
    """What its code decides."""

    source: str = ""
    """The file it was built from, by name."""

    @property
    def text(self) -> str:
        """The Appspec as YAML, its code marked."""
        return spec_text(self.document, self.marks, self.source)


def is_python(path: Union[str, Path]) -> bool:
    """Whether a file is an application in Python rather than an Appspec."""
    return Path(path).suffix == ".py"


def _named(handler: Any, name: str = "") -> str:
    """A handler's name; a Reactor command's id when one answers (LOOP P-35)."""
    command = getattr(handler, "command", None)
    if isinstance(command, str) and not hasattr(handler, "__name__"):
        return f"the Reactor command {command}"
    return name or str(handler.__name__)


def _where(handler: Any, source: str) -> str:
    code = getattr(handler, "__code__", None)
    return f"{source}:{code.co_firstlineno}" if code is not None else source


def code_marks(application: Application, source: str = "app.py") -> List[CodeMark]:
    """What an application's code decides, in the order a session meets it.

    Parameters
    ----------
    application : Application
        The application.
    source : str
        Its file's name, said beside each handler.

    Returns
    -------
    list of CodeMark
        One per handler.
    """
    marks: List[CodeMark] = []
    for event in EVENTS:
        handler = application.handler(event)
        if handler is not None:
            marks.append(CodeMark(event, handler.__name__, _where(handler, source)))
    # The agent its code gives it (LOOP P-23), by what it is.
    agent = application.code_agent
    if agent is not None:
        marks.append(
            CodeMark(
                f"agent {agent.framework}",
                agent.name,
                f"{source}:{agent.line}" if agent.line else source,
            )
        )
    for name, handler in application.actions.items():
        marks.append(
            CodeMark(f"action {name}", handler.__name__, _where(handler, source))
        )
    for name, handler in application.schedules.items():
        marks.append(CodeMark(f"schedule {name}", name, _where(handler, source)))
    for name, handler in application.commands.items():
        marks.append(
            CodeMark(f"command {name}", _named(handler), _where(handler, source))
        )
    # Code where plain words are not enough (LOOP P-06), declared in the spec
    # by name: here, where its code is.
    for kind, named in (
        ("tool", application.tools),
        ("check", application.checks),
        ("test", application.tests),
    ):
        for name, handler in named.items():
            marks.append(
                CodeMark(
                    f"{kind} {name}", _named(handler, name), _where(handler, source)
                )
            )
    return marks


def spec_text(
    document: Mapping[str, Any], marks: List[CodeMark], source: str = "app.py"
) -> str:
    """An Appspec as YAML, with what its code decides marked at the top.

    Parameters
    ----------
    document : mapping
        The Appspec.
    marks : list of CodeMark
        What the code decides.
    source : str
        The file it was built from.

    Returns
    -------
    str
        The YAML.
    """
    import yaml

    lines = [
        f"# Built from {source} by `loop apps build`: the file is the source; edit it there."
    ]
    if marks:
        lines.append("# What its code decides; without the file, its agent answers:")
        lines.extend(mark.line() for mark in marks)
    else:
        lines.append("# Its code decides nothing: its agent answers.")
    body = yaml.safe_dump(
        dict(document), sort_keys=False, allow_unicode=True, default_flow_style=False
    )
    return "\n".join(lines) + "\n" + body


def read_code_marks(text: str) -> List[CodeMark]:
    """What a built spec says its code decides; none for a spec written by hand.

    Parameters
    ----------
    text : str
        The Appspec's YAML.

    Returns
    -------
    list of CodeMark
        The marks, in order.
    """
    marks: List[CodeMark] = []
    for line in text.splitlines():
        found = _MARK.match(line.strip())
        if found:
            marks.append(CodeMark(found["moment"], found["handler"], found["where"]))
    return marks


def _written(document: Dict[str, Any]) -> Dict[str, Any]:
    """A document as its spec is written: a rule on one class of action names it
    alone, as agentspecs and the TypeScript writer write it.
    """
    from agentspecs.actions import ActionClass

    classes = {item.value for item in ActionClass}
    rules = [
        {**rule, "applies_to": rule["applies_to"][0]}
        if isinstance(rule.get("applies_to"), list)
        and len(rule["applies_to"]) == 1
        and rule["applies_to"][0] in classes
        else rule
        for rule in document.get("rules") or []
    ]
    return {**document, "rules": rules} if rules else document


def build(path: Union[str, Path]) -> Built:
    """Build an ``app.py``: the application it defines, and its Appspec.

    Parameters
    ----------
    path : str or Path
        The file.

    Returns
    -------
    Built
        The application, its spec and what its code decides.

    Raises
    ------
    AppNotRunnable
        When the file does not load, defines no application or more than
        one, or its spec does not validate — with the reasons, in sentences.
    """
    file = Path(path)
    if not file.is_file():
        raise AppNotRunnable([f"{file} is not a file."])
    try:
        application = load_application(file)
    except AppNotRunnable:
        raise
    except ValueError as error:
        if "applications; it has to define one" in str(error):
            raise AppNotRunnable([str(error)]) from None
        raise AppNotRunnable(
            [f"{file.name} does not load: {type(error).__name__}: {error}"]
        ) from None
    except ImportError as error:
        # A framework it is written with, not installed here (LOOP P-23).
        from agent_runtimes.loop.apps.frameworks import missing_framework

        missing = missing_framework(error)
        raise AppNotRunnable(
            [
                f"{file.name} does not load. {missing}"
                if missing
                else f"{file.name} does not load: {type(error).__name__}: {error}"
            ]
        ) from None
    except Exception as error:  # noqa: BLE001 - whatever the file raises, said
        raise AppNotRunnable(
            [f"{file.name} does not load: {type(error).__name__}: {error}"]
        ) from None
    application.spec  # noqa: B018 - refused here, with its reasons
    return Built(
        application=application,
        document=_written(application.document),
        marks=code_marks(application, file.name),
        source=file.name,
    )


#: How long a file is given to build apart, in seconds (LOOP P-10).
APART_SECONDS = 60.0

#: The largest file built apart: an application's source, not a dataset.
APART_LIMIT = 200_000

#: The line the process apart answers on, before its JSON.
_APART_ANSWER = "loop-apps-built:"

_APART_CHILD = "import sys; from agent_runtimes.loop.apps.build import _apart_child; _apart_child()"


def _apart_child() -> None:
    """In the process apart: build the file it is given, say the spec or why not."""
    import json
    import sys
    import tempfile

    asked = json.loads(sys.stdin.read())
    with tempfile.TemporaryDirectory() as scratch:
        file = Path(scratch) / asked["file"]
        file.write_text(asked["text"])
        try:
            answer: Dict[str, Any] = {"text": build(file).text}
        except AppNotRunnable as refused:
            answer = {"problems": list(refused.problems)}
    sys.stdout.write("\n" + _APART_ANSWER + json.dumps(answer) + "\n")
    sys.stdout.flush()


def build_apart(file: str, text: str, timeout: float = APART_SECONDS) -> str:
    """Build an application's file in a process of its own (LOOP P-10).

    What the Studio's Python tab runs: the file written in a scratch folder
    and built by another Python process, which has ``timeout`` seconds — a
    file that loops, or whose import never ends, stops that process and not
    the runtime's server.

    Parameters
    ----------
    file : str
        The file's name: ``app.py``, or another ``.py`` name with no folder.
    text : str
        Its text.
    timeout : float
        The seconds it is given.

    Returns
    -------
    str
        The Appspec it builds, as YAML, its code marked (`Built.text`).

    Raises
    ------
    AppNotRunnable
        When the file is not one to build, does not build, or takes too long —
        with the reasons, in sentences.
    """
    import json
    import subprocess
    import sys

    if not re.fullmatch(r"[A-Za-z_][\w-]*\.py", file or ""):
        raise AppNotRunnable([f"“{file}” is not the name of a Python file."])
    if not text.strip():
        raise AppNotRunnable([f"{file} is empty."])
    if len(text) > APART_LIMIT:
        raise AppNotRunnable(
            [
                f"{file} is longer than {APART_LIMIT:,} characters: build it with `loop apps build`."
            ]
        )
    try:
        done = subprocess.run(  # noqa: S603 - this interpreter, a fixed line
            [sys.executable, "-I", "-c", _APART_CHILD],
            input=json.dumps({"file": file, "text": text}),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise AppNotRunnable(
            [f"{file} did not build within {timeout:g} seconds: it was stopped."]
        ) from None
    for line in reversed(done.stdout.splitlines()):
        if line.startswith(_APART_ANSWER):
            answer = json.loads(line[len(_APART_ANSWER) :])
            if "problems" in answer:
                raise AppNotRunnable([str(problem) for problem in answer["problems"]])
            return str(answer["text"])
    said = [line for line in done.stderr.splitlines() if line.strip()]
    raise AppNotRunnable(
        [
            f"{file} stopped before it was built: {said[-1] if said else 'it said nothing'}."
        ]
    )


__all__ = [
    "APART_SECONDS",
    "CODE_MARK",
    "Built",
    "CodeMark",
    "build",
    "build_apart",
    "code_marks",
    "is_python",
    "read_code_marks",
    "spec_text",
]
