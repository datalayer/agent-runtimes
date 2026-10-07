# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent of the application's own code: a plain function, a LangGraph graph
or LangChain runnable, a LlamaIndex agent or workflow (LOOP P-23).

``app.agent(...)`` gives the application such an agent in place of the
catalogue's: ``session.agent`` is then a `FrameworkAgent`, with the same
``run`` and ``stream`` as an `AppAgent`, so that the default answer and the
code that calls ``session.agent`` do not change. What the framework does is
turned into the session's steps — the run, each model call, each tool call
with its input and output — which the chat shows and the record keeps
(P-16); its answer is the session's message.

Its rules still decide every tool call LOOP can see:

- **LangChain and LangGraph** — every tool goes through LangChain's
  callbacks: a handler (`raise_error`) decides each call in ``on_tool_start``,
  before the tool runs; a refused call stops the run with its sentence.
- **A LlamaIndex agent** — its tools are called through the agent's
  ``_call_tool``, which is taken over when the agent is given to the
  application: each call is decided there, in a session, and refused outside one.
- **A plain function and a LlamaIndex workflow** — LOOP sees no tool call of
  theirs: no rule decides one. ``loop apps validate`` says so, and the Canvas
  shows what the agent is.

A tool LOOP sees is decided as a tool of its code is (P-06): by what
``tools=`` says it does, or by a rule that names it; one it is not told of is
left to the person, and so refused. The built-in checks and the Gates run on
each call (R-06), and on the answer: a credential is withheld as the answer
streams, and an answer a Gate or a check of its code refuses is not given.

The frameworks are optional: ``agent-runtimes[langgraph]``,
``agent-runtimes[langchain]``, ``agent-runtimes[llamaindex]``.
"""

from __future__ import annotations

import asyncio
import contextvars
import inspect
from dataclasses import dataclass, field, replace
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
    Union,
)

from pydantic_ai import ModelRetry

from agent_runtimes.guardrails.common import GuardrailBlockedError
from agent_runtimes.loop.apps.composer import ModeEffect
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.types import AppSpec, AppToolSpec

#: Each kind of agent, in words.
FRAMEWORKS: Dict[str, str] = {
    "function": "a plain function",
    "langgraph": "a LangGraph graph",
    "langchain": "a LangChain runnable",
    "llamaindex-agent": "a LlamaIndex agent",
    "llamaindex-workflow": "a LlamaIndex workflow",
}

#: The kinds whose tool calls LOOP sees, and so decides.
DECIDED = ("langgraph", "langchain", "llamaindex-agent")

#: The extra of agent-runtimes that installs each framework, by the module
#: an ``app.py`` imports.
EXTRAS: Dict[str, Tuple[str, str]] = {
    "langgraph": ("LangGraph", "langgraph"),
    "langchain": ("LangChain", "langchain"),
    "langchain_core": ("LangChain", "langchain"),
    "llama_index": ("LlamaIndex", "llamaindex"),
    "workflows": ("LlamaIndex", "llamaindex"),
}

#: An empty object: the parameters of a tool whose schema is not known.
NO_PARAMETERS: Dict[str, Any] = {"type": "object", "properties": {}}


class FrameworkCallRefused(GuardrailBlockedError):
    """A tool call of a framework's agent that LOOP could not decide: refused."""


def missing_framework(error: BaseException) -> Optional[str]:
    """What a framework missing here is, in a sentence naming its extra; None otherwise.

    Parameters
    ----------
    error : BaseException
        What importing an ``app.py``, or a framework, raised.

    Returns
    -------
    str or None
        ``… needs LangGraph, which is not installed here: pip install
        'agent-runtimes[langgraph]'.`` for a framework of `EXTRAS`.
    """
    if not isinstance(error, ImportError):
        return None
    name = (getattr(error, "name", None) or "").split(".")[0]
    if name not in EXTRAS:
        return None
    framework, extra = EXTRAS[name]
    return (
        f"It needs {framework}, which is not installed here: "
        f"pip install 'agent-runtimes[{extra}]'."
    )


def _require(module: str) -> Any:
    """A framework's module, or `AppNotRunnable` naming its extra."""
    import importlib

    try:
        return importlib.import_module(module)
    except ImportError as error:
        said = missing_framework(error) or f"{module} cannot be imported: {error}"
        raise AppNotRunnable([said]) from None


def _instance_of(target: Any, module: str, name: str) -> bool:
    """Whether ``target`` is a ``module.name``; False when the module is not here."""
    import importlib

    try:
        kind = getattr(importlib.import_module(module), name)
    except (ImportError, AttributeError):
        return False
    return isinstance(target, kind)


