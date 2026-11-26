# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Signed-out sessions, on the visitors' runtime.

A visitor without an account talks to an application written as a spec on a
runtime kept warm for everybody without one: the runtime image the pools run, started with
``AGENT_RUNTIMES_VISITORS`` — the examples it keeps warm, each one's agent
made as it starts — and nobody's token. Every other runtime refuses a
visitor, and this one refuses anybody signed in: a person has runtimes of
their own.

**Who calls.** A visitor holds a token ai-inference minted for them
(``POST /anonymous/token``), naming the visitor — the id their tab keeps —
and the application it is for: an example's id, or ``at:<slug>`` for an
application at its address that its owner lets anybody open. The
runtime asks ai-inference who it is for (``GET /anonymous/whoami``), as any
runtime asks IAM who a person is
(`agent_runtimes.apps.callers`). A caller is then ``visitor:<id>``.

**An application with code of its own** (an ``app.py``; decided 14 October
2026) is never talked to here, where its plain agent would answer in its
code's place: ai-agents points a visitor at the runtime its deployment is
kept always on, and refuses one not kept on, in a sentence. That runtime
takes the visitor's token for its own address, makes the address's agent
with the deployment's code (read from ai-agents as nobody), and holds the
visitor to all that follows — their own token for its models, read only,
their turns and minutes, nothing kept — as this runtime does.

**A session is its own.** A visitor's session answers that visitor and
nobody else, on the same runtime as everybody else's: somebody else's is not
found, as for people. A token reaches the one application it names.

**What a visitor is given.** Model calls go to ai-inference with the
visitor's own token, read as each call is made (:func:`turn_api_key`) and
never another key, so ai-inference's anonymous limits and its ceiling for
the day apply and nobody's account pays. A tool whose action class is not
*read* is refused before it runs, whatever the application's rules say
(:func:`visitor_refusal`). Nothing is remembered and no record is
sent (`AppRecorder.kept`).

**Limits.** Per visitor, a number of turns a day
(``AGENT_RUNTIMES_VISITOR_TURNS``, 10) and a session's life from its start
(``AGENT_RUNTIMES_VISITOR_SESSION_MINUTES``, 15), each said in a sentence
when it is reached. The rate of model calls and the day's ceiling are
ai-inference's. A visitor whose token ai-inference minted from an address on
its allowlist (``turns_unlimited``, said by ``/anonymous/whoami``) is not
counted turns: their session's minutes still hold.

**Reach.** Only the application's own routes and the chat's reads of its
models answer anybody but the pod itself (:func:`path_answered`): every other
route of a runtime — making agents, configuring it, its MCP servers — is the
pod's own, as its ingress publishes nothing else either. One gate
(:class:`OwnRoutesOnly`) holds a runtime that serves a deployment to the same
routes (the release gates, decided 14 October 2026).
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

__all__ = [
    "AT_PREFIX",
    "NOT_HERE",
    "VISITORS_OWN",
    "OwnRoutesOnly",
    "OwnersOnly",
    "ACCESS_MODE_ENV",
    "NOT_PROVEN",
    "OWN_PROOF_ROUTES",
    "PUBLIC_ROUTES",
    "access_mode",
    "route_class",
    "route_templates",
    "ONLY_VISITORS",
    "OTHER_APPLICATION",
    "agent_of",
    "battle_of_a2a",
    "battle_of_the_run",
    "enter_battle_run",
    "leave_battle_run",
    "forget_turns",
    "held_to_own_routes",
    "is_anonymous_audience",
    "kept_examples",
    "or_visitors_key",
    "path_answered",
    "session_minutes",
    "turn_api_key",
    "turns_a_day",
    "use_turn_token",
    "visitor_refusal",
    "visitors_runtime",
]

#: The examples a runtime keeps warm for visitors: set, it is the visitors' runtime.
VISITORS_ENV = "AGENT_RUNTIMES_VISITORS"

#: Turns a visitor may take in a day, and how long a session of theirs lives.
TURNS_ENV = "AGENT_RUNTIMES_VISITOR_TURNS"
SESSION_MINUTES_ENV = "AGENT_RUNTIMES_VISITOR_SESSION_MINUTES"
DEFAULT_TURNS = 10
DEFAULT_SESSION_MINUTES = 15

#: The audience of a visitor's token (ai-inference's `anonymous`).
ANONYMOUS_AUDIENCE = "datalayer:ai-inference:anonymous"

#: What a token for an application at its address names: ``at:<slug>``.
AT_PREFIX = "at:"

ONLY_VISITORS = (
    "This runtime holds conversations without an account only: "
    "somebody signed in talks to an application on a runtime of their own."
)
NOT_HERE = "A visitor's token is answered by the visitors' runtime only."
OTHER_APPLICATION = "This visitor's token is for another application."
NO_TOKEN = (
    "A conversation without an account needs a visitor's token from ai-inference: "
    "reload the page to get one."
)
NOTHING_KEPT = (
    "Nothing is kept of a conversation without an account: it cannot be resumed "
    "once this runtime no longer holds it."
)

#: The slug of an address, as ai-agents allows it.
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")


def visitors_runtime() -> bool:
    """Whether this runtime is the visitors' one."""
    return bool((os.environ.get(VISITORS_ENV) or "").strip())


