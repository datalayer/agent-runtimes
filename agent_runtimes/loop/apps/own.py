# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Code where plain words are not enough: an application's own tools, checks
and tests (LOOP P-06).

An ``app.py`` declares them with ``@app.tool``, ``@app.check`` and
``@app.test``; its spec says each by name (``tools``, ``checks.code``,
``tests.cases[].code``), so that the Canvas shows them and validation runs
them. Here is what runs them:

- `own_toolset` — its tools, given to its agent beside its own; every call is
  decided by its rules, by what the tool ``does`` (`rules.decision_for`);
- `AppCodeChecksCapability` — its checks, at their stage, beside the built-in
  ones (R-06): an answer refused is asked again, a tool call refused is
  stopped, each in its own sentence, and kept in the record as a check;
- `run_code_tests` — its tests, each case asked of the application in this
  process, its conversation handed to the function that decides it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.loop.apps.guards import (
    IN_FLIGHT,
    POST_RUN,
    AppCheckBlockedError,
    Verdict,
)
from agent_runtimes.types import AppSpec

#: Where a check of its code runs.
CHECK_STAGES: Tuple[str, ...] = ("answer", "tool_call")

#: What a check's verdict is kept under in the record, by its stage.
_RECORDED_AT = {"answer": POST_RUN, "tool_call": IN_FLIGHT}

Handler = Callable[..., Any]


# --- its tools --------------------------------------------------------------------


@dataclass(frozen=True)
class CommandTool:
    """A tool of a plugin the application uses, run as the Reactor command it
    names (LOOP P-35): ``app.uses(plugin, tools={...})``.

    Contributed unbound; the host that runs a session binds it to its
    platform (`on`), where the command is registered.
    """

    command: str
    """The Reactor command's id."""

    platform: Any = None
    """The platform it runs on, once bound."""

    def on(self, platform: Any) -> "CommandTool":
        """The tool, run on that platform."""
        return CommandTool(self.command, platform)

    async def __call__(self, **arguments: Any) -> Any:
        """Run it, as any tool of its code is called."""
        return await self.run(**arguments)

    async def run(self, **arguments: Any) -> Any:
        """Run the command with the call's arguments, and answer what it returns.

        Raises
        ------
        RuntimeError
            When it is not bound to a platform.
        """
        if self.platform is None:
            raise RuntimeError(
                f"The tool running {self.command} is not bound to a platform."
            )
        return await self.platform.execute_command(self.command, arguments)


def own_toolset(app: AppSpec, handlers: Mapping[str, Optional[Handler]]) -> Any:
    """The tools its code gives its agent, as one toolset; None when it has none.

    Parameters
    ----------
    app : AppSpec
        The application: each tool's name and description as its spec says them.
    handlers : mapping
        The function of each tool, by name; a name without one is not given.

    Returns
    -------
    FunctionToolset or None
        The toolset.
    """
    from pydantic_ai import Tool
    from pydantic_ai.toolsets import FunctionToolset

    tools = [
        # A plugin's tool runs its command with its declared parameters: there
        # is no signature of its own to read them from (LOOP P-35).
        Tool.from_schema(
            handler.run,
            name=tool.name,
            description=tool.description,
            json_schema=tool.parameters,
        )
        if isinstance(handler, CommandTool)
        else Tool(
            handler, takes_ctx=False, name=tool.name, description=tool.description
        )
        for tool in app.tools
        if (handler := handlers.get(tool.name)) is not None
    ]
    return FunctionToolset(tools) if tools else None


# --- its checks -------------------------------------------------------------------


def refusal_of(name: str, said: Any) -> Optional[str]:
    """What a check said, as a refusal: None when it lets it pass.

    ``None`` and ``True`` pass; ``False`` refuses; a sentence refuses, and says why.

    Raises
    ------
    TypeError
        For anything else: a check that says nothing clear is not read as a pass.
    """
    if said is None or said is True:
        return None
    if said is False:
        return f"The check {name} refused it."
    if isinstance(said, str) and said.strip():
        return said.strip()
    raise TypeError(
        f"The check {name} returned {said!r}: a check returns None or True to let "
        "it pass, False or a sentence to refuse."
    )


@dataclass
class AppCodeChecksCapability(AbstractCapability[Any]):
    """Run the checks of an application's code at their stage (LOOP P-06).

    After its rules and its built-in checks: a call the rules refuse is not
    checked. A tool call refused is stopped (`AppCheckBlockedError`); an
    answer refused is asked again with why (`ModelRetry`). What a check
    raises is not a refusal: it fails the turn, as a failing tool does.
    """

    app: AppSpec

    checks: Dict[str, Tuple[str, Handler]] = field(default_factory=dict)
    """Each check, by name: its stage and its function."""

    record: Optional[Callable[[str, Verdict], None]] = None
    """Told of every refusal, by stage: the record's check entry."""

    async def _refused(self, stage: str, *args: Any) -> Optional[str]:
        from agent_runtimes.loop.apps.session import call

        for name, (on, handler) in self.checks.items():
            if on != stage:
                continue
            sentence = refusal_of(name, await call(handler, *args))
            if sentence is not None:
                verdict = Verdict(
                    "stop" if stage == "tool_call" else "retry", sentence, name
                )
                if self.record is not None:
                    self.record(_RECORDED_AT[stage], verdict)
                return sentence
        return None

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        refused = await self._refused("tool_call", call.tool_name, dict(args))
        if refused is not None:
            raise AppCheckBlockedError(refused)
        return args

    async def after_output_process(
        self, ctx: RunContext[Any], *, output_context: Any, output: Any
    ) -> Any:
        refused = await self._refused("answer", str(output))
        if refused is not None:
            raise ModelRetry(f"{refused} Answer again without it.")
        return output