def framework_of(target: Any) -> str:
    """What kind of agent ``target`` is: a key of `FRAMEWORKS`.

    Raises
    ------
    TypeError
        When it is none of them, in a sentence.
    """
    if _instance_of(target, "langchain_core.runnables", "Runnable"):
        return (
            "langgraph"
            if type(target).__module__.startswith("langgraph")
            else "langchain"
        )
    if _instance_of(target, "llama_index.core.agent.workflow", "BaseWorkflowAgent"):
        return "llamaindex-agent"
    if _instance_of(target, "llama_index.core.agent.workflow", "AgentWorkflow"):
        return "llamaindex-agent"
    if _instance_of(target, "llama_index.core.workflow", "Workflow"):
        return "llamaindex-workflow"
    module = type(target).__module__.split(".")[0]
    if module in EXTRAS:
        # Its framework is here in part only: the module that LOOP reads it with is not.
        said = missing_framework(ImportError(name=module)) or ""
        raise TypeError(f"{type(target).__name__} cannot be read here. {said}")
    if inspect.isroutine(target) or (callable(target) and not isinstance(target, type)):
        return "function"
    raise TypeError(
        "app.agent takes a function, a LangGraph graph or LangChain runnable, "
        f"or a LlamaIndex agent or workflow; not {type(target).__name__}."
    )


# --- the tools a framework's agent has -----------------------------------------


@dataclass(frozen=True)
class FoundTool:
    """A tool a framework's agent has, as the framework says it."""

    name: str
    description: str = ""
    parameters: Dict[str, Any] = field(default_factory=lambda: dict(NO_PARAMETERS))


def _langchain_tool(tool: Any) -> FoundTool:
    """A LangChain tool, as LOOP declares it."""
    schema: Dict[str, Any] = {}
    try:
        made = getattr(tool, "tool_call_schema", None) or getattr(
            tool, "args_schema", None
        )
        if isinstance(made, dict):
            schema = made
        elif made is not None and hasattr(made, "model_json_schema"):
            schema = made.model_json_schema()
    except Exception:  # noqa: BLE001 - a schema not read is an empty one
        schema = {}
    return FoundTool(
        name=str(tool.name),
        description=str(getattr(tool, "description", "") or ""),
        parameters=_object_schema(schema),
    )


def _llama_tool(tool: Any) -> FoundTool:
    """A LlamaIndex tool, or a plain function an agent takes, as LOOP declares it."""
    metadata = getattr(tool, "metadata", None)
    if metadata is None:
        # A plain function, as a LlamaIndex agent takes one.
        name = getattr(tool, "__name__", str(tool))
        return FoundTool(name=name, description=inspect.getdoc(tool) or "")
    try:
        schema = metadata.get_parameters_dict()
    except Exception:  # noqa: BLE001 - a schema not read is an empty one
        schema = {}
    return FoundTool(
        name=str(metadata.get_name()),
        description=str(metadata.description or ""),
        parameters=_object_schema(schema),
    )


def _object_schema(schema: Mapping[str, Any]) -> Dict[str, Any]:
    """The JSON Schema of an object, as a tool's ``parameters`` must be."""
    kept = {
        key: value
        for key, value in dict(schema or {}).items()
        if key in ("type", "properties", "required", "$defs", "description")
    }
    if kept.get("type") != "object":
        return dict(NO_PARAMETERS)
    kept.setdefault("properties", {})
    return kept


def found_tools(target: Any, framework: str) -> List[FoundTool]:
    """The tools a framework's agent says it has, where it says them.

    A LangGraph graph's are its tool nodes' (`ToolNode`, which the prebuilt
    agents use); a LangChain runnable's its ``tools``; a LlamaIndex agent's
    its ``tools``, and an `AgentWorkflow`'s those of its agents. A graph or
    agent that finds its tools as it runs (a retriever of tools) says none:
    each is decided when it is called.
    """
    found: List[FoundTool] = []
    if framework == "langgraph":
        for node in (getattr(target, "nodes", None) or {}).values():
            bound = getattr(node, "bound", node)
            by_name = getattr(bound, "tools_by_name", None)
            if isinstance(by_name, Mapping):
                found.extend(_langchain_tool(tool) for tool in by_name.values())
    elif framework == "langchain":
        found.extend(
            _langchain_tool(tool) for tool in getattr(target, "tools", None) or []
        )
    elif framework == "llamaindex-agent":
        agents = getattr(target, "agents", None)
        for agent in agents.values() if isinstance(agents, Mapping) else [target]:
            found.extend(
                _llama_tool(tool) for tool in getattr(agent, "tools", None) or []
            )
    seen: Dict[str, FoundTool] = {}
    for tool in found:
        seen.setdefault(tool.name, tool)
    return list(seen.values())


# --- an agent of its code, declared ---------------------------------------------


