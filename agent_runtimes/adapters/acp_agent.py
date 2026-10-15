# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness as a Datalayer agent: ``ACPAgent(BaseAgent)`` on ``agent_shield.acp`` (SHIELD §3.2, SH-10).

A **harness** — Claude Code, Codex, any program speaking the Agent Client
Protocol — is launched in the runtime as a subprocess over stdio and driven
as the runtime drives its own agents: ``initialize`` launches it from its
spec and negotiates (protocol version 1, the client's ``fs`` and ``terminal``
capabilities on, answered here); ``stream`` opens or loads a session in the
workspace, prompts, and turns every ``session/update`` into the runtime's
``StreamEvent``s (§4.1's table); ``cleanup`` cancels and ends the process.

The engine is the ``agent-shield`` package's, hosted and never copied
(§5.1, decision 14): this class **is** a :class:`agent_shield.acp.proxy.ShieldProxy`
whose outer face is a Datalayer agent instead of an ACP client — the same
inner client classes the harness's tool calls, decides them by the policies
(the application's Rules, then decision 5's default), answers ``fs/*`` and
``terminal/*`` against the workspace, counts the limits, and turns
``allow_always`` into a session rule (decision 7). What agent-runtimes adds:

- the mapping of the package's neutral events onto ``StreamEvent``s;
- ``session/request_permission`` raised through the runtime's tool approvals
  (Waiting for you, ai-agents ``/ws``, ``GET /tool-approvals/{id}``), the
  person's answer handed back to the harness (§4.5, SH-12); a turn cancelled
  while it waits answers ``cancelled``;
- the Shield's audit written to the application's record (§4.8, §6.4, SH-18);
- ``session/load`` when the harness advertises it, the replay compared with
  the record; otherwise a start-over said in a sentence, never pretended.

A malformed update ends the turn with a sentence (the package's
:class:`~agent_shield.acp.normalize.MalformedUpdate`), as does an action a
policy leaves to the person. Nothing here falls back to pydantic-ai.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import shutil
import sys
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from acp import text_block
from acp.exceptions import RequestError
from acp.schema import (
    AllowedOutcome,
    DeniedOutcome,
    HttpHeader,
    HttpMcpServer,
    Implementation,
    InitializeResponse,
    PermissionOption,
    PromptResponse,
    RequestPermissionResponse,
    StdioMcpServer,
    ToolCallUpdate,
)
from agent_shield.__version__ import __version__ as shield_version
from agent_shield.acp import SHIELD_CLIENT_CAPABILITIES, normalize
from agent_shield.acp.events import (
    CommandsUpdated,
    Event,
    ModeChanged,
    PlanUpdated,
    SessionInfo,
    TextDelta,
    ThoughtDelta,
    ToolCallSaid,
    ToolCallUpdated,
    UserText,
)
from agent_shield.acp.proxy import REFUSED, SessionState, ShieldProxy
from agent_shield.config import harness_bin, harness_prefix
from agent_shield.policy import LoadedPolicy, Policy
from agent_shield.register import EXECUTABLES

from agent_runtimes._version import __version__
from agent_runtimes.guardrails.shield_policy import VERDICT_BEHAVIOUR, policies_of
from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
)
from agent_runtimes.mcp.datalayer_gateway import gateway_query, gateway_url
from agent_runtimes.mcp.lent_stdio import hold, release
from agent_runtimes.types import HarnessSpec

from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
    ToolResult,
)

logger = logging.getLogger(__name__)

#: What the runtime tells a harness it is.
RUNTIME_CLIENT_INFO = Implementation(
    name="agent-runtimes", title="Datalayer Agent Runtimes", version=__version__
)

#: Where a harness's workspace is: the runtime's own (SHIELD §4.6). The same
#: variable the runtime's codemode workspace reads; ``loop --harness`` sets it
#: to the directory it runs in.
WORKSPACE_VARIABLE = "AGENT_RUNTIMES_WORKSPACE_ROOT"

#: The kind the protocol state store keeps a harness's session under, so a
#: runtime restarted finds the session to load (§4.8).
HARNESS_SESSION_KIND = "harness_session"

#: Said to the person as the harness's own message, as the proxy says it.
SHIELD_PREFIX = "[Shield] "

_TURN_ENDED = object()


class HarnessRefused(RuntimeError):
    """What stops a harness before or as it runs, said in a sentence."""


# -- launching -----------------------------------------------------------------------


def launch_command(harness: HarnessSpec, *, home: Path | None = None) -> list[str]:
    """The command that launches ``harness`` here, resolved; a refusal when nothing can.

    An adapter the spec launches through ``npx -y <package>@<version>`` is
    never fetched at first run (SHIELD §5): it is looked for where
    ``agent-shield setup --harness <id>`` installs it
    (``~/.agent-shield/harnesses/<id>@<version>/node_modules/.bin``) and
    then on the PATH, where the runtime image installs it at build (SH-05).

    Parameters
    ----------
    harness : HarnessSpec
        The catalogue's spec.
    home : Path, optional
        The Shield's home, for a test; ``$AGENT_SHIELD_HOME`` or ``~/.agent-shield``.

    Returns
    -------
    list[str]
        The executable's path and its arguments.
    """
    acp = harness.acp
    if acp is None:
        raise HarnessRefused(
            f"The harness {harness.id!r} names no launch command: an organization's "
            "own spec names it."
        )
    if acp.command != "npx":
        found = shutil.which(acp.command)
        if found is None:
            raise HarnessRefused(
                f"{harness.name} needs {acp.command!r} on the PATH, and it is not there."
            )
        return [found, *acp.args]
    package = next((arg for arg in acp.args if not arg.startswith("-")), None)
    if package is None:
        raise HarnessRefused(
            f"The harness {harness.id!r} launches npx with no package."
        )
    name, _, version = package.rpartition("@")
    if not name:
        name, version = package, harness.registered.version
    executable = EXECUTABLES.get(name, name.rpartition("/")[2])
    installed = harness_bin(harness_prefix(harness.id, version, home), executable)
    on_path = shutil.which(executable)
    rest = [arg for arg in acp.args if arg not in ("-y", package)]
    if installed.is_file():
        return [str(installed), *rest]
    if on_path is not None:
        return [on_path, *rest]
    raise HarnessRefused(
        f"{harness.name}'s adapter {name}@{version} is not installed: neither "
        f"{installed} (`agent-shield setup --harness {harness.id}`) nor "
        f"{executable!r} on the PATH (the runtime image installs it at build, SH-05)."
    )


def harness_environment(
    harness: HarnessSpec, environment: Mapping[str, str] | None = None
) -> dict[str, str]:
    """What the harness's process is given: its spec's plain variables and its declared secrets, by name.

    Nothing else of the runtime's environment reaches it (the channel's
    trimmed set holds HOME and PATH). A declared secret absent from
    ``environment`` is a refusal in a sentence: the harness would start and
    fail at its first model call, after the session was opened.
    """
    source = os.environ if environment is None else environment
    given: dict[str, str] = dict(harness.acp.env) if harness.acp else {}
    missing = [name for name in harness.requires.secrets if not source.get(name)]
    if missing:
        raise HarnessRefused(
            f"{harness.name} needs {', '.join(missing)} in the environment "
            f"({harness.registered.credential}), and it is not set."
        )
    for name in harness.requires.secrets:
        given[name] = source[name]
    return given


def harness_workspace(environment: Mapping[str, str] | None = None) -> Path:
    """The workspace a harness runs in: ``AGENT_RUNTIMES_WORKSPACE_ROOT``, a directory that exists."""
    source = os.environ if environment is None else environment
    named = source.get(WORKSPACE_VARIABLE, "")
    if not named:
        raise HarnessRefused(
            f"No workspace for the harness: set {WORKSPACE_VARIABLE} to the directory "
            "it works in (`loop --harness` sets it to the directory it runs in)."
        )
    workspace = Path(named).expanduser().resolve()
    if not workspace.is_dir():
        raise HarnessRefused(
            f"{WORKSPACE_VARIABLE}={named} is not a directory, so it cannot be the workspace."
        )
    return workspace


def advertised_problems(harness: HarnessSpec, answer: InitializeResponse) -> list[str]:
    """What the harness's spec asked that the agent, at ``initialize``, did not advertise."""
    problems: list[str] = []
    capabilities = answer.agent_capabilities
    acp = harness.acp
    if (
        acp is not None
        and acp.load_session
        and not (capabilities and capabilities.load_session)
    ):
        problems.append(
            f"{harness.name} advertises no loadSession, which its spec says it answers."
        )
    return problems


# -- MCP, lent through the gateway (§4.4, SH-14) ------------------------------------------


@dataclass(frozen=True)
class LentToolset:
    """A toolset of the Datalayer MCP gateway an application connects, lent to its harness."""

    #: The connection's server id: what the harness sees the server named,
    #: and what the policy's ``mcp.allow`` lists.
    name: str
    #: The gateway toolset's URL (``…/mcp?only=earthdata``).
    url: str


#: What a harness spec's ``acp.mcp`` may say.
MCP_MODES = ("lend", "own", "none")


def lent_toolsets(harness: HarnessSpec, app: Any = None) -> list[LentToolset]:
    """
    The gateway toolsets ``app`` connects, as the harness is lent them; refused where its spec says.

    ``lend`` lends each connection that is a toolset of the gateway, with the
    execution credential at session time; ``own`` leaves the agent its native
    tools and lends none; ``none`` lends none and refuses an application that
    connects any. A connection to a server that is not the gateway is refused:
    a harness is lent the gateway's toolsets only, never a server of its own,
    so the gateway's policy, approvals, custody and audit apply to every tool
    it calls.

    Parameters
    ----------
    harness : HarnessSpec
        The catalogue's spec.
    app : AppSpec, optional
        The application; none for an agent run outside one.

    Returns
    -------
    list[LentToolset]
        The toolsets, in the order the application connects them, each once.
    """
    mode = harness.acp.mcp if harness.acp is not None else "none"
    if mode not in MCP_MODES:
        raise HarnessRefused(
            f"The harness {harness.id!r} says acp.mcp: {mode!r}, which is not one of "
            f"{', '.join(MCP_MODES)}."
        )
    connected: list[str] = []
    for connection in getattr(app, "connections", None) or []:
        server_id = str(getattr(connection, "server", "") or "").partition(":")[0]
        if server_id and server_id not in connected:
            connected.append(server_id)
    if mode == "none":
        if connected:
            raise HarnessRefused(
                f"{harness.name} is lent no MCP (its spec says acp.mcp: none), and the "
                f"application connects {', '.join(connected)}: drop the connections, or "
                "run it on a harness that takes them."
            )
        return []
    if mode == "own":
        return []
    lent: list[LentToolset] = []
    for server_id in connected:
        query = gateway_query(server_id)
        if query is None:
            raise HarnessRefused(
                f"The connection {server_id!r} is not a toolset of the Datalayer MCP "
                "gateway: a harness is lent the gateway's toolsets only (SHIELD §4.4)."
            )
        lent.append(
            LentToolset(
                name=server_id,
                url=f"{gateway_url()}?{query}" if query else gateway_url(),
            )
        )
    return lent


# -- the audit, written to the record ----------------------------------------------------


class RecordAudit:
    """The Shield's audit rows as the application's record (SHIELD §6.4, SH-18).

    The proxy writes one row per decision, action and answer, in the
    package's vocabulary (A-01's with ACP's kinds); here each becomes an
    entry of the record the session API and Activity read — a ``decision``
    for what a policy decided, a ``tool_call`` for what was done, an
    ``approval`` for what the person answered — and the record keeps what
    its ``record.include`` names. Without a recorder (``loop --harness``
    outside an application) the rows are logged and kept here for the
    terminal.
    """

    KEPT = 500

    def __init__(
        self,
        recorder: Any = None,
        runtime_session_of: Callable[[str], Optional[str]] = lambda _: None,
    ) -> None:
        """Keep the recorder, and how an ACP session maps to the runtime's."""
        self.recorder = recorder
        self.runtime_session_of = runtime_session_of
        self.rows: list[dict[str, Any]] = []

    def write(self, event: str, **fields: Any) -> dict[str, Any]:
        """Write one audit row: kept here, logged, and recorded when a recorder is."""
        row = {"event": event, **{k: v for k, v in fields.items() if v is not None}}
        self.rows.append(row)
        del self.rows[: -self.KEPT]
        logger.info(
            "shield %s: %s",
            event,
            fields.get("sentence") or fields.get("title") or fields.get("what") or "",
        )
        if self.recorder is None:
            return row
        session = self.runtime_session_of(str(fields.get("session") or ""))
        if not session:
            return row
        from agent_runtimes.loop.apps.record import _SESSION

        token = _SESSION.set(session)
        try:
            self._record(event, fields)
        finally:
            _SESSION.reset(token)
        return row

    def _record(self, event: str, fields: dict[str, Any]) -> None:
        """Write the row as the record's entry of the matching kind."""
        recorder = self.recorder
        title = str(
            fields.get("title") or fields.get("command") or fields.get("name") or event
        )
        decision = fields.get("decision")
        if event == "permission" and fields.get("by") == "person":
            recorder.answered(
                title,
                str(fields.get("sentence") or ""),
                "approved" if decision == "allow" else "declined",
                str(fields.get("chosen") or ""),
            )
            return
        if event == "refusal":
            recorder.add(
                "decision",
                str(fields.get("sentence") or ""),
                {
                    "tool": title,
                    "behaviour": VERDICT_BEHAVIOUR["deny"],
                    "because": "shield",
                    "classes": [],
                    "refused": str(fields.get("sentence") or ""),
                },
            )
            return
        if (
            decision in VERDICT_BEHAVIOUR
            and fields.get("by") in ("policy", "shield", None)
            and (fields.get("sentence") or event == "mcp")
        ):
            recorder.add(
                "decision",
                str(fields.get("sentence") or f"{title}: {decision}"),
                {
                    "tool": title,
                    "behaviour": VERDICT_BEHAVIOUR[decision],
                    "because": str(fields.get("decided_by") or event),
                    "classes": [fields["class"]] if fields.get("class") else [],
                    **{
                        key: fields[key]
                        for key in (
                            "kind",
                            "rule",
                            "scope",
                            "tool_call_id",
                            "status",
                            "path",
                            "command",
                        )
                        if fields.get(key) is not None
                    },
                },
            )
            return
        if event in ("tool_call", "fs_read", "fs_write", "terminal"):
            what = str(fields.get("status") or fields.get("what") or "done")
            recorder.add(
                "tool_call",
                f"{title}: {what}",
                {
                    "tool": title,
                    **{
                        key: fields[key]
                        for key in (
                            "tool_call_id",
                            "kind",
                            "status",
                            "what",
                            "diff",
                            "terminal_id",
                            "exit_code",
                            "signal",
                            "cwd",
                            "path",
                            "command",
                        )
                        if fields.get(key) is not None
                    },
                },
            )


# -- the runtime's face, what the inner client sees as its "client" -----------------------


class _RuntimeFace:
    """What the harness asks of its client, answered by the runtime through the agent."""

    def __init__(self, agent: ACPAgent) -> None:
        """Hold the agent the harness's requests are answered through."""
        self.agent = agent
        # The proxy's inner client reaches `client._conn.send_request` for an
        # elicitation; the runtime answers it here.
        self._conn = self

    async def session_update(self, session_id: str, update: Any, **kwargs: Any) -> None:
        """Queue an update the inner client let through, as a neutral event."""
        self.agent._take(session_id, normalize(session_id, update))

    async def request_permission(
        self,
        options: list[PermissionOption],
        session_id: str,
        tool_call: ToolCallUpdate,
        **kwargs: Any,
    ) -> RequestPermissionResponse:
        """Raise a permission the policy said to ask about through the runtime's approvals."""
        return await self.agent._person_answers(session_id, tool_call, options)

    async def send_request(self, method: str, params: Mapping[str, Any]) -> Any:
        """Answer ``elicitation/create``; no other request is made of this face."""
        if method == "elicitation/create":
            return await self.agent._question(dict(params))
        raise RequestError.method_not_found(method)

    async def ext_method(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Refuse an extension method: the runtime offers the harness none."""
        raise RequestError.method_not_found(f"_{method}")

    async def ext_notification(self, method: str, params: dict[str, Any]) -> None:
        """Hear an extension notification and do nothing with it."""
        return None


# -- the agent ------------------------------------------------------------------------------


class ACPAgent(BaseAgent, ShieldProxy):
    """A harness, driven over ACP, as a Datalayer agent (see the module)."""

    def __init__(
        self,
        *,
        agent_id: str,
        harness: HarnessSpec,
        command: Sequence[str],
        workspace: Path,
        policies: Sequence[Policy] | None = None,
        environment: Mapping[str, str] | None = None,
        lent: Sequence[LentToolset] = (),
        credential: str = "",
        approvals: ToolApprovalManager | None = None,
        recorder: Any = None,
        name: str = "",
        description: str = "",
        state_store: Any = None,
    ) -> None:
        """Build the agent on a harness, its command resolved, its policies given."""
        self._agent_id = agent_id
        self.harness = harness
        self._name = name or harness.name
        self._description = description or harness.description
        #: The gateway toolsets the application connects, lent at each
        #: session with the run's credential (§4.4); nothing without one.
        self.lent = list(lent)
        #: The caller's token, kept for a run that carries none of its own.
        self.credential = credential
        self._handles: list[str] = []
        self.approvals = approvals
        self.recorder = recorder
        self.state_store = state_store
        self.advertised: InitializeResponse | None = None
        self._face = _RuntimeFace(self)
        self._queues: dict[str, asyncio.Queue[Any]] = {}
        self._acp_of: dict[str, str] = {}
        self._runtime_of: dict[str, str] = {}
        self._titles: dict[str, str] = {}
        self._replayed: dict[str, int] = {}
        self._cancelled: dict[str, asyncio.Event] = {}
        self._failures: dict[str, str] = {}
        loaded = [
            LoadedPolicy(policy=policy, origin=_origin_of(policy))
            for policy in (policies if policies is not None else policies_of(None))
        ]
        ShieldProxy.__init__(
            self,
            list(command),
            policies=loaded,
            audit=RecordAudit(recorder, self._runtime_of.get),
            workspace=workspace,
            agent_env=dict(environment or {}),
        )

    # -- BaseAgent ---------------------------------------------------------------------

    @property
    def name(self) -> str:
        """The agent's name: the request's, else the harness's."""
        return self._name

    @property
    def description(self) -> str:
        """The agent's description: the request's, else the harness's."""
        return self._description

    @property
    def version(self) -> str:
        """The adapter's pinned version, as the register has it."""
        return self.harness.registered.version or "0"

    @property
    def agent_id(self) -> str:
        """The id the runtime registered the agent under."""
        return self._agent_id

    @property
    def workspace(self) -> Path:
        """The workspace the harness runs in (SHIELD §4.6)."""
        assert self.pinned_workspace is not None
        return self.pinned_workspace.root

    def get_tools(self) -> list[ToolDefinition]:
        """No tools of its own: a harness's native tools are its own, the lent ones the gateway's."""
        # The harness's native tools are its own (§4.6); the lent ones are the gateway's.
        return []

    @property
    def client(self) -> Any:  # type: ignore[override]
        """The face the inner client answers to: the runtime's, not an ACP client."""
        return self._face

    @property
    def started(self) -> bool:
        """Whether the harness's process is running."""
        return self._channel is not None

    async def initialize(self) -> None:
        """Launch the harness and negotiate; refuse what its spec asked that it lacks."""
        if self.started:
            return
        try:
            channel = await self.start_agent()
        except (OSError, RuntimeError) as exc:
            raise HarnessRefused(
                f"{self.harness.name} did not start ({self.command[0]}): {exc}"
            ) from None
        try:
            answer = await channel.initialize(
                client_capabilities=SHIELD_CLIENT_CAPABILITIES,
                client_info=RUNTIME_CLIENT_INFO,
            )
        except Exception as exc:
            await self.stop_agent()
            raise HarnessRefused(
                f"{self.harness.name} did not answer initialize: {exc}"
            ) from None
        problems = advertised_problems(self.harness, answer)
        if problems:
            await self.stop_agent()
            raise HarnessRefused(" ".join(problems))
        self.advertised = answer
        agent = answer.agent_info
        logger.info(
            "Harness %s started: %s %s, shield %s, workspace %s",
            self.harness.id,
            agent.name if agent else self.command[0],
            agent.version if agent else "",
            shield_version,
            self.workspace,
        )

    async def cleanup(self) -> None:
        """Cancel every open turn and end the harness's process."""
        if self._channel is not None:
            for session_id in list(self.sessions):
                with contextlib.suppress(Exception):
                    await self._channel.cancel(session_id)
        for queue in self._queues.values():
            queue.put_nowait(_TURN_ENDED)
        await self.stop_agent()
        self.sessions.clear()
        self.advertised = None
        self._release_lent()

    async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
        """One turn, collected: the text, the tool calls and their results."""
        text: list[str] = []
        calls: list[ToolCall] = []
        results: list[ToolResult] = []
        metadata: dict[str, Any] = {}
        async for event in self.stream(prompt, context):
            if event.type == "text":
                text.append(str(event.data))
            elif event.type == "tool_call":
                data = event.data
                calls.append(
                    ToolCall(
                        id=str(data["id"]),
                        name=str(data["name"]),
                        arguments=dict(data.get("arguments") or {}),
                    )
                )
            elif event.type == "tool_result":
                data = event.data
                results.append(
                    ToolResult(
                        tool_call_id=str(data["id"]),
                        result=data.get("result"),
                        error=data.get("error"),
                    )
                )
            elif event.type == "done":
                metadata.update(event.data or {})
            elif event.type == "error":
                metadata["error"] = str(event.data)
        return AgentResponse(
            content="".join(text),
            tool_calls=calls,
            tool_results=results,
            metadata=metadata,
        )

    async def stream(
        self, prompt: str, context: AgentContext
    ) -> AsyncIterator[StreamEvent]:
        """One turn: the harness's updates as the runtime's events, then ``done``."""
        if not self.started:
            await self.initialize()
        runtime_session = context.session_id
        queue: asyncio.Queue[Any] = asyncio.Queue()
        said: list[str] = []
        status = "answered"
        acp_session = ""
        turn: asyncio.Task[PromptResponse] | None = None
        try:
            acp_session, opening = await self._session_for(context, queue)
            self._queues[acp_session] = queue
            self._cancelled[acp_session] = asyncio.Event()
            self._failures.pop(acp_session, None)
            if self.recorder is not None:
                self.recorder.start(runtime_session)
                self.recorder.ran(runtime_session)
            for event in opening:
                yield event
            turn = asyncio.create_task(
                ShieldProxy.prompt(self, [text_block(prompt)], acp_session),
                name=f"harness.{self._agent_id}.{acp_session}",
            )
            turn.add_done_callback(lambda _: queue.put_nowait(_TURN_ENDED))
            while True:
                item = await queue.get()
                if item is _TURN_ENDED:
                    break
                for event in self._events_of(item, acp_session):
                    if event.type == "text":
                        said.append(str(event.data))
                    yield event
            answer = turn.result()
            failed = self._failures.pop(acp_session, None)
            ended: dict[str, Any] = {
                "stop_reason": answer.stop_reason,
                "session_id": acp_session,
            }
            if failed:
                ended["sentence"] = failed
                status = "stopped"
            yield StreamEvent(type="done", data=ended)
        except (asyncio.CancelledError, GeneratorExit):
            status = "gone"
            if acp_session:
                await self._cancel_turn(acp_session, turn)
            raise
        except RequestError as exc:
            status = "stopped"
            sentence = f"{self.harness.name} refused the turn: {_message_of(exc)}"
            self._failures.pop(acp_session, None)
            yield StreamEvent(type="error", data=sentence)
        except HarnessRefused as refused:
            status = "stopped"
            yield StreamEvent(type="error", data=str(refused))
        finally:
            self._queues.pop(acp_session, None)
            self._cancelled.pop(acp_session, None)
            if self.recorder is not None:
                await self._record_end(runtime_session, prompt, "".join(said), status)

    # -- sessions (§4.8) -----------------------------------------------------------------

    async def _session_for(
        self, context: AgentContext, queue: asyncio.Queue[Any]
    ) -> tuple[str, list[StreamEvent]]:
        """The harness's session for the runtime's: kept, loaded, or new and said so."""
        runtime_session = context.session_id
        known = self._acp_of.get(runtime_session)
        if known and known in self.sessions:
            return known, []
        kept = known or await self._kept_session(runtime_session)
        # What the session is lent: the gateway's toolsets with the run's
        # credential, in the shape the harness takes (§4.4, SH-14).
        servers = self._lent_servers(self._bearer_of(context))
        if kept and self.loads_sessions:
            # The agent replays what it kept; the queue holds it for the comparison.
            self._queues[kept] = queue
            self._runtime_of[kept] = runtime_session
            self._replayed[kept] = 0
            try:
                await self.load_session(str(self.workspace), servers, kept)
            except RequestError as exc:
                self.sessions.pop(kept, None)
                self._queues.pop(kept, None)
                return await self._new_session(
                    runtime_session,
                    f"{self.harness.name} could not load its session {kept} ({_message_of(exc)}): "
                    "it starts over; the earlier turns of this conversation were not replayed to it.",
                    servers,
                )
            await self._channel_drain(kept)
            self._acp_of[runtime_session] = kept
            self._replayed.pop(kept, None)
            # What the agent replayed is for the comparison, never the new
            # turn's answer: counted, then let go.
            replayed = 0
            while not queue.empty():
                if isinstance(queue.get_nowait(), UserText):
                    replayed += 1
            turns = sum(
                1 for m in context.conversation_history if _role_of(m) == "user"
            )
            opening: list[StreamEvent] = []
            if replayed != turns:
                opening.append(
                    _said(
                        f"{self.harness.name} replayed {replayed} turn(s) of its session {kept}; "
                        f"the record holds {turns}: they differ."
                    )
                )
            return kept, opening
        sentence = ""
        if kept and not self.loads_sessions:
            sentence = (
                f"{self.harness.name} advertises no loadSession, so its session {kept} cannot be loaded: "
                "it starts over; the earlier turns of this conversation were not replayed to it."
            )
        elif context.conversation_history:
            sentence = (
                f"{self.harness.name}'s session is new: it starts over; the earlier turns of this "
                "conversation were not replayed to it."
            )
        return await self._new_session(runtime_session, sentence, servers)

    async def _new_session(
        self, runtime_session: str, sentence: str, servers: list[Any]
    ) -> tuple[str, list[StreamEvent]]:
        """Open a session in the workspace, keep its id, and say ``sentence`` first when there is one."""
        answer = await self.new_session(str(self.workspace), servers)
        acp_session = answer.session_id
        self._acp_of[runtime_session] = acp_session
        self._runtime_of[acp_session] = runtime_session
        await self._keep_session(runtime_session, acp_session)
        return acp_session, [_said(sentence)] if sentence else []

    # -- MCP lent (§4.4, SH-14) ----------------------------------------------------------------

    @property
    def lends_over_http(self) -> bool:
        """Whether the harness advertised ``mcpCapabilities.http``: lent as HTTP, else over the stdio shim."""
        capabilities = self.advertised.agent_capabilities if self.advertised else None
        mcp = capabilities.mcp_capabilities if capabilities else None
        return bool(mcp and mcp.http)

    def _bearer_of(self, context: AgentContext) -> str:
        """The credential this run reaches the gateway with: a deployment's principal, else the run's, else the caller's."""
        from agent_runtimes.loop.apps.principal import deployment_of, principal_token
        from agent_runtimes.models.models import app_instance_of

        deployment = deployment_of(app_instance_of(self._agent_id))
        if deployment:
            held = principal_token(deployment)
            if held:
                return held
        return str(context.metadata.get("user_token") or "") or self.credential

    def _lent_servers(self, bearer: str) -> list[Any]:
        """The lent toolsets as ``session/new.mcpServers``: HTTP with the bearer, or the stdio shim holding it."""
        if not self.lent:
            return []
        names = ", ".join(item.name for item in self.lent)
        if not bearer:
            raise HarnessRefused(
                f"{self.harness.name} is lent {names}, and this run carries no credential "
                "to reach the gateway with: nothing is lent without one (SHIELD §4.4)."
            )
        servers: list[Any] = []
        for item in self.lent:
            if self.lends_over_http:
                servers.append(
                    HttpMcpServer(
                        type="http",
                        name=item.name,
                        url=item.url,
                        headers=[
                            HttpHeader(name="Authorization", value=f"Bearer {bearer}")
                        ],
                    )
                )
                continue
            # The credential stays in the runtime's hands: the shim reads it
            # from the Shield's home by an opaque handle, never from the
            # harness's arguments or environment.
            handle = hold(item.name, item.url, bearer)
            self._handles.append(handle)
            servers.append(
                StdioMcpServer(
                    name=item.name,
                    command=sys.executable,
                    args=["-m", "agent_runtimes.mcp.lent_stdio", "--lent", handle],
                    env=[],
                )
            )
        return servers

    def _release_lent(self) -> None:
        """Forget what the stdio shims were lent."""
        for handle in self._handles:
            release(handle)
        self._handles.clear()

    @property
    def loads_sessions(self) -> bool:
        """Whether the harness advertised ``loadSession``."""
        capabilities = self.advertised.agent_capabilities if self.advertised else None
        return bool(capabilities and capabilities.load_session)

    async def _channel_drain(self, session_id: str) -> None:
        """Wait until every update received for the session was handled."""
        if self._channel is not None:
            await self._channel.drain(session_id)

    async def _kept_session(self, runtime_session: str) -> str | None:
        """The harness's session kept for the runtime's, from the protocol state store."""
        if self.state_store is None:
            return None
        record = await self.state_store.get(
            HARNESS_SESSION_KIND, f"{self._agent_id}:{runtime_session}"
        )
        return str(record.get("acp_session_id") or "") or None if record else None

    async def _keep_session(self, runtime_session: str, acp_session: str) -> None:
        """Keep the harness's session for the runtime's in the protocol state store."""
        if self.state_store is None:
            return
        await self.state_store.put(
            HARNESS_SESSION_KIND,
            f"{self._agent_id}:{runtime_session}",
            {
                "acp_session_id": acp_session,
                "harness": self.harness.id,
                "workspace": str(self.workspace),
            },
        )

    async def _cancel_turn(
        self, acp_session: str, turn: asyncio.Task[Any] | None
    ) -> None:
        """Cancel the turn: pending approvals answer ``cancelled``, the agent is told, the task ends."""
        cancelled = self._cancelled.get(acp_session)
        if cancelled is not None:
            cancelled.set()
        with contextlib.suppress(Exception):
            await self.cancel(acp_session)
        if turn is not None and not turn.done():
            with contextlib.suppress(Exception, asyncio.CancelledError):
                await asyncio.wait_for(turn, timeout=5.0)
        if turn is not None and not turn.done():
            turn.cancel()

    async def _record_end(
        self, runtime_session: str, asked: str, answered: str, status: str
    ) -> None:
        """Keep the turn and the run's end in the record, and send it; never fails the run."""
        recorder = self.recorder
        from agent_runtimes.loop.apps.record import _SESSION

        token = _SESSION.set(runtime_session)
        try:
            if status == "answered":
                recorder.turned(asked, answered)
            recorder.ended(
                status,
                answered[:300]
                if status == "answered"
                else f"Stopped: {answered[:300]}",
                {"length": len(answered), "harness": self.harness.id},
            )
            await recorder.flush(runtime_session)
        except Exception as error:  # noqa: BLE001 - a record is never worth a run
            logger.warning("The record of the harness's turn was not kept: %s", error)
        finally:
            _SESSION.reset(token)

    # -- what the inner client hands up ---------------------------------------------------

    def _take(self, session_id: str, event: Event) -> None:
        """An update the inner client let through (decided, classed), queued for the stream."""
        queue = self._queues.get(session_id)
        if queue is None:
            logger.debug(
                "update for session %s with no stream open: %s", session_id, event.event
            )
            return
        queue.put_nowait(event)

    async def fail_turn(self, session: SessionState, sentence: str) -> None:  # type: ignore[override]
        """End the turn with the sentence, kept for the ``done`` event."""
        self._failures[session.session_id] = sentence
        await ShieldProxy.fail_turn(self, session, sentence)

    def _events_of(self, event: Event, session_id: str) -> list[StreamEvent]:
        """Map one neutral event onto the runtime's ``StreamEvent``(s) (§4.1's table)."""
        if isinstance(event, TextDelta):
            return [StreamEvent(type="text", data=event.text)]
        if isinstance(event, ThoughtDelta):
            return [StreamEvent(type="thought", data=event.text)]
        if isinstance(event, UserText):
            # A replay of what the person said (`session/load`): compared in
            # `_session_for`, never shown as the harness's words.
            return []
        if isinstance(event, ToolCallSaid):
            self._titles[event.tool_call_id] = event.title
            decision = (
                self.sessions[session_id].decisions.get(event.tool_call_id)
                if session_id in self.sessions
                else None
            )
            return [
                StreamEvent(
                    type="tool_call",
                    data={
                        "id": event.tool_call_id,
                        "name": event.title,
                        "arguments": event.input
                        if isinstance(event.input, dict)
                        else {"input": event.input},
                        "kind": event.kind,
                        "status": event.status,
                        "awaiting": "approval" if event.awaiting else None,
                        "locations": [item.model_dump() for item in event.locations],
                        "display": [item.model_dump() for item in event.displays],
                        **({"decision": decision.sentence} if decision else {}),
                    },
                )
            ]
        if isinstance(event, ToolCallUpdated):
            title = event.title or self._titles.get(
                event.tool_call_id, event.tool_call_id
            )
            displays = [item.model_dump() for item in event.displays]
            if event.status in ("completed", "failed"):
                return [
                    StreamEvent(
                        type="tool_result",
                        data={
                            "id": event.tool_call_id,
                            "name": title,
                            "result": event.output,
                            "status": event.status,
                            "display": displays,
                            **(
                                {"error": self._failures.get(session_id) or "failed"}
                                if event.status == "failed"
                                else {}
                            ),
                        },
                    )
                ]
            return [
                StreamEvent(
                    type="tool_call",
                    data={
                        "id": event.tool_call_id,
                        "name": title,
                        "arguments": event.input
                        if isinstance(event.input, dict)
                        else {},
                        "kind": event.kind,
                        "status": event.status or "in_progress",
                        "awaiting": None,
                        "display": displays,
                    },
                )
            ]
        if isinstance(event, PlanUpdated):
            return [
                StreamEvent(
                    type="plan",
                    data={"steps": [step.model_dump() for step in event.steps]},
                )
            ]
        if isinstance(event, CommandsUpdated):
            return [
                StreamEvent(
                    type="commands", data=[item.model_dump() for item in event.commands]
                )
            ]
        if isinstance(event, ModeChanged):
            return [StreamEvent(type="mode", data={"mode_id": event.mode_id})]
        if isinstance(event, SessionInfo):
            return [StreamEvent(type="session_info", data=dict(event.info))]
        # The package's own events (permission, question, shield_action, turn_ended)
        # are never handed up by `normalize`: nothing is guessed into a row.
        raise RuntimeError(f"no StreamEvent for the harness event {event.event!r}")

    # -- permissions (§4.5, SH-12) -------------------------------------------------------------

    async def _person_answers(
        self,
        session_id: str,
        tool_call: ToolCallUpdate,
        options: Sequence[PermissionOption],
    ) -> RequestPermissionResponse:
        """A request the policy said *ask me first* about: raised through the runtime's approvals."""
        session = self.sessions.get(session_id)
        decision = session.decisions.get(tool_call.tool_call_id) if session else None
        sentence = decision.sentence if decision else _content_text(tool_call)
        title = tool_call.title or tool_call.tool_call_id
        self._take(
            session_id,
            ToolCallSaid(
                session_id=session_id,
                tool_call_id=tool_call.tool_call_id,
                title=title,
                kind=tool_call.kind or "other",
                status="pending",
                input={
                    "sentence": sentence,
                    **(
                        tool_call.raw_input
                        if isinstance(tool_call.raw_input, dict)
                        else {}
                    ),
                },
                awaiting=True,
            ),
        )
        if self.approvals is None:
            await self.tell(
                session_id, f"{sentence}; nobody is here to ask, so it is not done."
            )
            return _refusing(options)
        cancelled = self._cancelled.get(session_id) or asyncio.Event()
        waiting = asyncio.ensure_future(
            self.approvals.request_and_wait(
                title,
                {
                    "kind": tool_call.kind,
                    "sentence": sentence,
                    **(
                        tool_call.raw_input
                        if isinstance(tool_call.raw_input, dict)
                        else {}
                    ),
                },
                tool_call_id=f"{session_id}:{tool_call.tool_call_id}",
            )
        )
        stopped = asyncio.ensure_future(cancelled.wait())
        try:
            await asyncio.wait({waiting, stopped}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            stopped.cancel()
        if not waiting.done():
            waiting.cancel()
            with contextlib.suppress(BaseException):
                await waiting
            return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))
        try:
            result = waiting.result()
        except ToolApprovalRejectedError as refused:
            await self.tell(
                session_id,
                f"{title}: declined"
                + (f" — {refused.note}" if getattr(refused, "note", None) else ""),
            )
            return _refusing(options)
        except ToolApprovalTimeoutError:
            await self.tell(
                session_id, f"{title}: not answered in time, so it is not done."
            )
            return _refusing(options)
        note = await self._note_of(result.get("id"))
        # The page's approval has approve and reject; a person who writes
        # "always" in the note chooses the agent's allow_always, which the
        # proxy turns into a session rule (decision 7).
        wanted = (
            ("allow_always", "allow_once")
            if "always" in note.lower()
            else ("allow_once", "allow_always")
        )
        option = _select(options, *wanted)
        if option is None:
            return _refusing(options)
        return RequestPermissionResponse(
            outcome=AllowedOutcome(outcome="selected", option_id=option.option_id)
        )

    @staticmethod
    async def _note_of(approval_id: Any) -> str:
        """The note the person wrote on the approval, or an empty string."""
        if not approval_id:
            return ""
        from agent_runtimes.routes.tool_approvals import _get_approval

        try:
            record = await _get_approval(str(approval_id))
        except Exception:  # noqa: BLE001 - a note is an extra, the answer stands
            return ""
        return str(record.note or "")

    async def _question(self, params: dict[str, Any]) -> dict[str, Any]:
        """``elicitation/create``: shown as a question; answering one from the page is not built."""
        session_id = str(params.get("sessionId") or "")
        message = str(params.get("message") or "")
        self._take(
            session_id,
            TextDelta(
                session_id=session_id,
                text=f"{SHIELD_PREFIX}{self.harness.name} asks: {message}",
            ),
        )
        await self.tell(
            session_id,
            "answering a harness's question is not built (SHIELD §4.1, elicitation): it was declined.",
        )
        return {"action": "decline"}


def _message_of(exc: RequestError) -> str:
    """The message of a JSON-RPC error, without its code."""
    return str(exc.args[1]) if len(exc.args) > 1 else str(exc)


def _origin_of(policy: Policy) -> str:
    """Where a policy came from, for the audit."""
    return (
        "the application's Rules"
        if policy.scope == "team"
        else "the platform's default (decision 5)"
    )


def _role_of(message: Any) -> str:
    """The role of a message of the conversation, whatever its shape."""
    if isinstance(message, Mapping):
        return str(message.get("role") or "")
    return str(getattr(message, "role", "") or "")


def _said(sentence: str) -> StreamEvent:
    """A sentence said as the Shield's text."""
    return StreamEvent(type="text", data=f"{SHIELD_PREFIX}{sentence}")


def _content_text(tool_call: ToolCallUpdate) -> str:
    """The text a tool call's content carries, else its title."""
    for item in tool_call.content or []:
        content = getattr(item, "content", None)
        text = getattr(content, "text", None)
        if isinstance(text, str):
            return text
    return tool_call.title or tool_call.tool_call_id


def _select(
    options: Sequence[PermissionOption], *kinds: str
) -> PermissionOption | None:
    """The first option of one of ``kinds``, in that order of preference."""
    for kind in kinds:
        for option in options:
            if option.kind == kind:
                return option
    return None


def _refusing(options: Sequence[PermissionOption]) -> RequestPermissionResponse:
    """The answer that refuses: ``reject_once``, else ``reject_always``, else ``cancelled``."""
    option = _select(options, "reject_once", "reject_always")
    if option is None:
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))
    return RequestPermissionResponse(
        outcome=AllowedOutcome(outcome="selected", option_id=option.option_id)
    )


# -- building one from the catalogue --------------------------------------------------------


def harness_agent(
    agent_id: str,
    harness_id: str,
    *,
    app: Any = None,
    recorder: Any = None,
    approvals: ToolApprovalManager | None = None,
    credential: str = "",
    name: str = "",
    description: str = "",
    environment: Mapping[str, str] | None = None,
    workspace: Path | None = None,
    state_store: Any = None,
) -> ACPAgent:
    """An ``ACPAgent`` on a catalogue harness, resolved here: not yet started.

    Parameters
    ----------
    credential : str
        The caller's token, which a run that carries none of its own reaches
        the gateway with (§4.4).

    Raises
    ------
    HarnessRefused
        An unknown harness, one with no launch command, an adapter not
        installed, a declared secret missing, no workspace, or a connection
        its spec's ``acp.mcp`` refuses — each in a sentence.
    """
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    harness = HARNESS_CATALOGUE.get(harness_id)
    if harness is None:
        raise HarnessRefused(
            f"There is no harness named {harness_id!r}: one of {', '.join(sorted(HARNESS_CATALOGUE))}."
        )
    lent = lent_toolsets(harness, app)
    return ACPAgent(
        agent_id=agent_id,
        harness=harness,
        command=launch_command(harness),
        workspace=workspace or harness_workspace(environment),
        policies=policies_of(app, [item.name for item in lent]),
        environment=harness_environment(harness, environment),
        lent=lent,
        credential=credential,
        approvals=approvals,
        recorder=recorder,
        name=name,
        description=description,
        state_store=state_store,
    )


__all__ = [
    "HARNESS_SESSION_KIND",
    "MCP_MODES",
    "REFUSED",
    "RUNTIME_CLIENT_INFO",
    "WORKSPACE_VARIABLE",
    "ACPAgent",
    "HarnessRefused",
    "LentToolset",
    "RecordAudit",
    "advertised_problems",
    "harness_agent",
    "harness_environment",
    "harness_workspace",
    "launch_command",
    "lent_toolsets",
]