def kept_examples() -> List[str]:
    """The examples this runtime keeps warm, by id."""
    raw = os.environ.get(VISITORS_ENV) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def _positive(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValueError(f"{name}={raw!r} is not a whole number.") from None
    if value <= 0:
        raise ValueError(f"{name}={raw!r} is not a positive number.")
    return value


def turns_a_day() -> int:
    """How many turns a visitor may take in a day."""
    return _positive(TURNS_ENV, DEFAULT_TURNS)


def session_minutes() -> int:
    """How long a visitor's session lives from its start, in minutes."""
    return _positive(SESSION_MINUTES_ENV, DEFAULT_SESSION_MINUTES)


def is_anonymous_audience(claims: Mapping[str, Any]) -> bool:
    """Whether a token's claims are a visitor's, read unverified to choose who checks it."""
    audience = claims.get("aud")
    return audience == ANONYMOUS_AUDIENCE or (
        isinstance(audience, list) and ANONYMOUS_AUDIENCE in audience
    )


def agent_of(app_key: str) -> str:
    """The agent of this runtime an application a token names runs as.

    An example's agent is named by its id, as the page names it; an
    application at its address by ``at-<slug>``.
    """
    if app_key.startswith(AT_PREFIX):
        slug = app_key[len(AT_PREFIX) :]
        if not _SLUG.match(slug):
            raise ValueError(f"{app_key!r} is no application's address.")
        return f"at-{slug}"
    return app_key


# --- what a visitor's turn calls its models with ---------------------------------

#: The visitor's token, in the turn under way: what its model calls are made with.
_TURN_TOKEN: ContextVar[str] = ContextVar("agent_visitor_turn_token", default="")


def use_turn_token(token: str) -> None:
    """Make ``token`` what the turn under way calls its models with ('' for none)."""
    _TURN_TOKEN.set(token or "")


#: A visitor's run of an application served to visitors over A2A, on its
#: owner's runtime (`agent_runtimes.apps.a2a`): only reading, as on the
#: visitors' runtime, while its models are the runtime's.
_READ_ONLY_RUN: ContextVar[str] = ContextVar("agent_visitor_a2a_run", default="")

#: Where the gate marks an A2A run as a visitor's: ``datalayer.visitor`` in the
#: message's metadata, beside the credential (`datalayer.credential`).
A2A_VISITOR_FIELD = "visitor"


def visitor_of_a2a(meta: Any) -> str:
    """The visitor an A2A message was marked for by the gate, or ``""``."""
    from agent_runtimes.context.delegation import DELEGATION_META_KEY

    ours = meta.get(DELEGATION_META_KEY) if isinstance(meta, Mapping) else None
    visitor = ours.get(A2A_VISITOR_FIELD) if isinstance(ours, Mapping) else None
    return visitor if isinstance(visitor, str) else ""


#: Where the gate marks a visitor's A2A run with the catalogue Battle their
#: token names: ``datalayer.battle``, never what the message says.
A2A_BATTLE_FIELD = "battle"

#: The catalogue Battle the run under way is played for, as the visitor's
#: token names it at ai-inference: ``""`` for none (`battle_books`).
_BATTLE_RUN: ContextVar[str] = ContextVar("agent_battle_run", default="")


def battle_of_a2a(meta: Any) -> str:
    """The Battle an A2A message was marked for by the gate, or ``""``."""
    from agent_runtimes.context.delegation import DELEGATION_META_KEY

    ours = meta.get(DELEGATION_META_KEY) if isinstance(meta, Mapping) else None
    battle = ours.get(A2A_BATTLE_FIELD) if isinstance(ours, Mapping) else None
    return battle if isinstance(battle, str) else ""


def enter_battle_run(battle: str) -> Any:
    """Make the run under way a Battle's (``""`` for none); answer the token to reset it."""
    return _BATTLE_RUN.set(battle or "")


def leave_battle_run(token: Any) -> None:
    _BATTLE_RUN.reset(token)


def battle_of_the_run() -> str:
    """The catalogue Battle the run under way is played for, ``""`` for none."""
    return _BATTLE_RUN.get()


def enter_visitor_run(visitor: str) -> Any:
    """Make the run under way a visitor's (``""`` for none); answer the token to reset it."""
    return _READ_ONLY_RUN.set(visitor or "")


def leave_visitor_run(token: Any) -> None:
    _READ_ONLY_RUN.reset(token)


def in_visitor_turn() -> bool:
    """Whether the turn under way is a visitor's: on the visitors' runtime, or over A2A."""
    return bool(_TURN_TOKEN.get()) or bool(_READ_ONLY_RUN.get())


async def turn_api_key() -> str:
    """The key a model call of the visitors' runtime is made with: the visitor's token.

    Read as each call is made. Outside a visitor's turn there is none, and the
    call is not made: this runtime calls no model with any other key.
    """
    from agent_runtimes.models.offered import InferenceTokenMissing

    token = _TURN_TOKEN.get()
    if not token:
        raise InferenceTokenMissing(
            "The visitors' runtime calls a model only in a visitor's turn, with their token."
        )
    return token


def or_visitors_key(otherwise: Any) -> Any:
    """The key a deployment's model call is made with: in a visitor's turn on
    the runtime it is kept on, the visitor's own token, as on the visitors'
    runtime (decided 14 October 2026); else ``otherwise()``, its
    principal's. Read as each call is made.
    """

    async def key() -> str:
        token = _TURN_TOKEN.get()
        if token:
            return token
        return await otherwise()

    return key


#: Said to a visitor's turn on a runtime whose model calls all leave as its application.
VISITOR_PAYS_ITS_OWN = (
    "A visitor's turn calls its models with the visitor's own token, and on this runtime every "
    "model call leaves as the application: the turn is not run. Sign in, or ask its owner to run "
    "it where visitors are served."
)


def principal_key_only(otherwise: Any) -> Any:
    """The key a deployment's model call is made with on a runtime that acts as its
    principal without holding the token (`egress_principal`): ``otherwise()``, its
    principal's, and never a visitor's. Every call there leaves as the application,
    so a visitor's turn, which pays with the visitor's own token, is refused in a
    sentence instead of being charged to the application's owner.
    """

    async def key() -> str:
        if _TURN_TOKEN.get():
            from agent_runtimes.models.offered import InferenceTokenMissing

            raise InferenceTokenMissing(VISITOR_PAYS_ITS_OWN)
        return await otherwise()

    return key


# --- read only --------------------------------------------------------------------


def visitor_refusal(tool: str, classes: Sequence[str], behaviour: str) -> str:
    """Why a visitor's turn may not make a call, or ``""`` when it may.

    Only reading is done without an account, and only what its rules do
    without asking: nobody is there to be asked.
    """
    from agent_runtimes.apps.rules import DO_IT, is_read_only
    from agent_runtimes.apps.visitors_pap import exempts

    if not in_visitor_turn():
        return ""
    if exempts(tool, classes, behaviour):
        # The one company this public deployment lets its visitors use, in its
        # owner's demo account (`visitors_pap`): read, propose, confirm there.
        return ""
    if not is_read_only(classes):
        return (
            f"Without an account it only reads: `{tool}` would do more than read, "
            "so it asked nobody and did nothing."
        )
    if behaviour != DO_IT:
        return (
            f"Without an account nobody is asked: `{tool}` waits for a person, "
            "so it did nothing."
        )
    return ""


# --- limits ---------------------------------------------------------------------


class Turns:
    """The turns each visitor took today, in this process.

    ``limit`` says how many a visitor has in a day, read at each turn:
    :func:`turns_a_day` on the visitors' runtime; an application served over
    A2A to visitors has its own (`agent_runtimes.apps.a2a`).
    """

    def __init__(self, clock: Any = time.time, limit: Any = None) -> None:
        self._clock = clock
        self._limit = limit or turns_a_day
        self._lock = threading.Lock()
        self._day = int(clock() // 86400)
        self._taken: Dict[str, int] = {}

    def take(self, visitor: str) -> Tuple[bool, int]:
        """Take a turn for ``visitor`` if one is left today: (taken, the day's limit)."""
        limit = self._limit()
        with self._lock:
            today = int(self._clock() // 86400)
            if today != self._day:
                self._day, self._taken = today, {}
            taken = self._taken.get(visitor, 0)
            if taken >= limit:
                return False, limit
            self._taken[visitor] = taken + 1
            return True, limit

    def forget(self) -> None:
        with self._lock:
            self._taken.clear()


TURNS = Turns()


def forget_turns() -> None:
    """Forget every visitor's turns (a test)."""
    TURNS.forget()


def admit_turn(
    visitor: str,
    started_at: str,
    *,
    now: Optional[float] = None,
    take: bool = True,
    unlimited: bool = False,
) -> str:
    """Why a visitor's next turn is refused, or ``""`` — and the turn is then taken.

    ``take``: false for a run that only carries what the page's tools
    answered (`page_tools`): the session's minutes are checked, no turn is
    taken. ``unlimited``: the visitor's token says ai-inference exempts their
    address (`Caller.turns_unlimited`): the minutes are checked, no turn is
    counted.
    """
    minutes = session_minutes()
    started = datetime.fromisoformat(started_at)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    at = now if now is not None else time.time()
    if at - started.timestamp() > minutes * 60:
        return (
            f"This conversation without an account has had its {minutes} minutes: "
            "start a new one, or sign in to keep going."
        )
    if not take or unlimited:
        return ""
    taken, limit = TURNS.take(visitor)
    if not taken:
        return (
            f"You have taken today's {limit} turns without an account: "
            "sign in to keep going, or come back tomorrow."
        )
    return ""


# --- reach -----------------------------------------------------------------------

#: The chat's reads of the runtime's models: answered to an application's page.
_READS = ("/api/v1/configure", "/api/v1/configure/models")

#: Under the application routes, and not the application's own: what makes the
#: runtime's agent another application (the companion's, at launch) and the
#: Studio's tools, a person's.
_NOT_THE_APPLICATIONS = (
    "/api/v1/apps/configure",
    "/api/v1/apps/build",
    "/api/v1/apps/eject",
    "/api/v1/apps/owner-secrets",
)

#: Where an agent is served over A2A: its own when it runs an application.
_A2A_AGENTS = "/api/v1/a2a/agents/"

#: What the sandbox reaches on the pod's loopback, with no secret, while code the
#: agent was let run is running: the tool calls of that code.
_SANDBOX_TOOLS = "/api/v1/mcp/proxy/"

#: What a harness reaches on the pod's loopback, by a handle it was given: its
#: lent toolsets (`routes.mcp_lent`), which hold the credential for it.
_LENT_TOOLS = "/api/v1/mcp/lent/"

#: What a harness calls its models through, by the handle it was given: the
#: runtime's token is added there (`routes.inference_relay`).
_INFERENCE_RELAY = "/api/v1/inference/relay/"


#: What a skill in the sandbox publishes its owner's work through, on the pod's
#: loopback (`routes.library`): the owner's token stays in the runtime.
_LIBRARY_PUBLISH = re.compile(r"^/api/v1/library/items/[^/]+/publish/?$")


def sandbox_may_publish(method: str, path: str) -> bool:
    """Whether a loopback call is a skill publishing its owner's work, here and now.

    Only while code the agent was let run is running (`enforcement.code_is_running`),
    as its tool calls are, and only on a runtime launched for a deployment by
    its owner (`principal.kernel_holds_owner_secrets`), where the person
    talking to it is the one whose work it is. Never on the visitors'
    runtime, on a deployment's kept runtime its visitors talk to, or on a
    runtime a visitor launched: there the owner is not the person asking. The
    route still asks for the person's explicit confirmation.
    """
    from agent_runtimes.apps.enforcement import code_is_running
    from agent_runtimes.routes.owner import publication_place_refusal

    # Where a publication may be made is one predicate, the skill's readiness
    # reads it too (`routes.owner.publication_place_refusal`): what is said
    # ready is what is answered here.
    return (
        method == "POST"
        and bool(_LIBRARY_PUBLISH.match(path))
        and publication_place_refusal() is None
        and code_is_running()
    )


#: What Amazon Bedrock AgentCore Runtime calls a runtime started for it at.
_AGENTCORE_CONTRACT = ("/invocations", "/ping", "/ws")


def path_answered(method: str, path: str) -> bool:
    """Whether a request from anybody but the runtime itself is the application's own.

    What the visitors' runtime and a runtime that serves a deployment answer
    (:class:`OwnRoutesOnly`): the application routes — its sessions, its
    chat, its page's plugins and files, its computer, what it remembers, and
    what ai-agents keeps a deployment with (A2A, its principal) — an
    application's agent over A2A, the chat's reads of its models, and health.
    """
    if path.rstrip("/") in _NOT_THE_APPLICATIONS:
        return False
    if path in _AGENTCORE_CONTRACT:
        # AgentCore Runtime's own calls, on a runtime started for it: each
        # invocation is the caller's, by the token it exchanges.
        from agent_runtimes.agentcore.settings import is_agentcore_target

        return is_agentcore_target()
    if path.startswith("/api/v1/apps/") or path == "/api/v1/apps":
        return True
    if path.startswith(_A2A_AGENTS):
        from agent_runtimes.models.models import app_instance_of

        agent = path[len(_A2A_AGENTS) :].split("/", 1)[0]
        return app_instance_of(agent) is not None
    if method in ("GET", "HEAD", "OPTIONS") and path.rstrip("/") in _READS:
        return True
    return path == "/health" or path.startswith("/health/")


#: Said of a route that is not the application's own, on the visitors' runtime.
VISITORS_OWN = "This route of the visitors' runtime is its own."


def held_to_own_routes() -> bool:
    """Whether this runtime answers only the application's own routes (:class:`OwnRoutesOnly`)."""
    from agent_runtimes.apps.principal import a_deployment_is_served, launched_for

    return visitors_runtime() or a_deployment_is_served() or bool(launched_for())


class OwnRoutesOnly:
    """The one gate: a runtime held to the application's own routes (:func:`path_answered`).

    The visitors' runtime always; any other runtime once one of its
    agents serves a deployment (`a_deployment_is_served`) — a deployment's kept
    runtime, or the one a hosted page launched for it, beside the agent it was
    allocated with. Every other route — configuring it, its inference token,
    codemode, its sandbox and its websocket, making, changing, listing or
    deleting agents, MCP servers, skills, history, the monitoring stream —
    answers 404 in a sentence, over HTTP and on a websocket's handshake alike.
    The pod itself (`callers.is_the_pod`) is answered everywhere, and the
    sandbox's tool calls through the MCP proxy from its loopback only while
    code the agent was let run is running (`enforcement.code_is_running`),
    each decided as a tool call of that run.

    A runtime launched for a deployment is held to this from its launch, as
    soon as it holds its proof, not from its first agent: until then it
    answers the making of that deployment's agent, and nothing else from
    outside (found 31 October 2026: until its first agent, whoever launched it
    could configure it as they would a runtime of their own).
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        from starlette.responses import JSONResponse

        from agent_runtimes.apps.callers import (
            POD_SECRET_HEADER,
            is_loopback,
            is_the_pod,
        )
        from agent_runtimes.apps.enforcement import code_is_running
        from agent_runtimes.apps.principal import (
            OWN_ROUTES_ONLY,
            a_deployment_is_served,
            launched_for,
        )
        from agent_runtimes.routes.owner import sandbox_may_ask

        visitors = visitors_runtime()
        served = a_deployment_is_served()
        launched = bool(launched_for())
        method = scope.get("method") or "GET"
        host = (scope.get("client") or (None,))[0]
        secret = next(
            (
                value.decode()
                for key, value in scope.get("headers") or []
                if key.decode().lower() == POD_SECRET_HEADER.lower()
            ),
            None,
        )
        if (
            not (visitors or served or launched)
            or path_answered(method, scope["path"])
            or is_the_pod(host, secret)
            or (
                is_loopback(host)
                and scope["path"].startswith(_SANDBOX_TOOLS)
                and code_is_running()
            )
            or (
                is_loopback(host)
                and scope["path"].startswith((_LENT_TOOLS, _INFERENCE_RELAY))
            )
            # A skill publishing its owner's work, from the sandbox
            # (`routes.library`), which holds no pod secret.
            or (is_loopback(host) and sandbox_may_publish(method, scope["path"]))
            # A skill asking who the runtime runs for, or for its agent's
            # events (`routes.owner`): no credential reaches the sandbox.
            or (is_loopback(host) and sandbox_may_ask(method, scope["path"]))
            # Launched for a deployment, it is held here from its launch; the
            # one thing it still answers is the making of that deployment's
            # agent (`principal.agent_refused_here`, in the route).
            or (
                launched
                and not served
                and method == "POST"
                and scope["path"].rstrip("/") == "/api/v1/agents"
            )
        ):
            await self.app(scope, receive, send)
            return
        refused = JSONResponse(
            {"detail": VISITORS_OWN if visitors else OWN_ROUTES_ONLY},
            status_code=404,
        )
        if scope["type"] == "websocket":
            from starlette.websockets import WebSocket

            await WebSocket(scope, receive, send).send_denial_response(refused)
            return
        await refused(scope, receive, send)


# --- the lock: the runtime's own routes are its owner's -----------------------------

#: The setting that says whether a call that did not prove the runtime is its
#: caller's is served and logged (``log``) or refused (``enforce``).
ACCESS_MODE_ENV = "AGENT_RUNTIMES_ACCESS_MODE"

#: Where the lock says its mode in a request's scope, for the routes behind it.
ACCESS_MODE_SCOPE_KEY = "agent_runtimes.access_mode"

#: The two modes, and the one a runtime starts in when the setting is not there.
ACCESS_MODES = ("log", "enforce")
DEFAULT_ACCESS_MODE = "log"

#: Answered with no credential, by design: the probes of whatever keeps the
#: runtime (they say nothing of its sandbox's credentials to such a caller),
#: the built pages, which are the same files for everybody, and what a page
#: reads of an application's plugins. Exact routes: a route added beside one
#: of these is the owner's until it is listed here.
PUBLIC_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/health"),
        ("GET", "/health/live"),
        ("GET", "/health/ready"),
        ("GET", "/health/startup"),
        ("GET", "/agent"),
        ("GET", "/static/{path:path}"),
        ("GET", "/html/{path:path}"),
        # Which of an application's plugins the runtime holds, and its page's
        # files: read by a browser's EventSource and script tags, which send
        # no token, and about the one application whoever asks names
        # (`routes.app_plugins`).
        ("GET", "/api/v1/apps/{app_id}/plugins/state"),
        ("GET", "/api/v1/apps/{app_id}/plugins/frontend-extensions"),
        ("GET", "/api/v1/apps/{app_id}/events/stream"),
        (
            "GET",
            "/api/v1/apps/{app_id}/reactor-extensions/{extension}/{asset_path:path}",
        ),
    }
)

#: Routes that carry a proof of their own, checked by the route: a code or a
#: state minted for one use by a call that was itself the owner's, a trigger's
#: declared source, and the contracts of the platforms a runtime is started
#: for (each invocation is its caller's by the token it exchanges).
OWN_PROOF_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/v1/agent/handoff/exchange"),
        ("GET", "/api/v1/mcp/auth/callback"),
        ("POST", "/api/v1/identity/oauth/token"),
        ("POST", "/api/v1/identity/oauth/userinfo"),
        ("GET", "/api/v1/agents/{agent_id}/webhook"),
        ("POST", "/api/v1/agents/{agent_id}/webhook"),
        ("GET", "/ate/wakeup"),
        ("GET", "/ate/identity"),
        ("GET", "/ping"),
        ("POST", "/invocations"),
        ("WS", "/ws"),
    }
)

#: The application routes: each verifies its caller itself against what the
#: application's deployment declares (a visitor's, an embed's, a host's, a
#: member's or its principal's token; nothing for what a public one shows).
_APPLICATION_ROUTES = "/api/v1/apps"

#: Said, in ``enforce`` mode, to a call that did not prove the runtime is its caller's.
NOT_PROVEN = (
    "This route is the runtime owner's: send the owner's Datalayer token, or the "
    "runtime's own token, as a Bearer token (the token query parameter on a websocket)."
)


def access_mode(environ: Optional[Mapping[str, str]] = None) -> str:
    """The mode this runtime's lock runs in, read when it starts.

    Raises
    ------
    ValueError
        When the setting is there and is neither ``log`` nor ``enforce``: a
        runtime does not start on a setting it cannot read, in either mode.
    """
    env = os.environ if environ is None else environ
    said = (env.get(ACCESS_MODE_ENV) or "").strip().lower()
    if not said:
        return DEFAULT_ACCESS_MODE
    if said not in ACCESS_MODES:
        raise ValueError(
            f"{ACCESS_MODE_ENV} is {said!r}: it is 'log' (serve and log a call that "
            "did not prove the runtime is its caller's) or 'enforce' (refuse it)."
        )
    return said


def _template_pattern(template: str) -> "re.Pattern[str]":
    """A route's path, as a pattern a request's path is matched against."""
    from starlette.routing import compile_path

    return compile_path(template)[0]


_DECLARED = {
    (method, template): _template_pattern(template)
    for method, template in sorted(PUBLIC_ROUTES | OWN_PROOF_ROUTES)
}


def _declared(method: str, path: str, routes: frozenset[tuple[str, str]]) -> bool:
    """Whether a request is one of the routes a list declares, by method and template."""
    asked = "GET" if method == "HEAD" else method
    return any(
        asked == of and _DECLARED[(of, template)].match(path) is not None
        for of, template in routes
    )


def route_class(method: str, path: str) -> str:
    """What a route of the runtime is: ``public``, ``own-proof``, ``application`` or ``owner``.

    ``method`` is an HTTP method, or ``WS`` for a websocket's handshake. A
    route that is none of the first three is its owner's: that is the default,
    and what a route added tomorrow is until somebody lists it.
    """
    if _declared(method, path, PUBLIC_ROUTES):
        return "public"
    if path in ("/ping", "/invocations", "/ws"):
        from agent_runtimes.agentcore.settings import is_agentcore_target

        return "own-proof" if is_agentcore_target() else "owner"
    if path.startswith("/ate/"):
        from agent_runtimes.ate.settings import is_ate_target

        if not is_ate_target():
            return "owner"
    if _declared(method, path, OWN_PROOF_ROUTES):
        return "own-proof"
    if path == _APPLICATION_ROUTES or path.startswith(_APPLICATION_ROUTES + "/"):
        return "application"
    if path.startswith(_A2A_AGENTS):
        from agent_runtimes.models.models import app_instance_of

        agent = path[len(_A2A_AGENTS) :].split("/", 1)[0]
        if app_instance_of(agent) is not None:
            return "application"
    if (
        held_to_own_routes()
        and method in ("GET", "HEAD")
        and path.rstrip("/") in _READS
    ):
        # The chat's reads of its models, on a runtime that serves an
        # application: answered to the application's page (`path_answered`).
        return "application"
    return "owner"


def _host_of(value: str) -> str:
    """The host of an Origin or a Referer, never its path or its query."""
    if not value:
        return ""
    try:
        from urllib.parse import urlsplit

        return (urlsplit(value).hostname or "")[:120]
    except ValueError:
        return ""


def caller_kind(scope: Any, headers: Mapping[str, str]) -> dict[str, str]:
    """Who a call seems to come from, for a log line: never a token, never a query.

    ``agent`` is the client's product (the first word of its User-Agent),
    ``origin`` and ``referer`` the hosts a browser names, and ``source`` where
    the call entered: ``loopback`` (its peer is the machine itself, whatever
    headers it sends), ``ingress`` (a proxy passed it on) or ``cluster``
    (straight from another address, with no proxy before it).
    """
    from agent_runtimes.apps.callers import is_forwarded, is_loopback

    host = (scope.get("client") or (None,))[0]
    agent = (headers.get("user-agent") or "").split(" ", 1)[0][:60]
    # By the peer first: a forwarding header is only a header, and a page on
    # the machine itself may send one.
    if is_loopback(host):
        source = "loopback"
    elif is_forwarded(headers):
        source = "ingress"
    else:
        source = "cluster"
    return {
        "agent": agent or "-",
        "origin": _host_of(headers.get("origin") or "") or "-",
        "referer": _host_of(headers.get("referer") or "") or "-",
        "source": source,
    }


_ACCESS_LOGGER = logging.getLogger("agent_runtimes.access")
_ACCESS_COUNTER: dict[str, Any] = {}

#: Counted at most this often for one route, reason and caller: a page that
#: polls is one line a minute, not one a second. The counter counts every call.
ACCESS_LOG_EVERY_SECONDS = 60.0
_ACCESS_LOGGED: dict[tuple[str, ...], float] = {}


def _count_unproven(attributes: dict[str, str]) -> None:
    """One more call that did not prove itself, on the OTEL counter when there is a meter."""
    if "counter" not in _ACCESS_COUNTER:
        counter = None
        try:
            from agent_runtimes.otel import get_meter

            meter = get_meter()
            if meter is not None:
                counter = meter.create_counter(
                    "agent_runtimes.access.unproven",
                    description=(
                        "Calls to a runtime owner's route that did not prove the "
                        "runtime is the caller's, by route, reason and caller."
                    ),
                )
        except Exception:  # noqa: BLE001 - no meter is no counter; the log line stands
            counter = None
        _ACCESS_COUNTER["counter"] = counter
    counter = _ACCESS_COUNTER["counter"]
    if counter is not None:
        try:
            counter.add(1, attributes)
        except Exception:  # noqa: BLE001 - counting never fails a request
            pass


def note_unproven(
    mode: str, method: str, template: str, reason: str, caller: Mapping[str, str]
) -> None:
    """Say, in one line and on one counter, that a call did not prove itself.

    The line is ``ACCESS unproven`` followed by ``key=value`` pairs: the mode,
    what was done about it (``served`` or ``refused``), the method, the route
    (its template, never the path asked, never a query), the reason and the
    caller's kind (:func:`caller_kind`). No token is ever in it.
    """
    attributes = {
        "mode": mode,
        "method": method,
        "route": template,
        "reason": reason,
        "agent": caller.get("agent", "-"),
        "origin": caller.get("origin", "-"),
        "referer": caller.get("referer", "-"),
        "source": caller.get("source", "-"),
    }
    _count_unproven(attributes)
    key = tuple(attributes.values())
    now = time.monotonic()
    last = _ACCESS_LOGGED.get(key)
    if last is not None and now - last < ACCESS_LOG_EVERY_SECONDS:
        return
    if len(_ACCESS_LOGGED) > 2048:
        _ACCESS_LOGGED.clear()
    _ACCESS_LOGGED[key] = now
    _ACCESS_LOGGER.warning(
        "ACCESS unproven mode=%s action=%s method=%s route=%s reason=%s agent=%s "
        "origin=%s referer=%s source=%s",
        mode,
        "refused" if mode == "enforce" else "served",
        method,
        template,
        reason,
        attributes["agent"],
        attributes["origin"],
        attributes["referer"],
        attributes["source"],
    )


class OwnersOnly:
    """The lock: every route of a runtime that is not public, an application's or
    self-proving answers its owner, and nobody else (:func:`route_class`).

    Beside :class:`OwnRoutesOnly`, which says *which* routes a runtime that
    serves an application answers, this says *who* the others answer: a call
    that proves the runtime is its caller's (`callers.proves_the_runtime`: the
    machine itself, the runtime's own token, or its owner's Datalayer token),
    over HTTP and on a websocket's handshake alike, the dynamic AG-UI and A2A
    mounts included. It fails closed: a route nobody listed is the owner's.

    In ``log`` mode a call that proves nothing is served as before and said in
    one line and on one counter (:func:`note_unproven`), so that the callers to
    fix are known before anything is refused; in ``enforce`` mode it is refused
    in a sentence (401, or a websocket's denial). The mode is read once, when
    the runtime starts (:func:`access_mode`), and a runtime does not start on a
    mode it cannot read.

    Parameters
    ----------
    app : Any
        The ASGI application behind the lock.
    mode : str | None
        ``log`` or ``enforce``; read from the environment when not given.
    templates : Callable[[], list[tuple[str, str]]] | None
        The routes of the application, as ``(method, template)``, read once
        when the first line is logged: a log line names a route by its
        template, never by the path that was asked.
    """

    def __init__(
        self,
        app: Any,
        mode: Optional[str] = None,
        templates: Optional[Callable[[], list[tuple[str, str]]]] = None,
    ) -> None:
        """Read the mode, and keep how the routes' templates are read."""
        self.app = app
        self.mode = (
            access_mode() if mode is None else access_mode({ACCESS_MODE_ENV: mode})
        )
        self._templates = templates
        self._patterns: Optional[list[tuple[str, str, Any]]] = None

    def template_of(self, method: str, path: str) -> str:
        """The route a path is, by its template; its first two segments when no route is."""
        if self._patterns is None:
            listed = self._templates() if self._templates is not None else []
            self._patterns = [
                (of, template, _template_pattern(template)) for of, template in listed
            ]
        asked = "GET" if method == "HEAD" else method
        for of, template, pattern in self._patterns:
            if of == asked and pattern.match(path) is not None:
                return template
        # A dynamic mount (an agent's AG-UI or A2A application), or no route at all.
        parts = [part for part in path.split("/") if part]
        known = (
            "/" + "/".join(parts[:3])
            if parts[:2] == ["api", "v1"]
            else "/" + "/".join(parts[:1])
        )
        return (
            f"{known}/…"
            if len(parts) > (3 if parts[:2] == ["api", "v1"] else 1)
            else known
        )

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        """Pass on what needs no proof or gave one; say, and in ``enforce`` refuse, the rest."""
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        # What the routes behind read the lock's mode by (`callers.reads_the_sandbox_token`).
        scope[ACCESS_MODE_SCOPE_KEY] = self.mode
        method = (
            "WS" if scope["type"] == "websocket" else (scope.get("method") or "GET")
        )
        path = scope["path"]
        if method == "OPTIONS" or route_class(method, path) != "owner":
            await self.app(scope, receive, send)
            return
        from agent_runtimes.apps.callers import (
            from_a_strangers_page,
            headers_of,
            is_loopback,
            proves_the_runtime,
            strangers_page_refused,
        )

        proof = await proves_the_runtime(scope)
        if proof.sufficient:
            await self.app(scope, receive, send)
            return
        headers = headers_of(scope)
        host = (scope.get("client") or (None,))[0]
        if is_loopback(host) and from_a_strangers_page(headers):
            # Another site's page on the machine itself is no caller to log
            # and serve, in either mode: whatever forwarding header it sends
            # (a page may send one: CORS lets it), the loopback is its peer.
            note_unproven(
                "enforce",
                method,
                self.template_of(method, path),
                "strangers-page",
                caller_kind(scope, headers),
            )
            await strangers_page_refused(scope, receive, send)
            return
        note_unproven(
            self.mode,
            method,
            self.template_of(method, path),
            proof.reason,
            caller_kind(scope, headers_of(scope)),
        )
        if self.mode != "enforce":
            await self.app(scope, receive, send)
            return
        from starlette.responses import JSONResponse

        refused = JSONResponse(
            {"detail": NOT_PROVEN},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
        if scope["type"] == "websocket":
            from starlette.websockets import WebSocket

            await WebSocket(scope, receive, send).send_denial_response(refused)
            return
        await refused(scope, receive, send)


def route_templates(app: Any) -> list[tuple[str, str]]:
    """Every route of an application as ``(method, template)``, ``WS`` for a websocket.

    Read through the routers an application includes, whichever way the
    framework keeps them, so that the lock's log names a route by its template
    and a test can hold every route to its class.
    """
    found: list[tuple[str, str]] = []

    def walk(routes: Any, prefix: str) -> None:
        """Add the routes of one router, under the prefix it was included with."""
        for route in routes or []:
            original = getattr(route, "original_router", None)
            if original is not None:
                context = getattr(route, "include_context", None)
                walk(original.routes, prefix + (getattr(context, "prefix", "") or ""))
                continue
            path = prefix + (getattr(route, "path", "") or "")
            kind = type(route).__name__
            if kind == "Mount":
                found.append(("GET", path.rstrip("/") + "/{path:path}"))
            elif getattr(route, "methods", None):
                found.extend((method, path) for method in sorted(route.methods))
            elif "WebSocket" in kind:
                found.append(("WS", path))

    walk(getattr(app, "routes", []), "")
    return found


def loopback_url() -> str:
    """The runtime itself, as the pod reaches it."""
    return f"http://127.0.0.1:{os.environ.get('AGENT_RUNTIMES_PORT') or '8765'}"


def _create_body(
    name: str, spec: Dict[str, Any], instance: Dict[str, Any]
) -> Dict[str, Any]:
    """What an application's agent is made with here, as the page makes it elsewhere."""
    from agent_runtimes.apps.loading import load_app

    return {
        "name": name,
        "transport": "ag-ui",
        "agent_spec_id": load_app(spec).agent,
        "app_spec": spec,
        "app_instance": instance,
        "enable_codemode": False,
    }


class AddressRefused(Exception):
    """An application at an address a visitor may not talk to: its status and why."""

    def __init__(self, status: int, reason: str):
        self.status = status
        self.reason = reason
        super().__init__(reason)


#: Who resolves an address as nobody: ai-agents, or a test. (slug) -> (status, body).
_resolver: Dict[str, Any] = {}

#: Who makes and deletes this runtime's agents: its own API, or a test.
_maker: Dict[str, Any] = {}

#: One making at a time per address.
_making: Dict[str, Any] = {}


async def _resolve_at(slug: str) -> Tuple[int, Dict[str, Any]]:
    """The application at an address, as ai-agents answers somebody not signed in."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        return 503, {"detail": "No ai-agents is configured to find the application."}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/at/{slug}"
            )
    except httpx.HTTPError as error:
        return 503, {
            "detail": f"ai-agents could not be asked for the application: {error}."
        }
    try:
        body = response.json()
    except ValueError:
        body = {"detail": response.text[:200]}
    return response.status_code, body if isinstance(body, dict) else {}


async def _make_agent(name: str, body: Optional[Dict[str, Any]]) -> Tuple[int, str]:
    """Make (``body``) or delete (``None``) one of this runtime's agents, through its own API."""
    import httpx

    from agent_runtimes.apps.callers import runtime_auth_headers

    # Signed as the runtime itself: the loopback is no proof of anybody.
    async with httpx.AsyncClient(
        base_url=loopback_url(), timeout=120.0, headers=runtime_auth_headers()
    ) as client:
        if body is None:
            response = await client.delete(f"/api/v1/agents/{name}")
        else:
            response = await client.post("/api/v1/agents", json=body)
    return response.status_code, response.text[:300]


def use_address_resolver(resolver: Any = None, maker: Any = None) -> None:
    """Who resolves addresses and makes agents: ai-agents and this API, or a test's."""
    _resolver["resolve"] = resolver or _resolve_at
    _maker["make"] = maker or _make_agent


use_address_resolver()


#: Said by the visitors' runtime of an address whose version has code of its own.
RUNS_ITS_CODE_ELSEWHERE = (
    "It runs its own code on the runtime it is kept on, not on the visitors' "
    "runtime: open it at its address again."
)
#: Said by a deployment's runtime of an address it does not serve.
NOT_SERVED_HERE = "This runtime does not run the application at that address."
#: Said by a deployment's runtime of an address written as a spec.
SPEC_ON_VISITORS = (
    "Without an account it is talked to on the visitors' runtime: open it at "
    "its address again."
)


def _where_refused(said: Mapping[str, Any], deployment_uid: str) -> str:
    """Why this runtime does not talk to a visitor of an address, or ``""``
    (decided 14 October 2026). A version with code of its own
    (``runs_code``, as ai-agents answers somebody without an account) runs
    on the runtime it is kept on, never on the visitors' — where its plain
    agent would answer in its code's place; that runtime talks to visitors
    of its own deployment, and only of one with code.
    """
    from agent_runtimes.apps.principal import deployments_served

    runs_code = said.get("runs_code")
    if not isinstance(runs_code, bool):
        return "ai-agents did not say whether it runs code of its own: it is not run."
    if visitors_runtime():
        return RUNS_ITS_CODE_ELSEWHERE if runs_code else ""
    if deployment_uid not in deployments_served():
        return NOT_SERVED_HERE
    return "" if runs_code else SPEC_ON_VISITORS


async def ensure_address_agent(app_key: str) -> str:
    """The agent of the application at an address, made here if it is not, or made again
    when its owner moved it to another version: on the visitors'
    runtime for a version written as a spec; on the runtime its deployment is
    kept on for one with code of its own, which that agent runs — the code
    read from the deployment as nobody, as the agent is made.

    Asked of ai-agents as nobody: refused, in its sentence, when the address
    lets nobody in, or a visitor nobody knows may not talk to it.
    """
    import asyncio

    from agent_runtimes.routes import agents as agent_routes

    name = agent_of(app_key)
    slug = app_key[len(AT_PREFIX) :]
    lock = _making.setdefault(slug, asyncio.Lock())
    async with lock:
        status, said = await _resolver["resolve"](slug)
        if status != 200:
            raise AddressRefused(
                status if status in (401, 403, 404, 409) else 503,
                str(said.get("detail") or f"ai-agents did not find it ({status})."),
            )
        session = said.get("session") or {}
        if not said.get("visitor") or not session.get("opens"):
            raise AddressRefused(
                401, str(session.get("reason") or "Sign in to talk to it.")
            )
        deployment = said.get("deployment") or {}
        spec = said.get("spec")
        if not isinstance(spec, dict):
            raise AddressRefused(
                409, "Its owner has to deploy it again before anybody can talk to it."
            )
        where_refused = _where_refused(said, str(deployment.get("uid") or ""))
        if where_refused:
            raise AddressRefused(409, where_refused)
        instance = {
            "app_uid": str(deployment.get("app_uid") or ""),
            "deployment_uid": str(deployment.get("uid") or ""),
            "version": int(deployment.get("version") or 0),
            "visitor_app": app_key,
            # Whose deployment it is, as ai-agents said it: a demo of the
            # account that keeps the demo books reaches them (`battle_books`).
            "owner_uid": str(deployment.get("account_uid") or ""),
        }
        held = (agent_routes._agentspecs.get(name) or {}).get("app_instance") or {}
        if held and all(held.get(key) == value for key, value in instance.items()):
            return name
        if held:
            await _maker["make"](name, None)
        made, why = await _maker["make"](name, _create_body(name, spec, instance))
        if made >= 300:
            raise AddressRefused(
                503, f"Its agent could not be made here ({made}): {why}"
            )
        return name


async def warm(base_url: str, *, attempts: int = 60) -> List[str]:
    """Make the agents of the examples this runtime keeps, through its own API.

    As the companion configures a pooled runtime over its loopback: each
    example's agent made under its id, with its Appspec, over AG-UI. What
    could not be made is logged and said back; the others run.
    """
    import asyncio
    import logging

    import httpx

    from agent_runtimes.apps.callers import runtime_auth_headers
    from agent_runtimes.apps.loading import AppNotRunnable

    logger = logging.getLogger(__name__)
    made: List[str] = []
    # Signed as the runtime itself: the loopback is no proof of anybody.
    async with httpx.AsyncClient(
        base_url=base_url, timeout=120.0, headers=runtime_auth_headers()
    ) as client:
        for _ in range(attempts):
            try:
                if (await client.get("/health/ready")).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            await asyncio.sleep(1.0)
        for example in kept_examples():
            spec = example_spec(example)
            if spec is None:
                logger.warning(
                    "The visitors' runtime keeps no example %s: none in the catalogue.",
                    example,
                )
                continue
            try:
                body = _create_body(example, spec, {"visitor_app": example})
            except AppNotRunnable as refused:
                logger.warning(
                    "The example %s is not runnable: %s", example, refused.problems
                )
                continue
            response = await client.post("/api/v1/agents", json=body)
            if response.status_code >= 300:
                logger.warning(
                    "The agent of the example %s was not made (%s): %s",
                    example,
                    response.status_code,
                    response.text[:300],
                )
                continue
            made.append(example)
            logger.info("The visitors' runtime keeps %s warm.", example)
    return made


def example_spec(example: str) -> Optional[Dict[str, Any]]:
    """An example's Appspec, as the catalogue holds it, or ``None``."""
    from pathlib import Path

    import yaml

    try:
        import agentspecs.apps as catalogue
    except ImportError:
        return None
    path = Path(catalogue.__file__).parent / f"{example}.yaml"
    if not path.is_file():
        return None
    spec = yaml.safe_load(path.read_text(encoding="utf-8"))
    return spec if isinstance(spec, dict) else None