def own_checks(
    app: AppSpec,
    handlers: Mapping[str, Optional[Handler]],
    *,
    record: Optional[Callable[[str, Verdict], None]] = None,
) -> Optional[AppCodeChecksCapability]:
    """The checks its code runs, as one capability; None when it has none.

    Parameters
    ----------
    app : AppSpec
        The application: each check's stage as its spec says it.
    handlers : mapping
        The function of each check, by name; a name without one is not run.
    record : callable, optional
        Told of every refusal: the recorder's ``checked``.
    """
    checks = {
        check.name: (check.on, handler)
        for check in app.checks.code
        if (handler := handlers.get(check.name)) is not None
    }
    return (
        AppCodeChecksCapability(app=app, checks=checks, record=record)
        if checks
        else None
    )


# --- its tests --------------------------------------------------------------------


@dataclass(frozen=True)
class Conversation:
    """What a test case's conversation was: what a test of its code is given."""

    ask: str
    """What it was asked."""

    answer: str
    """What it answered, its messages one after the other."""

    messages: Tuple[Any, ...] = ()
    """The messages it wrote (`Message`), as they are at the end."""

    steps: Tuple[Any, ...] = ()
    """The steps it showed (`Step`), each as it ended."""

    asked: str = ""
    """What it asked the person, when it stopped to ask: nobody answers in a test."""


def verdict_of(name: str, said: Any) -> Tuple[bool, str]:
    """What a test of its code said: whether it passed, and why not.

    ``True`` passes; ``False`` fails; a sentence fails, and says why.

    Raises
    ------
    TypeError
        For anything else — ``None`` among it: a test that forgot to say is
        not a pass.
    """
    if said is True:
        return True, ""
    if said is False:
        return False, f"{name} says it failed."
    if isinstance(said, str) and said.strip():
        return False, said.strip()
    raise TypeError(
        f"The test {name} returned {said!r}: a test returns True or False, or a "
        "sentence saying why it failed."
    )


PASSED = "passed"
FAILED = "failed"
NOT_RUN = "not_run"


@dataclass(frozen=True)
class CodeTestResult:
    """What came of one test of its code."""

    name: str
    expect: str
    ask: str
    state: str
    """`passed`, `failed`, or `not_run` (its conversation failed, or its code raised)."""
    says: str = ""


def code_tests(app: AppSpec) -> List[Any]:
    """The cases its code decides, in the spec's order."""
    return [case for case in app.tests.cases if case.code]


async def run_code_tests(
    application: Any,
    *,
    agent: Optional[Callable[[AppSpec], Any]] = None,
) -> List[CodeTestResult]:
    """Each test its code decides, run in this process: its case asked, a
    session of its own each, its conversation handed to its function.

    Parameters
    ----------
    application : Application
        The application, its code attached.
    agent : callable, optional
        How its agent is built; in this process, from its spec, when unsaid.

    Returns
    -------
    list of CodeTestResult
        One per test, in the spec's order.

    Raises
    ------
    AppNotRunnable
        When its agent cannot be built in this process.
    """
    from agent_runtimes.loop.apps.safety import converse_in_process
    from agent_runtimes.loop.apps.session import Message, Step, call

    cases = code_tests(application.spec)
    conversed = await converse_in_process(application, cases, agent=agent)
    results: List[CodeTestResult] = []
    for case, had in zip(cases, conversed):
        handler = application.tests.get(case.code)
        if handler is None:
            results.append(
                CodeTestResult(
                    case.code,
                    case.expect,
                    case.ask,
                    NOT_RUN,
                    f"{case.code} is not in its code.",
                )
            )
            continue
        if had.error:
            results.append(
                CodeTestResult(case.code, case.expect, case.ask, NOT_RUN, had.error)
            )
            continue
        shown: Dict[str, Any] = {}
        steps: List[Any] = []
        for event in had.events:
            if isinstance(event, Message):
                shown[event.id] = event
            elif isinstance(event, Step) and event.ended_at is not None:
                steps.append(event)
        messages = tuple(shown.values())
        conversation = Conversation(
            ask=case.ask,
            answer="\n".join(message.text for message in messages),
            messages=messages,
            steps=tuple(steps),
            asked=had.asked,
        )
        try:
            passed, why = verdict_of(case.code, await call(handler, conversation))
        except Exception as error:  # noqa: BLE001 - a test that raises is said, not passed
            results.append(
                CodeTestResult(
                    case.code,
                    case.expect,
                    case.ask,
                    NOT_RUN,
                    f"{case.code} raised {type(error).__name__}: {error}",
                )
            )
            continue
        results.append(
            CodeTestResult(
                case.code, case.expect, case.ask, PASSED if passed else FAILED, why
            )
        )
    return results


__all__ = [
    "CHECK_STAGES",
    "FAILED",
    "NOT_RUN",
    "PASSED",
    "AppCodeChecksCapability",
    "CodeTestResult",
    "Conversation",
    "code_tests",
    "own_checks",
    "own_toolset",
    "refusal_of",
    "run_code_tests",
    "verdict_of",
]