@dataclass(frozen=True)
class CodeAgent:
    """The agent an application's code gives it (``app.agent``)."""

    target: Any
    """The function, graph, runnable, agent or workflow."""

    framework: str
    """A key of `FRAMEWORKS`."""

    name: str
    """What it is called: the function's name, or what ``name=`` says."""

    line: int = 0
    """Where it is given, in its file: the function's first line, or the call's."""

    tools: Dict[str, Tuple[str, ...]] = field(default_factory=dict)
    """What each of its tools does, by name."""

    input: Optional[Callable[..., Any]] = None
    """How a turn is given to it: ``input(prompt, **context)``; its framework's
    default when unsaid."""

    @property
    def words(self) -> str:
        """What it is, in words: ``a LangGraph graph``."""
        return FRAMEWORKS[self.framework]

    @property
    def decides_tools(self) -> bool:
        """Whether LOOP sees its tool calls, and so its rules decide them."""
        return self.framework in DECIDED

    def note(self) -> Optional[str]:
        """What validation says of it, when its rules cannot decide its tool calls."""
        if self.decides_tools:
            return None
        return (
            f"Its agent is {self.words}, {self.name}: LOOP sees none of the tools "
            "it may call, so its rules decide none of them. Give it its tools "
            "through LOOP (@app.tool, a connection) or as a LangGraph graph or "
            "LlamaIndex agent, whose tool calls the rules decide."
        )


def code_agent_of(
    target: Any,
    *,
    name: Optional[str] = None,
    tools: Optional[Mapping[str, Union[str, Sequence[str]]]] = None,
    input: Optional[Callable[..., Any]] = None,
    line: int = 0,
) -> Tuple[CodeAgent, List[AppToolSpec]]:
    """An agent of the code, and the tools it declares in the spec.

    Parameters
    ----------
    target : Any
        A function (sync or async, returning text or yielding pieces of it),
        a LangGraph graph or LangChain runnable, a LlamaIndex agent or workflow.
    name : str, optional
        What it is called; the function's name, else its class's.
    tools : mapping, optional
        What each tool of a graph, runnable or agent does, by name: ``read``,
        ``write``, ``send``, ``buy``, ``delete``, ``publish``. Every tool it is
        found to have must be said.
    input : callable, optional
        ``input(prompt, **context)``: what a turn is given to it as.
    line : int
        Where it is given in its file.

    Returns
    -------
    tuple
        The `CodeAgent`, and an `AppToolSpec` per tool, for the spec.

    Raises
    ------
    TypeError, ValueError
        When it is no agent LOOP runs, or its tools are not said, in a sentence.
    """
    from agentspecs.actions import ActionClass

    framework = framework_of(target)
    called = (
        name
        or getattr(target, "__name__", "")
        or getattr(target, "name", "")
        or type(target).__name__
    )
    called = str(called)
    said = dict(tools or {})
    if framework not in DECIDED and said:
        raise ValueError(
            f"Its agent is {FRAMEWORKS[framework]}: LOOP sees none of its tool "
            "calls, so there is nothing to say tools= of."
        )
    classes = {item.value for item in ActionClass}
    does: Dict[str, Tuple[str, ...]] = {}
    for tool, what in said.items():
        listed = (what,) if isinstance(what, str) else tuple(what)
        unknown = [item for item in listed if item not in classes]
        if not listed or unknown:
            raise ValueError(
                f"Say what the tool {tool!r} does: one or more of "
                f"{', '.join(sorted(classes))}"
                + (f"; not {', '.join(unknown)}." if unknown else ".")
            )
        does[tool] = listed
    found = {tool.name: tool for tool in found_tools(target, framework)}
    unsaid = sorted(set(found) - set(does))
    if unsaid:
        example = ", ".join(f"{tool!r}: 'read'" for tool in unsaid)
        raise ValueError(
            f"Say what each tool of {called} does, for its rules: "
            f"tools={{{example}}} — or write, send, buy, delete, publish."
        )
    unknown_tools = sorted(set(does) - set(found)) if found else []
    if unknown_tools:
        raise ValueError(
            f"{called} has no tool {', '.join(repr(tool) for tool in unknown_tools)}: "
            f"its tools are {', '.join(sorted(found))}."
        )
    specs = [
        AppToolSpec(
            name=tool,
            description=(
                (found[tool].description if tool in found else "")
                or f"A tool of its agent {called}."
            ).strip(),
            parameters=found[tool].parameters if tool in found else dict(NO_PARAMETERS),
            does=list(listed),
        )
        for tool, listed in does.items()
    ]
    _install_guard(target, framework)
    agent = CodeAgent(
        target=target,
        framework=framework,
        name=called,
        line=line,
        tools=does,
        input=input,
    )
    return agent, specs


