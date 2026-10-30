# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness as a Datalayer agent: ``ACPAgent(BaseAgent)`` on ``agent_shield.acp`` (SH-10).

A **harness** — Claude Code, Codex, any program speaking the Agent Client
Protocol — is launched in the runtime as a subprocess over stdio and driven
as the runtime drives its own agents: ``initialize`` launches it from its
spec and negotiates (protocol version 1, the client's ``fs`` and ``terminal``
capabilities on, answered here); ``stream`` opens or loads a session in the
workspace, prompts, and turns every ``session/update`` into the runtime's
``StreamEvent``s (the event table); ``cleanup`` cancels and ends the process.

The engine is the ``agent-shield`` package's, hosted and never copied:
this class **is** a :class:`agent_shield.acp.proxy.ShieldProxy`
whose outer face is a Datalayer agent instead of an ACP client — the same
inner client classes the harness's tool calls, decides them by the policies
(the application's Rules, then the platform's default), answers ``fs/*`` and
``terminal/*`` against the workspace, counts the limits, and turns
``allow_always`` into a session rule. What agent-runtimes adds:

- the mapping of the package's neutral events onto ``StreamEvent``s;
- ``session/request_permission`` raised through the runtime's tool approvals
  (Waiting for you, ai-agents ``/ws``, ``GET /tool-approvals/{id}``), the
  person's answer handed back to the harness (SH-12); a turn cancelled
  while it waits answers ``cancelled``;
- the Shield's audit written to the application's record (SH-18);
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
import time
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
    McpServerStdio,
    PermissionOption,
    PromptResponse,
    RequestPermissionResponse,
    ToolCallUpdate,
)
from agent_shield.__version__ import __version__ as shield_version
from agent_shield.acp import SHIELD_CLIENT_CAPABILITIES, normalize
from agent_shield.acp.credential import fingerprint, lent_with
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
from agent_shield.audit import diff_summary, redacted_row
from agent_shield.config import harness_bin, harness_prefix
from agent_shield.policy import Action, Decision, LoadedPolicy, Policy, Rule
from agent_shield.register import EXECUTABLES
from agent_shield.tracing import observe, trace_headers, turn_span

from agent_runtimes._version import __version__
from agent_runtimes.guardrails.managed_policies import runtime_policies
from agent_runtimes.guardrails.session_rules import session_rules
from agent_runtimes.guardrails.shield_authorizer import companies_of
from agent_runtimes.guardrails.shield_policy import (
    VERDICT_BEHAVIOUR,
    PolicyUnavailable,
    harness_refusal,
    policies_in_force,
    policies_of,
)
from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
)
from agent_runtimes.mcp.datalayer_gateway import gateway_query, gateway_url
from agent_runtimes.mcp.lent_stdio import carry, hold, release
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
from .harness_displays import display_meta_of
from .harness_skills import LentFiles, kept_said, lend_repository, write_lent_files

logger = logging.getLogger(__name__)

#: What the runtime tells a harness it is.
RUNTIME_CLIENT_INFO = Implementation(
    name="agent-runtimes", title="Datalayer Agent Runtimes", version=__version__
)

#: Where a harness's workspace is: the runtime's own. The same
#: variable the runtime's codemode workspace reads; ``loop --harness`` sets it
#: to the directory it runs in.
WORKSPACE_VARIABLE = "AGENT_RUNTIMES_WORKSPACE_ROOT"

#: The kind the protocol state store keeps a harness's session under, so a
#: runtime restarted finds the session to load.
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
    never fetched at first run: it is looked for where
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

    On Datalayer, a harness whose model calls go through ai-inference
    (``adapters.harness_inference``: Claude Code) is not given its key: it is
    given ai-inference's Anthropic route as ``ANTHROPIC_BASE_URL`` and the
    runtime's ai-inference token as ``ANTHROPIC_AUTH_TOKEN`` (set again when
    the harness starts, :meth:`ACPAgent.initialize`, since a runtime is given
    its token when it is assigned).
    """
    from agent_runtimes.adapters import harness_inference

    source = os.environ if environment is None else environment
    given: dict[str, str] = dict(harness.acp.env) if harness.acp else {}
    route = harness_inference.route_of(harness.id, source)
    routed = route.secret if route else None
    required = [name for name in harness.requires.secrets if name != routed]
    missing = [name for name in required if not source.get(name)]
    if missing:
        raise HarnessRefused(
            f"{harness.name} needs {', '.join(missing)} in the environment "
            f"({harness.registered.credential}), and it is not set."
        )
    for name in required:
        given[name] = source[name]
    # A harness that would act before asking is made to ask the Shield for
    # every step (OpenCode allows its tools by default); a routed harness's
    # configuration below carries the same asking.
    asking = harness_inference.asking_config(harness.id)
    if asking:
        given[asking[0]] = asking[1]
    if route:
        given[route.base_url_variable] = harness_inference.base_url(route, source)
        token, _ = harness_inference.routed_token()
        if token:
            given[route.token_variable] = token
            if route.config_variable:
                given[route.config_variable] = harness_inference.inline_config(
                    route, given[route.base_url_variable], token
                )
    installed = installed_bin(harness)
    if installed is not None:
        # An adapter installed in the Shield's prefix finds the program it
        # spawns beside itself: pi-acp runs `pi` from the PATH.
        given["PATH"] = os.pathsep.join(
            [
                str(installed),
                *(p for p in source.get("PATH", "").split(os.pathsep) if p),
            ]
        )
    return given


def installed_bin(harness: HarnessSpec, *, home: Path | None = None) -> Path | None:
    """The Shield-prefix ``bin`` directory the harness launches from, or ``None``
    when it launches from the PATH, or cannot launch here.
    """
    try:
        command = launch_command(harness, home=home)
    except HarnessRefused:
        return None
    executable = Path(command[0])
    if harness.acp is None or harness.acp.command != "npx":
        return None
    prefix = harness_prefix(harness.id, harness.registered.version, home)
    return executable.parent if prefix in executable.parents else None


#: Where the pod's `datalayer-harnesses` sidecar listens, when the operator added one (SH-40).
SIDECAR_VARIABLE = "AGENT_RUNTIMES_HARNESS_SIDECAR_URL"


def sidecar_url(environment: Mapping[str, str] | None = None) -> str | None:
    """The sidecar bridge's base URL (``ws://127.0.0.1:8788``), or ``None`` when the harness runs here.

    A value that is not a ``ws://`` or ``wss://`` URL is refused: the bridge
    is reached over the WebSocket channel and nothing else.
    """
    source = os.environ if environment is None else environment
    named = source.get(SIDECAR_VARIABLE, "").strip().rstrip("/")
    if not named:
        return None
    if not named.startswith(("ws://", "wss://")):
        raise HarnessRefused(
            f"{SIDECAR_VARIABLE}={named!r} is not a ws:// or wss:// URL, so the sidecar bridge cannot be reached."
        )
    return named


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


#: What a `_meta` key must say to be read as the vendor's own session id (MH-05).
_SESSION_ID_WORDS = ("session", "thread", "conversation")


def native_session_id_of(harness: HarnessSpec, meta: Any) -> str | None:
    """The vendor's own session id from ``session/new``'s ``_meta``, when the
    harness's spec says the adapter exposes it (``acp.native_session: meta``);
    ``None`` — said absent, and logged — when the spec says so or the adapter
    gave none.
    """
    acp = harness.acp
    if acp is None or str(acp.native_session) != "meta":
        return None
    if isinstance(meta, Mapping):
        for key, value in meta.items():
            if (
                isinstance(value, str)
                and value.strip()
                and any(word in str(key).lower() for word in _SESSION_ID_WORDS)
            ):
                return value.strip()
    logger.warning(
        "%s's spec says its adapter exposes the vendor's session id in _meta, and it did not: the drill's claim drifted",
        harness.name,
    )
    return None


def own_and_since(
    history: Sequence[Mapping[str, Any]], spec_id: str
) -> tuple[list[Mapping[str, Any]], str]:
    """A conversation split for a swap back (MH-04): the person's turns that
    are this agent's own (tagged ``agent``, or untagged — the agent's when it
    was the only one), and the turns since it was swapped away, as text.
    """
    own: list[Mapping[str, Any]] = []
    since: list[str] = []
    after_own = False
    for message in history:
        role = _role_of(message)
        agent = str(message.get("agent") or "")
        if role == "user" and (not agent or agent == spec_id) and not after_own:
            own.append(message)
            continue
        if role == "user" and agent and agent != spec_id:
            after_own = True
        if after_own and role in ("user", "assistant"):
            text = message.get("content")
            if isinstance(text, list):
                text = " ".join(
                    str(part.get("text") or "")
                    for part in text
                    if isinstance(part, Mapping)
                )
            since.append(
                f"{'The person' if role == 'user' else 'The other agent'}: {str(text or '').strip()}"
            )
    replayed = ""
    if since:
        replayed = (
            "While another agent had this conversation, this was said:\n"
            + "\n".join(since)
        )
    return own, replayed


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


# -- MCP, lent through the gateway (SH-14) ------------------------------------------


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
                "gateway: a harness is lent the gateway's toolsets only."
            )
        lent.append(
            LentToolset(
                name=server_id,
                url=f"{gateway_url()}?{query}" if query else gateway_url(),
            )
        )
    # The companies the application works with as a personal agent (SH-70):
    # each a gateway toolset of its protocol at that company
    # (``?only=pap&pap-company=<domain>``), reached with the execution credential
    # as any other — the harness calls pap_sign_in, pap_ask, pap_propose as tools
    # and never speaks PAP; custody, identity and the record are the gateway's.
    from agent_runtimes.apps import pap_connections  # noqa: PLC0415

    for sid in pap_connections.remember(app) if app is not None else []:
        if sid in {item.name for item in lent}:
            continue
        query = pap_connections.gateway_query(sid)
        if query:
            lent.append(LentToolset(name=sid, url=f"{gateway_url()}?{query}"))
    return lent


# -- the audit, written to the record ----------------------------------------------------


class RecordAudit:
    """The Shield's audit rows as the application's record (SH-18, SH-34).

    The proxy writes one row per decision, action and answer, in the
    package's vocabulary (A-01's with ACP's kinds); here each becomes an
    entry of the record the session API, Activity and ``/apps/activity``
    read — a ``decision`` for what a policy or a limit decided, a
    ``tool_call`` for what was done (its kind, path or command, diff or
    terminal), an ``approval`` for what the person answered, a ``step`` for
    the session's and the turn's events and the plan — and the record keeps
    what its ``record.include`` names. A diff is kept whole only when the
    include names ``diffs``, a terminal's output only when it names
    ``terminals``; otherwise a hash and a size, a command and an exit. Every
    row is redacted at the row (``agent_shield.audit.redacted_row``) before
    it is kept here, logged, recorded, or counted over OTEL
    (``agent_shield.tracing.observe``). Without a recorder (``loop
    --harness`` outside an application) the rows are logged and kept here
    for the terminal.
    """

    KEPT = 500

    #: The rows that are what was done, kept as ``tool_call`` entries.
    ACTIONS = ("tool_call", "fs_read", "fs_write", "terminal", "fetch")
    #: The rows that are the session's and the turn's events, kept as ``step`` entries.
    STEPS = ("session", "turn", "plan", "policy")

    def __init__(
        self,
        recorder: Any = None,
        runtime_session_of: Callable[[str], Optional[str]] = lambda _: None,
    ) -> None:
        """Keep the recorder, and how an ACP session maps to the runtime's."""
        self.recorder = recorder
        self.runtime_session_of = runtime_session_of
        self.rows: list[dict[str, Any]] = []
        #: Each call's title, from the row that said it, for the rows that do not (a completion, an exit).
        self._titles: dict[str, str] = {}

    def write(self, event: str, **fields: Any) -> dict[str, Any]:
        """Write one audit row: redacted, kept here, logged, recorded when a recorder is, counted."""
        call_id = str(fields.get("tool_call_id") or "")
        if call_id and fields.get("title"):
            self._titles[call_id] = str(fields["title"])
            if len(self._titles) > self.KEPT:
                for stale in list(self._titles)[: len(self._titles) - self.KEPT]:
                    self._titles.pop(stale, None)
        elif call_id and call_id in self._titles and not fields.get("title"):
            fields["title"] = self._titles[call_id]
        row = redacted_row(
            {"event": event, **{k: v for k, v in fields.items() if v is not None}}
        )
        self.rows.append(row)
        del self.rows[: -self.KEPT]
        logger.info(
            "shield %s: %s",
            event,
            row.get("sentence") or row.get("title") or row.get("what") or "",
        )
        observe(row)
        if self.recorder is None:
            return row
        session = self.runtime_session_of(str(row.get("session") or ""))
        if not session:
            return row
        from agent_runtimes.apps.record import _SESSION

        token = _SESSION.set(session)
        try:
            self._record(event, row)
        finally:
            _SESSION.reset(token)
        return row

    def _kept_whole(self, kind: str) -> bool:
        """Whether the record names ``diffs`` or ``terminals``: fail closed without a recorder that says."""
        kept = getattr(self.recorder, "kept", None)
        return bool(kept(kind)) if callable(kept) else False

    def _display_for_record(self, display: Any) -> Any:
        """A diff or a terminal as the record keeps it: whole when named, else its summary."""
        if not isinstance(display, dict):
            return display
        shown = display.get("display")
        if shown == "diff" and not self._kept_whole("diff"):
            summary = diff_summary(
                str(display.get("path") or ""),
                str(display.get("new_text") or ""),
                display.get("old_text"),
            )
            return {"display": "diff", "language": display.get("language"), **summary}
        if shown == "terminal" and not self._kept_whole("terminal"):
            output = display.get("output")
            return {
                "display": "terminal",
                "terminal_id": display.get("terminal_id"),
                "command": display.get("command"),
                "exit_code": display.get("exit_code"),
                "bytes": len(str(output).encode("utf-8"))
                if output is not None
                else None,
                "released": display.get("released"),
            }
        return display

    def _record(self, event: str, fields: dict[str, Any]) -> None:
        """Write the row as the record's entry of the matching kind."""
        recorder = self.recorder
        title = str(
            fields.get("title") or fields.get("command") or fields.get("name") or event
        )
        decision = fields.get("decision")
        by = fields.get("by")
        if event == "permission" and by == "person":
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
        if event == "limit":
            recorder.add(
                "decision",
                str(
                    fields.get("sentence") or f"{title}: {fields.get('limit')} reached"
                ),
                {
                    "tool": title,
                    "behaviour": VERDICT_BEHAVIOUR.get(
                        str(decision), VERDICT_BEHAVIOUR["deny"]
                    ),
                    "because": "limit",
                    "classes": [fields["class"]] if fields.get("class") else [],
                    **{
                        key: fields[key]
                        for key in ("limit", "threshold", "count", "kind")
                        if fields.get(key) is not None
                    },
                },
            )
            return
        if (
            decision in VERDICT_BEHAVIOUR
            and by in ("policy", "shield", None)
            and (fields.get("sentence") or event in ("mcp", "permission"))
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
                            "url",
                            "chosen",
                            "server",
                        )
                        if fields.get(key) is not None
                    },
                },
            )
            return
        if event == "display":
            # The diff or the terminal a tool result carried, as the page
            # draws it (SH-16): whole only when the record names it.
            recorder.add(
                "tool_call",
                f"{title}: shown",
                {
                    "tool": title,
                    "tool_call_id": fields.get("tool_call_id"),
                    "display": self._display_for_record(fields.get("display")),
                },
            )
            return
        if event in self.ACTIONS:
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
                            "class",
                            "status",
                            "what",
                            "diff",
                            "bytes",
                            "terminal_id",
                            "exit_code",
                            "signal",
                            "cwd",
                            "path",
                            "command",
                            "url",
                            "by",
                        )
                        if fields.get(key) is not None
                    },
                },
            )
            return
        if event in self.STEPS:
            recorder.add(
                "step",
                f"{event}: {fields.get('what') or title}",
                {
                    "event": event,
                    **{
                        key: fields[key]
                        for key in (
                            "what",
                            "mode",
                            "stop_reason",
                            "blocks",
                            "steps",
                            "status",
                            "scopes",
                            "rule",
                            "sentence",
                            "by",
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
        lent_files: LentFiles | None = None,
        approvals: ToolApprovalManager | None = None,
        recorder: Any = None,
        name: str = "",
        description: str = "",
        state_store: Any = None,
        policy_maker: Callable[[list[Policy]], list[Policy]] | None = None,
        connect_url: str | None = None,
        companies: Sequence[str] = (),
        spec_id: str = "",
    ) -> None:
        """Build the agent on a harness, its command resolved (or the sidecar's URL), its policies given."""
        self._agent_id = agent_id
        #: The agentspec bound: what a session's harness row is kept under
        #: (MH-04, per (session, agent)), the runtime's agent id when none.
        self.spec_id = spec_id or agent_id
        #: The runtime sessions whose harness session is being loaded: a
        #: swap waits for them (MH-06).
        self.loading: set[str] = set()
        #: The turns since this agent was swapped away, by ACP session: replayed
        #: as text with the first prompt after a swap back (MH-04).
        self._since: dict[str, str] = {}
        #: The harness's sessions whose first prompt still owes the application's
        #: instructions (VS-23): the folder's own instructions file was kept.
        self._preface_due: set[str] = set()
        self.harness = harness
        self._name = name or harness.name
        self._description = description or harness.description
        #: The gateway toolsets the application connects, lent at each
        #: session with the run's credential; nothing without one.
        self.lent = list(lent)
        #: The caller's token, kept for a run that carries none of its own.
        self.credential = credential
        self._handles: list[str] = []
        #: The skills and instructions written for it, read-only to it.
        self.lent_files = lent_files or LentFiles()
        self.approvals = approvals
        self.recorder = recorder
        self.state_store = state_store
        self.advertised: InitializeResponse | None = None
        self._face = _RuntimeFace(self)
        self._queues: dict[str, asyncio.Queue[Any]] = {}
        self._acp_of: dict[str, str] = {}
        self._runtime_of: dict[str, str] = {}
        self._titles: dict[str, str] = {}
        self._kinds: dict[str, str] = {}
        #: What each call said it runs, and the displays it carried so far:
        #: a terminal's reference arrives in progress, its output at the end.
        self._commands: dict[str, str] = {}
        self._shown: dict[str, list[dict[str, Any]]] = {}
        #: The command each terminal runs, learnt from the Shield's own row
        #: (which says its command) for the harness's row (which may not).
        self._terminal_commands: dict[str, str] = {}
        self._replayed: dict[str, int] = {}
        #: ACP session -> the authority its lent MCP carries (``_authority_of``, SH-33).
        self._lent_authority: dict[str, str] = {}
        self._cancelled: dict[str, asyncio.Event] = {}
        self._failures: dict[str, str] = {}
        #: The approvals a run raises through: the transport's (A2A's
        #: ``input-required``, the ACP route's relay) when the run brings
        #: them, else the runtime's tool approvals.
        self._approvals_of: dict[str, Any] = {}
        loaded = [
            LoadedPolicy(policy=policy, origin=_origin_of(policy))
            for policy in (policies if policies is not None else policies_of(None))
        ]
        #: How the policies are made again when IAM's documents change (SH-50):
        #: given the managed documents, the full set in force.
        self.policy_maker: Callable[[list[Policy]], list[Policy]] | None = policy_maker
        self._stop_listening: Callable[[], None] | None = None
        # The authorizer and the subject (SH-72, SH-75): IAM's AuthZen
        # route with the run's credential, the deployment or the account the run
        # acts as; the lent tools of a company classed by agentspecs' table, the
        # companies named so that a fetch to one is refused.
        from agent_runtimes.guardrails import shield_authorizer  # noqa: PLC0415

        self.companies: list[str] = list(companies)
        # The authorizer reads the credential at each decision
        # (``_decision_credential``): the deployment's principal token the
        # runtime holds now, not the creator's key kept from the start.
        held = self._decision_credential()
        ShieldProxy.__init__(
            self,
            list(command),
            policies=loaded,
            audit=RecordAudit(recorder, self._runtime_of.get),
            workspace=workspace,
            agent_env=dict(environment or {}),
            connect_url=connect_url,
            authorizer=shield_authorizer.runtime_authorizer(
                self._decision_credential if held else credential
            ),
            # The subject is this agent's own property, read when it is
            # needed (``subject``): built before the keeper hands the
            # principal token, it would otherwise stay the creator's account.
            subject=None,
            tool_class=shield_authorizer.lent_tool_class,
            companies=self.companies,
        )

    @property
    def subject(self) -> Any:
        """Who the run acts as, read when it is needed: the deployment served, else the credential's account.

        The Shield copies it into each session as the session opens, and
        IAM answers only a token asking about itself. An agent built before
        the keeper hands the deployment's principal token — a kept
        application loads its agent first — kept the subject bound at
        creation, the creator's account, while ``_decision_credential``
        moved on to the principal token: every decision answered *403, a
        principal asks what it may do itself* (found on r1, 21 October
        2026, the first turn on image 0.0.59). The subject follows the
        credential now, as the credential follows the keeper.
        """
        from agent_runtimes.guardrails import shield_authorizer  # noqa: PLC0415

        held = self._decision_credential()
        return shield_authorizer.runtime_subject(
            held,
            self._deployment_served() or shield_authorizer.deployment_of_token(held),
        )

    @subject.setter
    def subject(self, value: Any) -> None:
        """``ShieldProxy.__init__`` assigns what it is given; this agent reads its own."""
        return None

    def _deployment_served(self) -> str:
        """The deployment this agent serves, or ``""`` (a Preview, a test, no application)."""
        from agent_runtimes.apps.principal import deployment_of
        from agent_runtimes.models.models import app_instance_of

        return deployment_of(app_instance_of(self._agent_id))

    def _decision_credential(self) -> str:
        """The credential the Shield's authorizer asks IAM with, read at each decision.

        The deployment's principal token the runtime holds now — renewed by
        its keeper while the deployment is kept on — else the run's own. A
        harness the keeper relaunched starts under the owner's minted key,
        which lives fifteen minutes: bound at creation it outlived nothing,
        and every decision after that answered *the authorizer answered 401*
        (found on r1, 21 October 2026, SH-12). As ``_bearer_of`` does for
        the gateway, the token is read when it is needed.
        """
        from agent_runtimes.apps.principal import principal_token

        deployment = self._deployment_served()
        if deployment:
            held = principal_token(deployment)
            if held:
                return held
        return self.credential

    # -- the policies while running (SH-50, SH-54) ---------------------------------------

    def _listen_for_policies(self) -> None:
        """Be told of IAM's changed documents, and of an outage, while this agent runs."""
        if self.policy_maker is None or self._stop_listening is not None:
            return
        policies = runtime_policies()
        if not policies.is_managed:
            return

        def changed(managed: list[Policy]) -> None:
            self.replace_policies(
                [
                    LoadedPolicy(policy=policy, origin=_origin_of(policy))
                    for policy in self.policy_maker(managed)  # type: ignore[misc]
                ]
            )

        self._stop_listening = policies.listen(changed, self.refuse_all)

    def _rules_from(self, runtime_session: str) -> Callable[[], list[Rule]]:
        """The rules a person added to the runtime's session, read at every decision (SH-54)."""
        return lambda: session_rules().of(runtime_session)

    def rules_in_force_of(self, runtime_session: str) -> dict[str, Any] | None:
        """What decides the runtime's session, or ``None`` when the harness holds no session for it."""
        acp_session = self._acp_of.get(runtime_session)
        if not acp_session or acp_session not in self.sessions:
            return None
        return self.rules_in_force(acp_session)

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
        """The workspace the harness runs in."""
        assert self.pinned_workspace is not None
        return self.pinned_workspace.root

    def get_tools(self) -> list[ToolDefinition]:
        """No tools of its own: a harness's native tools are its own, the lent ones the gateway's."""
        # The harness's native tools are its own; the lent ones are the gateway's.
        return []

    @property
    def client(self) -> Any:
        """The face the inner client answers to: the runtime's, not an ACP client."""
        return self._face

    @property
    def started(self) -> bool:
        """Whether the harness's process is running."""
        return self._channel is not None

    def _routed(self) -> Any:
        """The route the harness's model calls take through ai-inference, or ``None``."""
        from agent_runtimes.adapters import harness_inference

        route = harness_inference.ROUTES.get(self.harness.id)
        if route is None or route.base_url_variable not in self.agent_env:
            return None
        return route

    async def _await_routed_token(self) -> float:
        """Wait, bounded, for the runtime's token when a routed harness has none yet.

        A kept deployment's first keep on a fresh runtime starts its harness
        as the companion is still giving the runtime its token (r1, 28
        October 2026: an OpenCode application's keep refused "This runtime
        has no ai-inference token yet", and fine on the next try): the start
        waits `INFERENCE_TOKEN_WAIT` for it rather than refusing. An expired
        token is not waited on — a new one is not coming.

        Returns
        -------
        float
            How long was waited, in seconds; 0 when nothing was.
        """
        from agent_runtimes.models import offered

        if self._routed() is None or offered.inference_token():
            return 0.0
        started = time.monotonic()
        await offered.await_inference_token()
        return time.monotonic() - started

    def _give_routed_token(self, waited: float = 0.0) -> None:
        """The runtime's ai-inference token, as it is now, for a harness whose calls go through ai-inference.

        A harness routed through ai-inference (``ANTHROPIC_BASE_URL`` in its
        environment, :func:`harness_environment`) calls with the token the
        runtime holds when the harness starts; none, or an expired one, is a
        refusal in a sentence before the process is launched — saying how
        long was waited for it (`_await_routed_token`), when it was.
        """
        from agent_runtimes.adapters import harness_inference

        route = self._routed()
        if route is None:
            return
        token, refusal = harness_inference.routed_token()
        if not token:
            after = f" (waited {waited:.0f}s for it)" if waited >= 1 else ""
            raise HarnessRefused(
                f"{self.harness.name} calls its model through ai-inference with this runtime's token: {refusal}{after}"
            )
        self.agent_env[route.token_variable] = token
        if route.config_variable:
            from agent_runtimes.models.models import app_instance_of, app_usage_headers

            # Each call metered under the application and deployment served.
            self.agent_env[route.config_variable] = harness_inference.inline_config(
                route,
                self.agent_env[route.base_url_variable],
                token,
                headers=app_usage_headers(app_instance_of(self._agent_id)),
            )

    async def initialize(self) -> None:
        """Launch the harness and negotiate; refuse what its spec asked that it lacks."""
        if self.started:
            return
        self._give_routed_token(await self._await_routed_token())
        self._listen_for_policies()
        try:
            channel = await self.start_agent()
        except (OSError, RuntimeError) as exc:
            where = self.connect_url or (self.command[0] if self.command else "?")
            raise HarnessRefused(
                f"{self.harness.name} did not start ({where}): {exc}"
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
        await self._authenticate_routed(channel, answer)
        agent = answer.agent_info
        logger.info(
            "Harness %s started: %s %s, shield %s, workspace %s",
            self.harness.id,
            agent.name if agent else self.command[0],
            agent.version if agent else "",
            shield_version,
            self.workspace,
        )

    async def _authenticate_routed(self, channel: Any, answer: Any) -> None:
        """Authenticate a routed harness that needs it, with the routed credential.

        Codex (codex-acp) opens no session before ``authenticate`` and does not
        read ``OPENAI_BASE_URL``: routed through ai-inference it is
        authenticated with codex-acp's ``gateway`` method — a custom provider
        whose ``baseUrl`` is ai-inference's OpenAI route and whose
        ``Authorization`` header carries the runtime's token (META_HARNESS
        decision Y). Another method is asked only when the harness offers it.
        """
        from agent_runtimes.adapters import harness_inference

        route = harness_inference.ROUTES.get(self.harness.id)
        if (
            route is None
            or not route.auth_method
            or route.base_url_variable not in self.agent_env
        ):
            return
        params: dict[str, Any] = {"methodId": route.auth_method}
        if route.auth_method == "gateway":
            token = self.agent_env.get(route.token_variable, "")
            params["_meta"] = {
                "gateway": {
                    "baseUrl": self.agent_env[route.base_url_variable],
                    "headers": {"Authorization": f"Bearer {token}"},
                    "providerName": "Datalayer",
                }
            }
        else:
            offered = {
                str(getattr(method, "id", "") or "")
                for method in (getattr(answer, "auth_methods", None) or [])
            }
            if route.auth_method not in offered:
                return
        try:
            await channel.request("authenticate", params)
        except Exception as exc:
            await self.stop_agent()
            raise HarnessRefused(
                f"{self.harness.name} refused its {route.auth_method} authentication through ai-inference: {exc}"
            ) from None

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
        if self._stop_listening is not None:
            self._stop_listening()
            self._stop_listening = None

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
        #: Why the turn stopped, kept as its answer when it said nothing.
        refusal = ""
        acp_session = ""
        turn: asyncio.Task[PromptResponse] | None = None
        try:
            acp_session, opening = await self._session_for(context, queue)
            self._queues[acp_session] = queue
            self._cancelled[acp_session] = asyncio.Event()
            self._failures.pop(acp_session, None)
            self._approvals_of[acp_session] = (
                context.metadata.get("approvals") or self.approvals
            )
            if self.recorder is not None:
                self.recorder.start(runtime_session)
                self.recorder.ran(runtime_session)
            for event in opening:
                yield event
            turn = asyncio.create_task(
                self._traced_prompt(prompt, acp_session, runtime_session),
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
                refusal = failed
            yield StreamEvent(type="done", data=ended)
        except (asyncio.CancelledError, GeneratorExit):
            status = "gone"
            if acp_session:
                await self._cancel_turn(acp_session, turn)
            raise
        except RequestError as exc:
            status = "stopped"
            sentence = f"{self.harness.name} refused the turn: {_message_of(exc)}"
            refusal = sentence
            self._failures.pop(acp_session, None)
            yield StreamEvent(type="error", data=sentence)
        except HarnessRefused as refused:
            status = "stopped"
            refusal = str(refused)
            yield StreamEvent(type="error", data=str(refused))
        finally:
            self._queues.pop(acp_session, None)
            self._cancelled.pop(acp_session, None)
            self._approvals_of.pop(acp_session, None)
            if self.recorder is not None:
                await self._record_end(
                    runtime_session, prompt, "".join(said) or refusal, status
                )

    def _prompt_with_since(self, prompt: str, acp_session: str) -> str:
        """The prompt, the turns since a swap away replayed before it, once (MH-04)."""
        since = self._since.pop(acp_session, "")
        return f"{since}\n\n{prompt}" if since else prompt

    def _prompt_blocks(self, prompt: str, acp_session: str) -> list[Any]:
        """
        The blocks of a turn's prompt: the application's instructions first, once per
        harness session, when the folder's own instructions file was kept (VS-23);
        then the prompt with the turns since a swap.
        """
        blocks: list[Any] = []
        if acp_session in self._preface_due:
            self._preface_due.discard(acp_session)
            preface = self.lent_files.preface()
            if preface:
                blocks.append(text_block(preface))
        blocks.append(text_block(self._prompt_with_since(prompt, acp_session)))
        return blocks

    async def _traced_prompt(
        self, prompt: str, acp_session: str, runtime_session: str
    ) -> PromptResponse:
        """The turn as a span of the trace the face arrived on (SH-51).

        A child of whatever is current — the A2A or AG-UI request's span,
        which carries the caller's ``traceparent`` — so one trace runs from
        the caller through this turn to the harness (handed the context in
        the prompt's ``_meta.traceparent``) and the lent gateway tools. The
        audit's rows are its events; nothing without OpenTelemetry.
        """
        with turn_span(
            acp_session,
            **{
                "shield.harness": self.harness.id,
                "shield.agent": self._agent_id,
                "shield.runtime_session": runtime_session,
            },
        ):
            # The stdio shims send this turn's trace to the gateway from now on.
            traceparent = trace_headers().get("traceparent")
            for handle in self._handles:
                with contextlib.suppress(ValueError, OSError):
                    carry(handle, traceparent)
            # The turn inside this span: `ShieldProxy.prompt` would open a second.
            return await ShieldProxy.run_turn(
                self, self._prompt_blocks(prompt, acp_session), acp_session
            )

    # -- sessions -----------------------------------------------------------------

    async def _session_for(
        self, context: AgentContext, queue: asyncio.Queue[Any]
    ) -> tuple[str, list[StreamEvent]]:
        """The harness's session for the runtime's: kept, loaded, or new and said so."""
        runtime_session = context.session_id
        # Whose authority the session's lent MCP carries (SH-33): a delegated
        # execution's credential, or the runtime's own. A turn under another
        # does not run on servers lent with the first.
        authority = self._authority_of(context)
        known = self._acp_of.get(runtime_session)
        if known and known in self.sessions:
            if self._lent_authority.get(known) == authority:
                return known, []
            servers = self._lent_servers(self._bearer_of(context))
            return await self._new_session(
                runtime_session,
                f"This turn carries another authority than {self.harness.name}'s session {known} was lent "
                "its tools with, so it starts a new session whose tools carry this turn's: the earlier "
                "turns of this conversation were not replayed to it.",
                servers,
                authority,
            )
        kept = known or await self._kept_session(runtime_session)
        # What the session is lent: the gateway's toolsets with the run's
        # credential, in the shape the harness takes (SH-14).
        servers = self._lent_servers(self._bearer_of(context))
        if kept and self.loads_sessions:
            # The agent replays what it kept; the queue holds it for the comparison.
            self._queues[kept] = queue
            self._runtime_of[kept] = runtime_session
            self._replayed[kept] = 0
            self.loading.add(runtime_session)
            try:
                await self.load_session(str(self.workspace), servers, kept)
            except RequestError as exc:
                self.loading.discard(runtime_session)
                self.sessions.pop(kept, None)
                self._queues.pop(kept, None)
                return await self._new_session(
                    runtime_session,
                    f"{self.harness.name} could not load its session {kept} ({_message_of(exc)}): "
                    "it starts over; the earlier turns of this conversation were not replayed to it.",
                    servers,
                    authority,
                )
            try:
                await self._channel_drain(kept)
            finally:
                self.loading.discard(runtime_session)
            self._acp_of[runtime_session] = kept
            self._lent_authority[kept] = authority
            self._replayed.pop(kept, None)
            self.sessions[kept].rules_from = self._rules_from(runtime_session)
            # What the agent replayed is for the comparison, never the new
            # turn's answer: counted, then let go.
            replayed = 0
            while not queue.empty():
                if isinstance(queue.get_nowait(), UserText):
                    replayed += 1
            # Compared with this agent's own spans of the record (MH-04): a
            # session swapped away at turn 4 and back at turn 6 loads turns
            # 1–4; turns 5–6, another agent's, are replayed as text below.
            own, since = own_and_since(context.conversation_history, self.spec_id)
            turns = len(own)
            opening: list[StreamEvent] = []
            if replayed != turns:
                opening.append(
                    _said(
                        f"{self.harness.name} replayed {replayed} turn(s) of its session {kept}; "
                        f"the record holds {turns} of its own: they differ."
                    )
                )
            if since:
                self._since[kept] = since
            self._preface_due.add(kept)
            kept_line = kept_said(self.lent_files, self.harness, self.workspace)
            if kept_line:
                opening.insert(0, _said(kept_line))
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
        return await self._new_session(runtime_session, sentence, servers, authority)

    async def _new_session(
        self,
        runtime_session: str,
        sentence: str,
        servers: list[Any],
        authority: str,
    ) -> tuple[str, list[StreamEvent]]:
        """Open a session in the workspace, keep its id, and say ``sentence`` first when there is one."""
        answer = await self.new_session(str(self.workspace), servers)
        acp_session = answer.session_id
        self._lent_authority[acp_session] = authority
        self._acp_of[runtime_session] = acp_session
        self._runtime_of[acp_session] = runtime_session
        self.sessions[acp_session].rules_from = self._rules_from(runtime_session)
        native = native_session_id_of(self.harness, getattr(answer, "field_meta", None))
        await self._keep_session(runtime_session, acp_session, native)
        # The folder's own instructions file kept (VS-23): said first, and the
        # application's instructions owed to the harness with its first prompt.
        self._preface_due.add(acp_session)
        kept_line = kept_said(self.lent_files, self.harness, self.workspace)
        opening = [_said(kept_line)] if kept_line else []
        return acp_session, opening + ([_said(sentence)] if sentence else [])

    # -- what was written for it is read-only to it (SH-21) ------------------------------

    def decide(
        self, session: SessionState, action: Action, *, count_as: str | None = None
    ) -> Decision:
        """The policies' decision, after one of the runtime's: the lent files are not the agent's to write."""
        if (
            action.kind in ("fs_write", "edit", "delete", "move")
            and action.path
            and self.pinned_workspace is not None
            and self.lent_files.protects(
                self.pinned_workspace.place(action.path).resolved
            )
        ):
            return Decision(
                verdict="deny",
                sentence=(
                    f"{action.title}: leave it to me — {action.path} was written by "
                    "Datalayer from the application (its skills and its instructions) "
                    "and is read-only to the agent; a skill of your own goes in a "
                    "folder of its own."
                ),
                scope="team",
                rule="lent files are read-only",
                decided_by="rule",
            )
        return ShieldProxy.decide(self, session, action, count_as=count_as)

    # -- MCP lent (SH-14) ----------------------------------------------------------------

    @property
    def lends_over_http(self) -> bool:
        """Whether the harness advertised ``mcpCapabilities.http``: lent as HTTP, else over the stdio shim."""
        capabilities = self.advertised.agent_capabilities if self.advertised else None
        mcp = capabilities.mcp_capabilities if capabilities else None
        return bool(mcp and mcp.http)

    def _bearer_of(self, context: AgentContext) -> str:
        """The credential this run reaches the gateway with.

        The execution's own, when the run was delegated with one (``_meta`` or
        ``metadata`` ``datalayer.credential``, O1-17): the narrowest authority
        the run holds, so the lent MCP — and every sub-agent the harness
        spawns, which reaches MCP through the servers it was lent — is held
        to that execution's manifest at the gateway (SH-33).
        Else a deployment's principal, else the run's, else the caller's.
        """
        from agent_runtimes.apps.principal import deployment_of, principal_token
        from agent_runtimes.context.delegation import DELEGATED_CREDENTIAL
        from agent_runtimes.models.models import app_instance_of

        delegated = str(context.metadata.get(DELEGATED_CREDENTIAL) or "")
        if delegated:
            return delegated
        deployment = deployment_of(app_instance_of(self._agent_id))
        if deployment:
            held = principal_token(deployment)
            if held:
                return held
        return str(context.metadata.get("user_token") or "") or self.credential

    @staticmethod
    def _authority_of(context: AgentContext) -> str:
        """
        Which authority a run's lent MCP carries.

        A delegated credential's fingerprint (the Shield's,
        ``agent_shield.acp.credential``), else the runtime's.
        """
        from agent_runtimes.context.delegation import DELEGATED_CREDENTIAL

        delegated = str(context.metadata.get(DELEGATED_CREDENTIAL) or "")
        if not delegated:
            return "runtime"
        return "delegated:" + fingerprint(delegated)

    def _lent_servers(self, bearer: str) -> list[Any]:
        """The lent toolsets as ``session/new.mcpServers``: HTTP with the bearer, or the stdio shim holding it."""
        if not self.lent:
            return []
        names = ", ".join(item.name for item in self.lent)
        if not bearer:
            raise HarnessRefused(
                f"{self.harness.name} is lent {names}, and this run carries no credential "
                "to reach the gateway with: nothing is lent without one."
            )
        if self.lends_over_http:
            # Lent with the bearer as the Shield lends a credential
            # (`agent_shield.acp.credential.lent_with`, SH-33): its
            # `Authorization` on every HTTP server, whatever else was there.
            return lent_with(
                [
                    HttpMcpServer(
                        type="http",
                        name=item.name,
                        url=item.url,
                        # The trace the session opens on, to the gateway:
                        # a harness that honours `_meta.traceparent`
                        # sends its own per turn; one that does not sends this.
                        headers=[
                            HttpHeader(name=name, value=value)
                            for name, value in trace_headers().items()
                        ],
                    )
                    for item in self.lent
                ],
                bearer,
            )
        servers: list[Any] = []
        for item in self.lent:
            # The credential stays in the runtime's hands: the shim reads it
            # from the Shield's home by an opaque handle, never from the
            # harness's arguments or environment.
            handle = hold(item.name, item.url, bearer)
            self._handles.append(handle)
            servers.append(
                McpServerStdio(
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
        """Whether the harness advertised ``loadSession`` — and its spec's
        capabilities table says its session comes back (``resume`` not
        ``none``): a harness declared ``none`` starts over, said, whatever
        it advertises (MH-20).
        """
        if self.harness.capabilities.resume == "none":
            return False
        capabilities = self.advertised.agent_capabilities if self.advertised else None
        return bool(capabilities and capabilities.load_session)

    async def _channel_drain(self, session_id: str) -> None:
        """Wait until every update received for the session was handled."""
        if self._channel is not None:
            await self._channel.drain(session_id)

    def row_key(self, runtime_session: str) -> str:
        """The harness row's key: per (session, agent) — ``<agentspec>:<uid>``."""
        return f"{self.spec_id}:{runtime_session}"

    async def harness_row(self, runtime_session: str) -> dict[str, Any] | None:
        """The harness's row for the runtime's session, as kept (MH-04, MH-05)."""
        if self.state_store is None:
            return None
        return await self.state_store.get(
            HARNESS_SESSION_KIND, self.row_key(runtime_session)
        )

    async def _kept_session(self, runtime_session: str) -> str | None:
        """The harness's session kept for the runtime's, from the protocol state store."""
        record = await self.harness_row(runtime_session)
        return str(record.get("acp_session_id") or "") or None if record else None

    async def _keep_session(
        self,
        runtime_session: str,
        acp_session: str,
        native_session_id: str | None = None,
    ) -> None:
        """Keep the harness's session for the runtime's in the protocol state
        store: one row per (session, agent), never deleted on a swap (MH-04);
        the vendor's own session id beside the ACP one when the adapter
        exposes it, said absent when it does not (MH-05).
        """
        if self.state_store is None:
            return
        acp = self.harness.acp
        await self.state_store.put(
            HARNESS_SESSION_KIND,
            self.row_key(runtime_session),
            {
                "acp_session_id": acp_session,
                "harness": self.harness.id,
                "agent": self.spec_id,
                "workspace": str(self.workspace),
                "native_session": str(acp.native_session) if acp else "none",
                "native_session_id": native_session_id or None,
                "resume": self.harness.capabilities.resume,
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
        from agent_runtimes.apps.record import _SESSION

        token = _SESSION.set(runtime_session)
        try:
            # A refused turn is a turn too: a session whose only turn was
            # refused has it to count, list and resume from (MH-42).
            if status in ("answered", "stopped"):
                recorder.turned(
                    asked, answered if status == "answered" else f"Stopped: {answered}"
                )
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

    async def fail_turn(self, session: SessionState, sentence: str) -> None:
        """End the turn with the sentence, kept for the ``done`` event."""
        self._failures[session.session_id] = sentence
        await ShieldProxy.fail_turn(self, session, sentence)

    def _terminal_output_of(
        self, session_id: str, output: Any, terminal_ids: Sequence[str]
    ) -> dict[str, Any] | None:
        """A terminal's output and exit: the harness's raw output when it reported them, else the Shield's own terminal's, kept after release."""
        if isinstance(output, dict) and ("output" in output or "exit" in output):
            return dict(output)
        session = self.sessions.get(session_id)
        terminals = getattr(session, "terminals", None) if session else None
        if terminals is None:
            return None
        for terminal_id in terminal_ids:
            try:
                run = terminals.get(terminal_id)
            except KeyError:
                continue
            return {
                "output": run.output.decode("utf-8", "replace"),
                "exit": run.exit_code,
                "released": True,
                "command": run.shown(),
            }
        return None

    def _events_of(self, event: Event, session_id: str) -> list[StreamEvent]:
        """Map one neutral event onto the runtime's ``StreamEvent``(s) (the event table)."""
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
            self._kinds[event.tool_call_id] = event.kind
            if isinstance(event.input, dict) and event.input.get("command"):
                self._commands[event.tool_call_id] = str(event.input["command"])
            if event.displays:
                self._shown[event.tool_call_id] = [
                    item.model_dump() for item in event.displays
                ]
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
            kind = event.kind or self._kinds.get(event.tool_call_id, "other")
            if displays:
                self._shown[event.tool_call_id] = displays
            own_command = self._commands.get(event.tool_call_id, "")
            terminal_ids = [
                str(item.get("terminal_id") or "")
                for item in displays
                if item.get("display") == "terminal"
            ]
            if own_command:
                for terminal_id in terminal_ids:
                    self._terminal_commands[terminal_id] = own_command
            if event.status in ("completed", "failed"):
                # The page's display of the result (SH-16): the diff,
                # or the terminal with its output kept after release.
                shown = self._shown.pop(event.tool_call_id, displays)
                terminals = [
                    str(item.get("terminal_id") or "")
                    for item in shown
                    if item.get("display") == "terminal"
                ]
                meta = display_meta_of(
                    shown,
                    tool_call_id=event.tool_call_id,
                    command=own_command
                    or next(
                        (
                            self._terminal_commands[t]
                            for t in terminals
                            if t in self._terminal_commands
                        ),
                        "",
                    ),
                    output=self._terminal_output_of(
                        session_id, event.output, terminals
                    ),
                )
                if meta is not None:
                    self.audit.write(
                        "display",
                        session=session_id,
                        tool_call_id=event.tool_call_id,
                        title=title,
                        display=meta["reactor.ui/display"],
                    )
                return [
                    StreamEvent(
                        type="tool_result",
                        data={
                            "id": event.tool_call_id,
                            "name": title,
                            "result": event.output,
                            "kind": kind,
                            "status": event.status,
                            "display": displays,
                            **({"_meta": meta} if meta is not None else {}),
                            **(
                                {"error": self._failures.get(session_id) or "failed"}
                                if event.status == "failed"
                                else {}
                            ),
                        },
                    )
                ]
            # A terminal still running (SH-13, SH-16): its output so far rides
            # the row as the page's display, so the terminal card fills while
            # the command runs — the Shield pushes it whole at each change.
            running = (
                display_meta_of(
                    displays,
                    tool_call_id=event.tool_call_id,
                    command=own_command
                    or next(
                        (
                            self._terminal_commands[t]
                            for t in terminal_ids
                            if t in self._terminal_commands
                        ),
                        "",
                    ),
                    output={
                        "output": event.output.get("output") or "",
                        "exit": None,
                        "released": False,
                    },
                )
                if terminal_ids
                and isinstance(event.output, dict)
                and "output" in event.output
                else None
            )
            return [
                StreamEvent(
                    type="tool_call",
                    data={
                        "id": event.tool_call_id,
                        "name": title,
                        "arguments": event.input
                        if isinstance(event.input, dict)
                        else {},
                        "kind": kind,
                        "status": event.status or "in_progress",
                        "awaiting": None,
                        "display": displays,
                        **({"_meta": running} if running is not None else {}),
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

    # -- permissions (SH-12) -------------------------------------------------------------

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
        approvals = self._approvals_of.get(session_id, self.approvals)
        if approvals is None:
            await self.tell(
                session_id, f"{sentence}; nobody is here to ask, so it is not done."
            )
            return _refusing(options)
        cancelled = self._cancelled.get(session_id) or asyncio.Event()
        waiting = asyncio.ensure_future(
            approvals.request_and_wait(
                title,
                {
                    "kind": tool_call.kind,
                    "sentence": sentence,
                    # The agent's own options, for a transport that offers
                    # them as they are (A2A's approvalRequest, the ACP relay).
                    "options": [
                        {"option_id": o.option_id, "name": o.name, "kind": o.kind}
                        for o in options
                    ],
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
        # A transport that offered the agent's options as they are answers
        # with the one chosen.
        chosen = str(result.get("option_id") or "")
        if chosen:
            for option in options:
                if option.option_id == chosen:
                    return RequestPermissionResponse(
                        outcome=AllowedOutcome(outcome="selected", option_id=chosen)
                    )
        note = await self._note_of(result.get("id"))
        # The page's approval has approve and reject; a person who writes
        # "always" in the note chooses the agent's allow_always, which the
        # proxy turns into a session rule.
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
            "answering a harness's question is not built (elicitation): it was declined.",
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
        else "the platform's default"
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
    organization_uid: str = "",
    read_organization: Any = None,
    spec_id: str = "",
) -> ACPAgent:
    """An agent on a harness, resolved through the ``harness`` registry (MH-F02): not yet started.

    The catalogue contributes its harnesses; a third party's package
    contributes its own; an ``org-…`` harness is the organization's own
    (SH-46), read from IAM for ``organization_uid`` with ``credential``
    (``read_organization`` stands in for IAM in tests) and contributed for
    that organization alone, served only once the policies in force admit its
    reviewed command (``<id>@<digest>``). A harness of the register's listed
    tier is refused *listed, not drilled yet* (SH-57). The contribution's
    adapter makes the agent: :func:`acp_harness_agent` for every ACP harness.

    Parameters
    ----------
    credential : str
        The caller's token, which a run that carries none of its own reaches
        the gateway with.

    Raises
    ------
    HarnessRefused
        An unknown harness, one with no launch command, an adapter not
        installed, a declared secret missing, no workspace, or a connection
        its spec's ``acp.mcp`` refuses — each in a sentence.
    """
    from agentspecs.harnesses import listed_refusal, offered_refusal

    from agent_runtimes.guardrails.organization_harnesses import (
        OrganizationHarnessRefused,
        admit_organization,
        is_organization_harness,
        read_organization_harnesses,
    )
    from agent_runtimes.plugins.host import accepted, session_platform
    from agent_runtimes.plugins.points import HARNESSES

    platform = session_platform()
    contributions = {c.id: c.value for c in accepted(platform, HARNESSES)}
    contribution = None
    if is_organization_harness(harness_id):
        if read_organization is None:
            from datalayer_core.utils.urls import DatalayerURLs

            iam_url = DatalayerURLs.from_environment().iam_url

            def read_organization(uid: str) -> Any:
                return read_organization_harnesses(
                    uid, iam_url=iam_url, token=credential or None
                )

        if not organization_uid:
            raise HarnessRefused(
                f"The harness {harness_id!r} is an organization's own, and this application "
                "belongs to no organization: it is served only for its organization's applications."
            )
        try:
            admitted = admit_organization(platform, organization_uid, read_organization)
        except OrganizationHarnessRefused as unread:
            raise HarnessRefused(str(unread)) from None
        contribution = admitted.get(harness_id)
        if contribution is None:
            raise HarnessRefused(
                f"Organization {organization_uid} has no harness named {harness_id!r}."
            )
    else:
        contribution = contributions.get(harness_id)
    if contribution is None:
        listed = listed_refusal(harness_id)
        shared = sorted(
            c.spec.id
            for c in contributions.values()
            if not c.organization and c.spec.enabled
        )
        raise HarnessRefused(
            listed
            or f"There is no harness named {harness_id!r}: one of {', '.join(shared)}."
        )
    # A catalogue harness that is described and not offered is refused in its
    # own sentence (`unavailable_because`), never launched: the catalogue
    # offers four today (Claude Code, Codex, OpenCode, Gemini CLI).
    if not contribution.organization and not contribution.spec.enabled:
        raise HarnessRefused(
            offered_refusal(harness_id)
            or f"The harness {harness_id!r} is not offered by the shared catalogue."
        )
    return contribution.adapter(
        agent_id,
        contribution.spec,
        app=app,
        recorder=recorder,
        approvals=approvals,
        credential=credential,
        name=name,
        description=description,
        environment=environment,
        workspace=workspace,
        state_store=state_store,
        organization_uid=contribution.organization,
        spec_id=spec_id,
    )


def acp_harness_agent(
    agent_id: str,
    harness: HarnessSpec,
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
    organization_uid: str = "",
    spec_id: str = "",
) -> ACPAgent:
    """An ``ACPAgent`` on a harness spec: the adapter every ACP harness contribution names.

    The policies in force (SH-50) admit it — an organization's own by its
    reviewed command's digest — the application's skills and instructions are
    written for it (SH-21), and the sidecar bridge (SH-40) runs it when the
    pod has one.

    Raises
    ------
    HarnessRefused
        As :func:`harness_agent` says.
    """
    from agentspecs.harnesses import admission_id

    from agent_runtimes.guardrails.organization_harnesses import admission_refusal

    admitted_as = admission_id(harness) if organization_uid else ""
    lent = lent_toolsets(harness, app)
    root = workspace or harness_workspace(environment)
    lent_names = [item.name for item in lent]
    # The policies in force (SH-50): IAM's documents for the account —
    # fail closed, in a sentence naming IAM, when none can be read —, the
    # application's Rules, the platform's default; the harness admitted by them.
    try:
        policies = policies_in_force(app, lent_names, token=credential or None)
    except PolicyUnavailable as unavailable:
        raise HarnessRefused(
            f"The harness {harness.id!r} is refused: {unavailable}."
        ) from None
    refused = (
        admission_refusal(policies, admitted_as)
        if admitted_as
        else harness_refusal(policies, harness.id)
    )
    if refused is None and admitted_as:
        refused = harness_refusal(policies, admitted_as)
    if refused is not None:
        raise HarnessRefused(refused)
    # The repository the application is lent, checked out as the workspace,
    # then its skills and instructions, in the harness's format, before it
    # starts (SH-21).
    lent_repository = lend_repository(root, app)
    if lent_repository:
        logger.info("Harness %s lent %s", harness.id, lent_repository)
    lent_files = write_lent_files(root, harness, app, lent_names)
    # The sidecar bridge (SH-40): with the pod's `datalayer-harnesses`
    # container beside this one, the harness runs there, reached over the
    # WebSocket channel at `<url>/acp/<harness>`; the Shield here decides the
    # same. Without it, the adapter is launched in this container.
    sidecar = sidecar_url(environment)
    return ACPAgent(
        agent_id=agent_id,
        harness=harness,
        command=[] if sidecar else launch_command(harness),
        connect_url=f"{sidecar}/acp/{harness.id}" if sidecar else None,
        workspace=root,
        policies=policies,
        policy_maker=lambda managed: policies_of(app, lent_names, managed=managed),
        environment=harness_environment(harness, environment),
        lent=lent,
        credential=credential,
        lent_files=lent_files,
        approvals=approvals,
        recorder=recorder,
        name=name,
        description=description,
        state_store=state_store,
        companies=companies_of(app) if app is not None else (),
        spec_id=spec_id,
    )


__all__ = [
    "HARNESS_SESSION_KIND",
    "MCP_MODES",
    "REFUSED",
    "RUNTIME_CLIENT_INFO",
    "SIDECAR_VARIABLE",
    "WORKSPACE_VARIABLE",
    "ACPAgent",
    "HarnessRefused",
    "LentFiles",
    "LentToolset",
    "RecordAudit",
    "acp_harness_agent",
    "advertised_problems",
    "harness_agent",
    "harness_environment",
    "harness_workspace",
    "launch_command",
    "lent_toolsets",
    "native_session_id_of",
    "own_and_since",
    "sidecar_url",
]
