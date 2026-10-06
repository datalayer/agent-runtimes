# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Signed-out sessions, on the visitors' runtime (plans/LOOP.md, R-30).

A visitor without an account talks to an application on a runtime kept warm
for everybody without one: the runtime image the pools run, started with
``AGENT_RUNTIMES_VISITORS`` — the examples it keeps warm, each one's agent
made as it starts — and nobody's token. Every other runtime refuses a
visitor, and this one refuses anybody signed in: a person has runtimes of
their own.

**Who calls.** A visitor holds a token ai-inference minted for them
(``POST /anonymous/token``), naming the visitor — the id their tab keeps —
and the application it is for: an example's id, or ``at:<slug>`` for an
application at its address that its owner lets anybody open (D-02). The
runtime asks ai-inference who it is for (``GET /anonymous/whoami``), as any
runtime asks IAM who a person is (R-32,
`agent_runtimes.loop.apps.callers`). A caller is then ``visitor:<id>``.

**A session is its own.** A visitor's session answers that visitor and
nobody else, on the same runtime as everybody else's: somebody else's is not
found, as for people (R-04). A token reaches the one application it names.

**What a visitor is given.** Model calls go to ai-inference with the
visitor's own token, read as each call is made (:func:`turn_api_key`) and
never another key, so ai-inference's anonymous limits and its ceiling for
the day apply and nobody's account pays. A tool whose action class is not
*read* is refused before it runs, whatever the application's rules say
(:func:`visitor_refusal`). Nothing is remembered (R-36) and no record is
sent (`AppRecorder.kept`).

**Limits.** Per visitor, a number of turns a day
(``AGENT_RUNTIMES_VISITOR_TURNS``, 10) and a session's life from its start
(``AGENT_RUNTIMES_VISITOR_SESSION_MINUTES``, 15), each said in a sentence
when it is reached. The rate of model calls and the day's ceiling are
ai-inference's.

**Reach.** Only the application routes and the chat's reads of its models
answer anybody but the pod itself (:func:`path_answered`): every other route
of a runtime — making agents, configuring it, its MCP servers — is the
pod's own, as its ingress publishes nothing else either.
"""

from __future__ import annotations

import os
import re
import threading
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

__all__ = [
    "AT_PREFIX",
    "NOT_HERE",
    "ONLY_VISITORS",
    "OTHER_APPLICATION",
    "agent_of",
    "forget_turns",
    "is_anonymous_audience",
    "kept_examples",
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
_TURN_TOKEN: ContextVar[str] = ContextVar("loop_visitor_turn_token", default="")


def use_turn_token(token: str) -> None:
    """Make ``token`` what the turn under way calls its models with ('' for none)."""
    _TURN_TOKEN.set(token or "")


#: A visitor's run of an application served to visitors over A2A, on its
#: owner's runtime (`agent_runtimes.loop.apps.a2a`): only reading, as on the
#: visitors' runtime, while its models are the runtime's.
_READ_ONLY_RUN: ContextVar[str] = ContextVar("loop_visitor_a2a_run", default="")

#: Where the gate marks an A2A run as a visitor's: ``datalayer.visitor`` in the
#: message's metadata, beside the credential (`datalayer.credential`).
A2A_VISITOR_FIELD = "visitor"


def visitor_of_a2a(meta: Any) -> str:
    """The visitor an A2A message was marked for by the gate, or ``""``."""
    from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

    ours = meta.get(DELEGATION_META_KEY) if isinstance(meta, Mapping) else None
    visitor = ours.get(A2A_VISITOR_FIELD) if isinstance(ours, Mapping) else None
    return visitor if isinstance(visitor, str) else ""


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


# --- read only --------------------------------------------------------------------


def visitor_refusal(tool: str, classes: Sequence[str], behaviour: str) -> str:
    """Why a visitor's turn may not make a call, or ``""`` when it may.

    Only reading is done without an account, and only what its rules do
    without asking: nobody is there to be asked.
    """
    from agent_runtimes.loop.apps.rules import DO_IT, is_read_only

    if not in_visitor_turn():
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
    A2A to visitors has its own (`agent_runtimes.loop.apps.a2a`).
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


def admit_turn(visitor: str, started_at: str, *, now: Optional[float] = None) -> str:
    """Why a visitor's next turn is refused, or ``""`` — and the turn is then taken."""
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
    taken, limit = TURNS.take(visitor)
    if not taken:
        return (
            f"You have taken today's {limit} turns without an account: "
            "sign in to keep going, or come back tomorrow."
        )
    return ""


# --- reach -----------------------------------------------------------------------

#: The chat's reads of the runtime's models: answered to a visitor's page.
_READS = ("/api/v1/configure", "/api/v1/configure/models")


def path_answered(method: str, path: str) -> bool:
    """Whether the visitors' runtime answers a request from anybody but itself."""
    if path.startswith("/api/v1/apps/") or path == "/api/v1/apps":
        return True
    if method in ("GET", "HEAD", "OPTIONS") and path.rstrip("/") in _READS:
        return True
    return path == "/health" or path.startswith("/health/")


def loopback_url() -> str:
    """The runtime itself, as the pod reaches it."""
    return f"http://127.0.0.1:{os.environ.get('AGENT_RUNTIMES_PORT') or '8765'}"


def _create_body(
    name: str, spec: Dict[str, Any], instance: Dict[str, Any]
) -> Dict[str, Any]:
    """What an application's agent is made with here, as the page makes it elsewhere."""
    from agent_runtimes.loop.apps.loading import load_app

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

    async with httpx.AsyncClient(base_url=loopback_url(), timeout=120.0) as client:
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


async def ensure_address_agent(app_key: str) -> str:
    """The agent of the application at an address, made here if it is not, or made again
    when its owner moved it to another version (R-30, D-02).

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
        instance = {
            "app_uid": str(deployment.get("app_uid") or ""),
            "deployment_uid": str(deployment.get("uid") or ""),
            "version": int(deployment.get("version") or 0),
            "visitor_app": app_key,
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

    from agent_runtimes.loop.apps.loading import AppNotRunnable

    logger = logging.getLogger(__name__)
    made: List[str] = []
    async with httpx.AsyncClient(base_url=base_url, timeout=120.0) as client:
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