def code_agent_problems(app: AppSpec, agent: CodeAgent) -> List[str]:
    """What an application asks of its agent that an agent of its code is not given.

    Its connections, skills, backend tools, documents and saving are tools LOOP
    gives an agent of the catalogue; a graph, an agent or a function brings
    its own and is given none of them.
    """
    from agent_runtimes.loop.apps.documents import knows_documents
    from agent_runtimes.loop.apps.saving import saves

    problems: List[str] = []
    for present, what in (
        (app.connections, "connections"),
        (app.skills, "skills"),
        (app.backend_tools, "backend tools"),
        (knows_documents(app), "documents to answer from"),
        (saves(app), "a Space to save to"),
        (app.team, "a team"),
    ):
        if present:
            problems.append(
                f"{app.id} has {what}, which LOOP gives an agent of the catalogue, "
                f"not its agent {agent.name} ({agent.words}): give them to it in "
                "its own code, or leave app.agent out."
            )
    return problems


# --- a run, as the session sees it ----------------------------------------------

#: The run of a framework's agent the current task belongs to: what a LlamaIndex
#: agent's tool calls are decided by.
_RUN: contextvars.ContextVar[Optional["_Run"]] = contextvars.ContextVar(
    "loop_framework_run", default=None
)


def _install_guard(target: Any, framework: str) -> None:
    """Take over a LlamaIndex agent's tool calls: each decided in its session.

    A LangChain or LangGraph agent needs nothing: its handler is given per run.
    """
    if framework != "llamaindex-agent":
        return
    _require("llama_index.core")
    if getattr(target, "__dict__", {}).get("_loop_guarded"):
        return
    original = type(target)._call_tool

    async def decided_call_tool(ctx: Any, tool: Any, tool_input: dict) -> Any:
        """Decide the call in its session, then make it."""
        name = str(tool.metadata.get_name())
        run = _RUN.get()
        if run is None:
            raise FrameworkCallRefused(
                f"{name} was called outside a session: its application's rules "
                "decide every call, and no session is open."
            )
        await run.decide(name, dict(tool_input))
        return await original(target, ctx, tool, tool_input)

    # The agent is a pydantic model: its own attribute, past its validation.
    object.__setattr__(target, "_call_tool", decided_call_tool)
    # An `AgentWorkflow` calls its agents' tools through its own `_call_tool`.
    object.__setattr__(target, "_loop_guarded", True)


@dataclass
class _Open:
    """A step begun and not ended yet."""

    step: Any
    text: List[str] = field(default_factory=list)


class _Run:
    """One run of a framework's agent: its steps, its decisions, its answer."""

    def __init__(self, agent: "FrameworkAgent", prompt: str) -> None:
        """Begin a run of ``agent``, asked ``prompt``."""
        self.agent = agent
        self.session = agent.session
        self.prompt = prompt
        self.loop = asyncio.get_running_loop()
        self.steps: Dict[str, _Open] = {}
        self.refused: Optional[BaseException] = None
        self.root: Optional[Any] = None
        self.result: Any = None

    # --- steps ------------------------------------------------------------------

    async def begin(self, key: str, name: str, kind: str, input: Any = None) -> None:
        """Begin a step: the run's own when ``key`` is empty, nested in it otherwise."""
        from agent_runtimes.loop.apps.session import _STEP, Step, _new_id, _now

        parent = self.root.id if self.root is not None else _STEP.get()
        step = Step(
            id=_new_id(),
            session_id=self.session.id,
            name=name or kind,
            kind=kind,
            parent_id=parent,
            input=input,
            output=None,
            started_at=_now(),
        )
        if key == "":
            self.root = step
        else:
            self.steps[key] = _Open(step)
        from agent_runtimes.loop.apps.session import shown_step

        await self.session.channel.deliver(shown_step(step))

    async def end(self, key: str, output: Any = None, error: str = "") -> None:
        """End a step: shown, and kept in the record."""
        from agent_runtimes.loop.apps.session import _now

        if key == "":
            if self.root is None:
                return
            step, self.root = self.root, None
        else:
            opened = self.steps.pop(key, None)
            if opened is None:
                return
            step = opened.step
            if output is None and opened.text:
                output = "".join(opened.text)
        await self.session._ended(
            replace(step, output=output, ended_at=_now(), error=error)
        )

    async def end_all(self, error: str) -> None:
        """End every step still open, as failed when ``error`` says why."""
        for key in list(self.steps):
            await self.end(key, error=error)

    def said(self, key: str, text: str) -> None:
        """Add what a model step wrote to its output."""
        opened = self.steps.get(key)
        if opened is not None:
            opened.text.append(text)

    # --- decisions --------------------------------------------------------------

    async def decide(self, tool: str, args: Dict[str, Any]) -> None:
        """Decide a tool call as the application's agent's are: its rules, then its checks."""
        try:
            await self.agent.decide(tool, args)
        except BaseException as error:
            self.refused = error
            raise

    def decide_from_thread(self, tool: str, args: Dict[str, Any]) -> None:
        """Decide a call made in another thread, waiting on the session's loop."""
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            error = FrameworkCallRefused(
                f"{tool} was called without being awaited, on the session's own "
                "loop, where nobody can be asked: refused. Call it with ainvoke."
            )
            self.refused = error
            raise error
        asyncio.run_coroutine_threadsafe(self.decide(tool, args), self.loop).result()

    def recorded(self, tool: str, args: Any, result: Any) -> None:
        """Keep a tool call in the record, as an agent of the catalogue's is."""
        from agent_runtimes.loop.apps.record import _short

        self.agent.recorder.start(self.session.id)
        self.agent.recorder.add(
            "tool_call",
            f"{tool} called",
            {"tool": tool, "arguments": _short(args), "result": _short(result, 300)},
        )


# --- the agent a session's code calls ------------------------------------------


def _text(content: Any) -> str:
    """The text of a message's content: a string, or a list of blocks."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, (list, tuple)):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, Mapping) and block.get("type") in (None, "text"):
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return str(content)


def _final_text(output: Any) -> str:
    """The answer a graph, chain or workflow ended with, as text."""
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    if isinstance(output, Mapping):
        messages = output.get("messages")
        if isinstance(messages, (list, tuple)) and messages:
            last = messages[-1]
            return _text(getattr(last, "content", last))
        for key in ("output", "answer", "result", "response"):
            if key in output:
                return _final_text(output[key])
        return ""
    content = getattr(output, "content", None)
    if content is not None:
        return _text(content)
    return str(output)


def _context_text(context: Mapping[str, Any], mode: ModeEffect) -> str:
    """What a turn is told besides its prompt: its modes' instructions, its context."""
    from agent_runtimes.loop.apps.agent import _context

    return _context(dict(context), mode.instructions) or ""


class FrameworkAgent:
    """An application's agent written with a framework, in one session.

    What ``session.agent`` is when the application's code gives it one
    (``app.agent``): ``run`` and ``stream`` as an `AppAgent`'s, its run
    turned into the session's steps, its tool calls decided by its rules.
    """

    def __init__(
        self,
        app: AppSpec,
        code: CodeAgent,
        session: Any,
        *,
        capabilities: Sequence[Any] = (),
    ) -> None:
        self.app = app
        self.code = code
        self.session = session
        self.session_id = session.id
        self.capabilities: List[Any] = list(capabilities)
        """Its rules, its checks, its record, and its code's checks."""
        self.toolsets: List[Any] = []
        """Not given to it: an agent of its code brings its own tools."""
        self.mode = ModeEffect()
        """What the modes and profile chosen tell it; their model it does not run on."""
        self.history: List[Any] = []
        """The conversation so far, as its framework keeps it."""
        self._llama_context: Any = None

    @property
    def recorder(self) -> Any:
        """The session's record."""
        return self.session._recorder

    # --- what decides --------------------------------------------------------------

    def _deciders(self) -> List[Any]:
        """Return its rules, its checks and its code's checks, in their order."""
        from agent_runtimes.loop.apps.enforcement import AppRulesCapability
        from agent_runtimes.loop.apps.guards import AppChecksCapability
        from agent_runtimes.loop.apps.own import AppCodeChecksCapability

        kinds = (AppRulesCapability, AppChecksCapability, AppCodeChecksCapability)
        return [item for item in self.capabilities if isinstance(item, kinds)]

    async def decide(self, tool: str, args: Dict[str, Any]) -> None:
        """Decide one tool call: its rules, then its checks, then its code's checks.

        Raises
        ------
        AppRuleBlockedError, AppCheckBlockedError
            When it is not done, with the sentence why. A check that would ask
            the model again refuses: a framework's model cannot be asked again.
        """
        from pydantic_ai.messages import ToolCallPart
        from pydantic_ai.tools import ToolDefinition

        from agent_runtimes.loop.apps.guards import AppCheckBlockedError

        self.recorder.start(self.session.id)
        call = ToolCallPart(tool_name=tool, args=args)
        definition = ToolDefinition(name=tool)
        for capability in self._deciders():
            try:
                args = await capability.before_tool_execute(
                    None, call=call, tool_def=definition, args=args
                )
            except ModelRetry as retry:
                raise AppCheckBlockedError(str(retry)) from None

    def _answer_checked(self) -> bool:
        """Whether its answer is checked whole before it is given: a Gate, or its code."""
        return bool(self.app.checks.gates) or any(
            check.on == "answer" for check in self.app.checks.code
        )

    async def _checked_answer(self, text: str) -> str:
        """An answer its checks let through; refused, `AppCheckBlockedError`."""
        from agent_runtimes.loop.apps.guards import (
            AppCheckBlockedError,
            AppChecksCapability,
        )
        from agent_runtimes.loop.apps.own import AppCodeChecksCapability

        for capability in self.capabilities:
            if not isinstance(
                capability, (AppChecksCapability, AppCodeChecksCapability)
            ):
                continue
            try:
                await capability.after_output_process(
                    None, output_context=None, output=text
                )
            except ModelRetry as retry:
                raise AppCheckBlockedError(str(retry)) from None
        return text

    async def _withheld(self, pieces: AsyncIterator[str]) -> AsyncIterator[str]:
        """The pieces of an answer as they come, a credential withheld (R-06)."""
        from pydantic_ai.messages import (
            PartDeltaEvent,
            PartEndEvent,
            PartStartEvent,
            TextPart,
            TextPartDelta,
        )

        from agent_runtimes.loop.apps.guards import AppChecksCapability

        checks = next(
            (
                item
                for item in self.capabilities
                if isinstance(item, AppChecksCapability)
            ),
            None,
        )
        if checks is None:
            async for piece in pieces:
                yield piece
            return
        whole: List[str] = []

        async def events() -> AsyncIterator[Any]:
            """Say the pieces as a pydantic-ai stream of one text part.

            Yields
            ------
            Any
                The part's start, a delta per piece, the part's end.
            """
            yield PartStartEvent(index=0, part=TextPart(content=""))
            async for piece in pieces:
                whole.append(piece)
                yield PartDeltaEvent(index=0, delta=TextPartDelta(content_delta=piece))
            yield PartEndEvent(index=0, part=TextPart(content="".join(whole)))

        async for event in checks.wrap_run_event_stream(None, stream=events()):
            if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                if event.part.content:
                    yield event.part.content
            elif isinstance(event, PartDeltaEvent) and isinstance(
                event.delta, TextPartDelta
            ):
                if event.delta.content_delta:
                    yield event.delta.content_delta

    # --- a turn ------------------------------------------------------------------

    async def run(self, prompt: str, **context: Any) -> Any:
        """Ask its agent, and wait for its whole answer.

        Returns
        -------
        Answer
            Its text, and its output as the framework gave it: the graph's
            final state, the workflow's result, what the function returned.
        """
        from agent_runtimes.loop.apps.agent import Answer

        holder: List[_Run] = []
        pieces = [piece async for piece in self._turn(prompt, context, holder)]
        text = "".join(pieces)
        output = holder[0].result if holder else None
        return Answer(text=text, output=text if output is None else output)

    async def stream(self, prompt: str, **context: Any) -> AsyncIterator[str]:
        """Ask its agent, and yield its answer as it comes.

        A LangChain or LangGraph agent's tokens come as its model writes them;
        a LlamaIndex agent's answer when it has ended; a function's as it yields.
        Its answer comes whole when a Gate or a check of its code reads it first.
        """
        async for piece in self._turn(prompt, context, []):
            yield piece

    async def _turn(
        self, prompt: str, context: Mapping[str, Any], holder: List[_Run]
    ) -> AsyncIterator[str]:
        """One turn: its steps, its answer piece by piece, its record."""
        run = _Run(self, prompt)
        holder.append(run)
        self.recorder.start(self.session.id)
        self.recorder.ran(self.session.id)
        await run.begin("", self.code.name, "run", prompt)
        token = _RUN.set(run)
        given: List[str] = []
        try:
            pieces = self._pieces(run, prompt, context)
            if self._answer_checked():
                whole = "".join([piece async for piece in self._withheld(pieces)])
                checked = await self._checked_answer(whole)
                given.append(checked)
                yield checked
            else:
                async for piece in self._withheld(pieces):
                    given.append(piece)
                    yield piece
        except BaseException as error:
            failure = run.refused or error
            said = str(failure) or type(failure).__name__
            await run.end_all(said)
            await run.end("", error=said)
            self.recorder.add(
                "output", f"Stopped: {said[:300]}", {"error": type(failure).__name__}
            )
            await self.recorder.flush(self.session.id)
            if run.refused is not None and failure is not error:
                raise run.refused from None
            raise
        finally:
            _RUN.reset(token)
        answer = "".join(given)
        await run.end_all("")
        if self.code.framework == "function":
            self.history.extend(
                [
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": answer},
                ]
            )
        if self.recorder.kept("turn"):
            self.recorder.turned(prompt, answer)
        self.recorder.add("output", answer[:300], {"length": len(answer)})
        await run.end("", output=answer[:300])

    def _pieces(
        self, run: _Run, prompt: str, context: Mapping[str, Any]
    ) -> AsyncIterator[str]:
        """The pieces of the answer, as its framework gives them."""
        framework = self.code.framework
        if framework == "function":
            return self._function(run, prompt, context)
        if framework in ("langgraph", "langchain"):
            return self._langchain(run, prompt, context)
        return self._llama(run, prompt, context)

    # --- a plain function -----------------------------------------------------------

    async def _function(
        self, run: _Run, prompt: str, context: Mapping[str, Any]
    ) -> AsyncIterator[str]:
        """A plain function's answer: returned, or yielded piece by piece."""
        function = self.code.target
        kwargs = self._function_kwargs(function, context)
        if inspect.isasyncgenfunction(function):
            result: Any = function(prompt, **kwargs)
        elif inspect.iscoroutinefunction(function) or inspect.isgeneratorfunction(
            function
        ):
            result = function(prompt, **kwargs)
        else:
            # Blocking code, in a thread: the session goes on meanwhile.
            result = await asyncio.to_thread(function, prompt, **kwargs)
        if inspect.isawaitable(result):
            result = await result
        if inspect.isasyncgen(result):
            async for piece in result:
                yield str(piece)
        elif inspect.isgenerator(result):
            done = object()
            while True:
                piece = await asyncio.to_thread(next, result, done)
                if piece is done:
                    break
                yield str(piece)
        else:
            run.result = result
            text = _final_text(result)
            if text:
                yield text

    def _function_kwargs(
        self, function: Callable[..., Any], context: Mapping[str, Any]
    ) -> Dict[str, Any]:
        """What a function is given besides the prompt: what it takes by name."""
        try:
            parameters = inspect.signature(function).parameters
        except (TypeError, ValueError):
            parameters = {}  # type: ignore[assignment]
        takes_any = any(
            item.kind is inspect.Parameter.VAR_KEYWORD for item in parameters.values()
        )
        offered: Dict[str, Any] = {
            "session": self.session,
            "history": list(self.history),
            "instructions": self.mode.instructions,
        }
        kwargs = {
            key: value
            for key, value in offered.items()
            if key in parameters and key not in context
        }
        refused = [key for key in context if key not in parameters and not takes_any]
        if refused:
            raise TypeError(
                f"Its agent {self.code.name} takes no "
                f"{', '.join(repr(key) for key in refused)}: add the argument, "
                "or **context."
            )
        kwargs.update(context)
        return kwargs

    # --- LangChain and LangGraph ----------------------------------------------------

    def _langchain_input(self, prompt: str, context: Mapping[str, Any]) -> Any:
        """What a LangChain runnable or LangGraph graph is given for a turn."""
        if self.code.input is not None:
            return self.code.input(prompt, **context)
        said = _context_text(context, self.mode)
        if self.code.framework == "langgraph":
            remembers = getattr(self.code.target, "checkpointer", None)
            history = [] if remembers else list(self.history)
            turn = [("system", said)] if said else []
            return {"messages": [*history, *turn, ("user", prompt)]}
        if said:
            raise TypeError(
                f"Its agent {self.code.name} is a LangChain runnable, given the "
                "prompt alone: say how it takes what it is told with input=."
            )
        return prompt

    async def _langchain(
        self, run: _Run, prompt: str, context: Mapping[str, Any]
    ) -> AsyncIterator[str]:
        """A LangChain or LangGraph run, its events as steps and its tokens as the answer."""
        _require("langchain_core.callbacks")
        handler = _langchain_handler(run)
        config = {
            "callbacks": [handler],
            "configurable": {"thread_id": self.session.id},
            "run_name": self.code.name,
        }
        given = self._langchain_input(prompt, context)
        streamed = False
        async for event in self.code.target.astream_events(
            given, config=config, version="v2"
        ):
            kind = event.get("event", "")
            key = str(event.get("run_id", ""))
            data = event.get("data") or {}
            name = str(event.get("name", ""))
            if kind in ("on_chat_model_start", "on_llm_start"):
                await run.begin(key, name, "model")
            elif kind in ("on_chat_model_stream", "on_llm_stream"):
                chunk = data.get("chunk")
                piece = _text(getattr(chunk, "content", None)) or (
                    str(getattr(chunk, "text", "") or "") if chunk is not None else ""
                )
                if piece:
                    streamed = True
                    run.said(key, piece)
                    yield piece
            elif kind in ("on_chat_model_end", "on_llm_end"):
                output = data.get("output")
                await run.end(key, _text(getattr(output, "content", None)) or None)
            elif kind == "on_tool_start":
                await run.begin(key, name, "tool", data.get("input"))
            elif kind == "on_tool_end":
                output = data.get("output")
                result = getattr(output, "content", output)
                run.recorded(name, data.get("input"), result)
                await run.end(key, result)
            elif kind == "on_tool_error":
                await run.end(key, error=str(data.get("error", "")))
            elif kind == "on_retriever_start":
                await run.begin(key, name, "retrieval", data.get("input"))
            elif kind == "on_retriever_end":
                await run.end(key, data.get("output"))
            elif kind == "on_chain_end" and not event.get("parent_ids"):
                run.result = data.get("output")
        output = run.result
        if isinstance(output, Mapping) and isinstance(output.get("messages"), list):
            self.history = list(output["messages"])
        if not streamed:
            text = _final_text(output)
            if text:
                yield text

    # --- LlamaIndex -------------------------------------------------------------------

    async def _llama(
        self, run: _Run, prompt: str, context: Mapping[str, Any]
    ) -> AsyncIterator[str]:
        """A LlamaIndex run, its events as steps and its result as the answer."""
        _require("llama_index.core.workflow")
        target = self.code.target
        if self.code.input is not None:
            kwargs = dict(self.code.input(prompt, **context))
        else:
            said = _context_text(context, self.mode)
            kwargs = {"user_msg": f"{said}\n\n{prompt}" if said else prompt}
        if self.code.framework == "llamaindex-agent":
            from llama_index.core.workflow import Context

            if self._llama_context is None:
                # Its memory, kept from turn to turn of this session.
                self._llama_context = Context(target)
            kwargs.setdefault("ctx", self._llama_context)
        handler = target.run(**kwargs)
        model = 0
        async for event in handler.stream_events():
            kind = type(event).__name__
            if kind == "AgentInput":
                model += 1
                await run.begin(
                    f"model-{model}",
                    str(getattr(event, "current_agent_name", "")),
                    "model",
                )
            elif kind == "AgentStream":
                run.said(f"model-{model}", str(getattr(event, "delta", "") or ""))
            elif kind == "AgentOutput":
                response = getattr(event, "response", None)
                await run.end(
                    f"model-{model}", _text(getattr(response, "content", None)) or None
                )
            elif kind == "ToolCall":
                await run.begin(
                    f"tool-{event.tool_id}",
                    str(event.tool_name),
                    "tool",
                    dict(event.tool_kwargs or {}),
                )
            elif kind == "ToolCallResult":
                output = event.tool_output
                result = getattr(output, "content", output)
                run.recorded(
                    str(event.tool_name), dict(event.tool_kwargs or {}), result
                )
                if getattr(output, "is_error", False):
                    await run.end(f"tool-{event.tool_id}", error=str(result))
                else:
                    await run.end(f"tool-{event.tool_id}", result)
            elif kind in (
                "StopEvent",
                "AgentWorkflowStartEvent",
                "StartEvent",
                # How it failed is the run's own step's error.
                "WorkflowFailedEvent",
            ):
                continue
            else:
                # An event of a workflow's own: a step of its run, as it said it.
                said_event = (
                    event.model_dump() if hasattr(event, "model_dump") else str(event)
                )
                await run.begin(f"event-{id(event)}", kind, "run")
                await run.end(f"event-{id(event)}", said_event)
        result = await handler
        run.result = result
        if self.code.framework == "llamaindex-workflow" and not isinstance(result, str):
            text = _final_text(getattr(result, "result", result))
        else:
            text = _final_text(getattr(result, "response", result))
        if text:
            yield text


def _langchain_handler(run: _Run) -> Any:
    """A LangChain callback handler that decides each tool call before it runs.

    A handler that raises (``raise_error``) stops the tool: LangChain calls
    ``on_tool_start`` before running it. Its methods are synchronous, so that
    LangChain honours what they raise, and run in a thread of their own: the
    decision, and asking the person, wait on the session's loop.
    """
    from langchain_core.callbacks import BaseCallbackHandler

    class LoopToolRules(BaseCallbackHandler):
        raise_error = True

        def on_tool_start(
            self,
            serialized: Optional[Dict[str, Any]],
            input_str: str,
            *,
            inputs: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            """Decide the call: refused, the tool does not run."""
            """Decide each tool call before LangChain runs it."""
            name = str(kwargs.get("name") or (serialized or {}).get("name") or "")
            args = dict(inputs) if isinstance(inputs, Mapping) else {"input": input_str}
            run.decide_from_thread(name, args)

    return LoopToolRules()


def framework_agent_maker(code: CodeAgent) -> Callable[[Any], FrameworkAgent]:
    """What makes the agent of a session, from the agent of the code.

    Its rules, checks and record are those any agent of the application runs
    with (`app_capabilities`); a rule or a Gate that asks asks the session's user.
    """
    from agent_runtimes.loop.apps.agent import app_capabilities

    def make(session: Any) -> FrameworkAgent:
        """The agent of ``session``."""
        return FrameworkAgent(
            session.app,
            code,
            session,
            capabilities=app_capabilities(
                session.app,
                recorder=session._recorder,
                agent_id=session.app.agent or None,
                ask_rule=session._ask_rule,
                ask_check=session._ask_check,
            ),
        )

    return make


__all__ = [
    "CodeAgent",
    "DECIDED",
    "EXTRAS",
    "FRAMEWORKS",
    "FoundTool",
    "FrameworkAgent",
    "FrameworkCallRefused",
    "code_agent_of",
    "code_agent_problems",
    "found_tools",
    "framework_agent_maker",
    "framework_of",
    "missing_framework",
]
