# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application served over A2A, to the members of its team (agentspecs `teams`).

A team of applications says who asks whom (``talks_to``, over ``a2a``). The
application asked is served here with fasta2a, through the runtime's own A2A
route (`agent_runtimes.routes.a2a`): its agent, with its connections and its
rules, answers at ``/api/v1/a2a/agents/<application id>/``. Its agent card is
written from its Appspec: its name, its description, and one skill named for
it, whose examples are its starters. A request is text; an answer is text
and, when the caller accepts one (``acceptedOutputModes``), a format its
Appspec says it gives besides (``interface.outputs``, the card's output
modes) — a Jupyter notebook, as an artifact beside the text
(`agent_runtimes.output.formats`).

**Who it answers.** The machine itself, without a token: a developer's
browser and a local server. Anybody else holds a key granted to this route
and nothing more: a token IAM exchanged from a task grant (`task_grant_uid`)
whose task is this route on this runtime (:func:`task_prefix`). It is checked
with IAM, as every caller of an application's routes is
(`agent_runtimes.loop.apps.callers`). Without a token, the answer is 401; with
a key for another route, or with a person's own token, it is 403. The agent
card is read by anyone: it says what may be asked, and that a key is needed.

**As whom it runs.** A run started by a remote caller acts with the caller's
key and never with the runtime's own: the key is handed to the run as its
delegated credential (`datalayer.credential`, O1-17), so the Datalayer MCP
gateway is reached with it (`agent_runtimes.mcp.datalayer_gateway`) and
decides what it reaches from what the key was granted.

**Visitors.** An application its owner served *open to visitors*
(``/apps/configure`` with ``visitors: true``) also answers a visitor without
an account, as LOOP R-30 does for ``at:<slug>`` addresses: a visitor's token
from ai-inference (``POST /anonymous/token``) naming the visitor and this
application by its id, verified with ai-inference (``GET /anonymous/whoami``).
A token for another application is refused. A visitor's run never acts with
the visitor's token, and it only reads: the gate marks it a visitor's
(``datalayer.visitor``), and its tools are then refused anything that does
more than read, or that its rules would ask about, as on the visitors'
runtime (`agent_runtimes.loop.apps.visitors.visitor_refusal`). It keeps the
owner's credential: the runtime's own, or — given as ``visitors_key`` — the
owner's key granted to this route that reaches the connections read only
(``make_temp_key.py``'s shape), its delegated credential. The owner pays for these
runs, so they are counted at the gate (:class:`VisitorsOpen`): a few a day per
visitor (``AGENT_RUNTIMES_A2A_VISITOR_TURNS``, 3) and a ceiling a day for all
of them together (``AGENT_RUNTIMES_A2A_VISITORS_TURNS_A_DAY``, 100), each said
in a sentence when reached (429). Only a request that starts a run is counted:
reading a task is not. The counts live in this process.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from agent_runtimes.loop.apps.callers import (
    VERIFIER,
    CallerRefused,
    CallerVerifier,
    _unverified_claims,
    bearer_of,
    is_loopback,
)
from agent_runtimes.loop.apps.visitors import (
    OTHER_APPLICATION,
    Turns,
    is_anonymous_audience,
)

logger = logging.getLogger(__name__)

__all__ = [
    "A2AGate",
    "SECURITY_REQUIREMENTS",
    "SECURITY_SCHEME",
    "VisitorsOpen",
    "as_visitors_run",
    "visitors_key_problem",
    "card_of",
    "serve_app_over_a2a",
    "served_apps",
    "stop_serving_apps",
    "task_prefix",
]

#: The methods that start a run, by both their names: fasta2a's and A2A 1.0's.
_RUN_METHODS = frozenset(
    {"message/send", "message/stream", "SendMessage", "SendStreamingMessage"}
)

#: How the card says a caller authenticates: fasta2a writes it on the card.
SECURITY_SCHEME = "datalayer"

#: The scheme, as fasta2a's `SecurityScheme`.
_SCHEMES = {
    SECURITY_SCHEME: {
        "http_auth_security_scheme": {
            "scheme": "Bearer",
            "bearer_format": "JWT",
            "description": (
                "A Datalayer key granted to this route: a token exchanged from a "
                "task grant whose task is this application's route on this "
                "runtime. The machine itself needs none."
            ),
        }
    }
}

#: Every request asks for it, as fasta2a's `SecurityRequirement`.
SECURITY_REQUIREMENTS = [{"schemes": {SECURITY_SCHEME: []}}]


async def read_body(receive: Any) -> bytes:
    """The whole body of a request, read from ``receive``."""
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] != "http.request":
            continue
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            return b"".join(chunks)


def replay(body: bytes, receive: Any) -> Any:
    """A ``receive`` that hands over ``body`` once, then listens to the client's own.

    The client's own says when it goes away: a stream answered to it must not
    be ended before then.
    """
    sent = False

    async def replayed() -> dict[str, Any]:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replayed


#: The applications this runtime serves over A2A, by id.
_SERVED: set[str] = set()


def task_prefix(app_id: str, runtime_id: Optional[str] = None) -> str:
    """
    How the task of a key granted to an application's A2A route begins.

    Parameters
    ----------
    app_id : str
        The application, by its id.
    runtime_id : Optional[str]
        The runtime, by its uid; ``DATALAYER_RUNTIME_ID`` when unsaid, and
        ``local`` on a runtime that has none.

    Returns
    -------
    str
        ``a2a:<runtime>:<application>:``, which a key's ``task_uid`` begins
        with. What follows tells one key from another.
    """
    runtime = (
        runtime_id or os.environ.get("DATALAYER_RUNTIME_ID") or ""
    ).strip() or "local"
    return f"a2a:{runtime}:{app_id}:"


def card_of(app: Any, url: str) -> Any:
    """
    The agent card of an application served over A2A.

    Parameters
    ----------
    app : AppSpec
        The application.
    url : str
        Where it is served, as its callers reach it.

    Returns
    -------
    A2AAgentCard
        Its name, description and version, and one skill named for it: what
        it does, its tags, and its starters as examples. Text in; out, the
        formats its answers come in (``interface.outputs``), plain text when
        it says none. Its face (its emoji, its avatar) in the face extension.
    """
    from agent_runtimes.output.formats import card_output_modes
    from agent_runtimes.routes.a2a import A2AAgentCard

    outputs = card_output_modes(app.interface.outputs)
    return A2AAgentCard(
        id=app.id,
        name=app.name,
        description=app.description or app.name,
        url=url,
        version=app.version,
        skills=[
            {
                "id": app.id,
                "name": app.name,
                "description": app.description or app.name,
                "tags": list(app.tags),
                "examples": [starter.message for starter in app.interface.starters],
                "input_modes": ["text/plain"],
                "output_modes": outputs,
            }
        ],
        security_schemes=_SCHEMES,
        security_requirements=SECURITY_REQUIREMENTS,
        default_input_modes=["text/plain"],
        default_output_modes=outputs,
        face={"emoji": app.emoji, **({"avatar": app.avatar} if app.avatar else {})},
    )


def _json(send_status: int, detail: str) -> list[dict[str, Any]]:
    body = json.dumps({"detail": detail}).encode()
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
    ]
    if send_status == 401:
        headers.append((b"www-authenticate", b"Bearer"))
    return [
        {"type": "http.response.start", "status": send_status, "headers": headers},
        {"type": "http.response.body", "body": body},
    ]


def _with_credential(body: bytes, token: str) -> bytes:
    """The request, the run it starts holding the caller's key as its credential."""
    try:
        request = json.loads(body or b"null")
    except ValueError:
        return body
    if not isinstance(request, dict) or request.get("method") not in _RUN_METHODS:
        return body
    from agent_runtimes.context.delegation import CREDENTIAL_FIELD
    from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

    params = request.get("params")
    message = params.get("message") if isinstance(params, dict) else None
    if not isinstance(message, dict):
        return body
    metadata = message.get("metadata")
    metadata = dict(metadata) if isinstance(metadata, dict) else {}
    ours = metadata.get(DELEGATION_META_KEY)
    ours = dict(ours) if isinstance(ours, dict) else {}
    # The key it was called with, whatever the message says: a caller does
    # not pick the identity its run acts as.
    ours[CREDENTIAL_FIELD] = token
    metadata[DELEGATION_META_KEY] = ours
    message["metadata"] = metadata
    return json.dumps(request).encode()


def as_visitors_run(body: bytes, visitor: str, key: Optional[str]) -> bytes:
    """A visitor's request, the run it starts marked theirs, with the owner's key when given.

    Whatever the message says: a visitor does not unmark their run, nor pick
    the identity it acts as.
    """
    try:
        request = json.loads(body or b"null")
    except ValueError:
        return body
    if not isinstance(request, dict) or request.get("method") not in _RUN_METHODS:
        return body
    from agent_runtimes.context.delegation import CREDENTIAL_FIELD
    from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY
    from agent_runtimes.loop.apps.visitors import A2A_VISITOR_FIELD

    params = request.get("params")
    message = params.get("message") if isinstance(params, dict) else None
    if not isinstance(message, dict):
        return body
    metadata = message.get("metadata")
    metadata = dict(metadata) if isinstance(metadata, dict) else {}
    ours = metadata.get(DELEGATION_META_KEY)
    ours = dict(ours) if isinstance(ours, dict) else {}
    ours.pop(CREDENTIAL_FIELD, None)
    if key:
        ours[CREDENTIAL_FIELD] = key
    ours[A2A_VISITOR_FIELD] = visitor or "visitor"
    metadata[DELEGATION_META_KEY] = ours
    message["metadata"] = metadata
    return json.dumps(request).encode()


def _starts_a_run(body: bytes) -> bool:
    """Whether a request starts a run: what a visitor's turn is."""
    try:
        request = json.loads(body or b"null")
    except ValueError:
        return False
    return isinstance(request, dict) and request.get("method") in _RUN_METHODS


#: A visitor's runs a day on an application served to visitors, and all visitors' together.
VISITOR_TURNS_ENV = "AGENT_RUNTIMES_A2A_VISITOR_TURNS"
VISITORS_DAY_ENV = "AGENT_RUNTIMES_A2A_VISITORS_TURNS_A_DAY"
DEFAULT_VISITOR_TURNS = 3
DEFAULT_VISITORS_DAY = 100

#: The key all visitors' runs are counted under together.
_ALL = "*"


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


def visitors_key_problem(
    key: str, app_id: str, runtime_id: Optional[str] = None
) -> str:
    """
    Why a key cannot be the one visitors' runs act with, or ``""``.

    It is the owner's key granted to this route: a task grant's token whose
    task is this application's route on this runtime (:func:`task_prefix`).
    What it reaches beside the route — the owner's connections, read only —
    is what the grant says; IAM and the gateway hold it to that.
    """
    claims = _unverified_claims(key)
    if not claims:
        return "visitors_key is not a token the platform issues."
    if is_anonymous_audience(claims):
        return "visitors_key is a visitor's token: it is the owner's key granted to the route."
    if not claims.get("task_grant_uid"):
        return (
            "visitors_key is not a key granted to a route: mint one from a task grant "
            "whose task is this application's A2A route, reaching its connections read only."
        )
    prefix = task_prefix(app_id, runtime_id)
    if not str(claims.get("task_uid") or "").startswith(prefix):
        return f"visitors_key was granted to another route than {prefix}…"
    return ""


class VisitorsOpen:
    """
    An application served over A2A open to visitors: the key their runs act
    with, and their runs counted.

    Parameters
    ----------
    key : Optional[str]
        The owner's key granted to the route (:func:`visitors_key_problem`),
        which a visitor's run acts with; ``None``, it keeps the runtime's
        own. Never the visitor's token.
    clock : callable
        The time, for a test.
    """

    def __init__(self, key: Optional[str] = None, clock: Any = None) -> None:
        import time

        self.key = key
        clock = clock or time.time
        self._each = Turns(
            clock, lambda: _positive(VISITOR_TURNS_ENV, DEFAULT_VISITOR_TURNS)
        )
        self._all = Turns(
            clock, lambda: _positive(VISITORS_DAY_ENV, DEFAULT_VISITORS_DAY)
        )

    def take(self, visitor: str, app_name: str) -> str:
        """Why a visitor's run is refused, or ``""`` — and the run is then counted."""
        taken, limit = self._each.take(visitor)
        if not taken:
            return (
                f"You have asked {app_name} {limit} times today without an account: "
                "sign in to keep going, or come back tomorrow."
            )
        taken, limit = self._all.take(_ALL)
        if not taken:
            return (
                f"{app_name} has answered its {limit} visitors' requests for today: "
                "sign in to keep going, or come back tomorrow."
            )
        return ""


class A2AGate:
    """
    An application's A2A route, open to the machine itself and to a key granted to it.

    Parameters
    ----------
    app : ASGI application
        What the route serves: the application's FastA2A app.
    app_id : str
        The application, by its id.
    verifier : CallerVerifier
        Who checks a token with the platform.
    runtime_id : Optional[str]
        The runtime, by its uid; see :func:`task_prefix`.
    visitors : Optional[VisitorsOpen]
        Set when its owner opened it to visitors: a visitor's token for this
        application is answered too, its run acting with the owner's key.
    app_name : Optional[str]
        The application's name, as a refusal says it.
    """

    def __init__(
        self,
        app: Any,
        app_id: str,
        verifier: CallerVerifier = VERIFIER,
        runtime_id: Optional[str] = None,
        visitors: Optional[VisitorsOpen] = None,
        app_name: Optional[str] = None,
    ) -> None:
        self.app = app
        self.app_id = app_id
        self.verifier = verifier
        self.prefix = task_prefix(app_id, runtime_id)
        self.visitors = visitors
        self.app_name = app_name or app_id

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # The card, the documentation and a preflight are anybody's.
        if scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        if is_loopback(client[0] if client else None):
            await self.app(scope, receive, send)
            return
        headers = {
            key.decode().lower(): value.decode()
            for key, value in scope.get("headers") or []
        }
        token = bearer_of(headers.get("authorization"))
        if token and is_anonymous_audience(_unverified_claims(token)):
            await self._visitor(token, scope, receive, send)
            return
        refusal = await self._refusal(token)
        if refusal is not None:
            for message in _json(*refusal):
                await send(message)
            return
        body = await read_body(receive)
        await self.app(scope, replay(_with_credential(body, token), receive), send)

    async def _visitor(self, token: str, scope: Any, receive: Any, send: Any) -> None:
        """A visitor's request: answered when its owner opened it to visitors (R-30)."""
        refusal: Optional[tuple[int, str]] = None
        visitor = ""
        visitors = self.visitors
        if visitors is None:
            refusal = (
                403,
                (
                    f"{self.app_name} is not open to visitors: its owner answers a key "
                    "granted to its route only."
                ),
            )
        else:
            try:
                caller = await self.verifier.verify_visitor(token)
            except CallerRefused as refused:
                refusal = refused.status, refused.reason
            else:
                visitor = caller.uid
                if caller.app_uid != self.app_id:
                    refusal = 403, OTHER_APPLICATION
        if refusal is None and visitors is not None:
            body = await read_body(receive)
            why = visitors.take(visitor, self.app_name) if _starts_a_run(body) else ""
            if not why:
                # Marked a visitor's, so it only reads; the owner's key for
                # visitors, when given, never the visitor's own token.
                await self.app(
                    scope,
                    replay(as_visitors_run(body, visitor, visitors.key), receive),
                    send,
                )
                return
            refusal = 429, why
        for message in _json(*(refusal or (403, OTHER_APPLICATION))):
            await send(message)

    async def _refusal(self, token: str) -> Optional[tuple[int, str]]:
        """Why a caller is not answered, or None when it is."""
        if not token:
            return 401, (
                f"{self.app_id} is answered over A2A with a key granted to it: "
                "send one as a bearer token."
            )
        try:
            caller = await self.verifier.verify(token)
        except CallerRefused as refused:
            return refused.status, refused.reason
        claims = _unverified_claims(token)
        task = str(claims.get("task_uid") or "")
        if caller.kind != "person" or not claims.get("task_grant_uid"):
            return 403, (
                f"{self.app_id} answers a key granted to its A2A route, and this "
                "token was not granted to it."
            )
        if not task.startswith(self.prefix):
            return 403, (
                f"This key was granted to another route than {self.app_id}'s on "
                "this runtime."
            )
        return None


def stop_serving_apps() -> None:
    """Stop serving over A2A every application this runtime served."""
    from agent_runtimes.routes.a2a import unregister_a2a_agent

    for app_id in list(_SERVED):
        unregister_a2a_agent(app_id)
        _SERVED.discard(app_id)


def served_apps() -> list[str]:
    """The applications this runtime serves over A2A, by id."""
    return sorted(_SERVED)


def serve_app_over_a2a(
    app: Any,
    agent: Any,
    url: str,
    visitors: bool = False,
    visitors_key: Optional[str] = None,
) -> dict[str, Any]:
    """
    Serve an application's agent over A2A, at its route and behind its gate.

    Parameters
    ----------
    app : AppSpec
        The application.
    agent : BaseAgent
        Its agent on this runtime, with its connections and its rules.
    url : str
        Where the route is, as its callers reach it: the runtime's address
        and ``/api/v1/a2a/agents/<application id>``.
    visitors : bool
        Open to visitors too: their runs only read, and are counted.
    visitors_key : Optional[str]
        The owner's key granted to the route that visitors' runs act with
        (:func:`visitors_key_problem`); unsaid, they keep the runtime's own.

    Returns
    -------
    dict[str, Any]
        ``url`` (where requests go), ``card`` (its agent card) and ``task``
        (how the task of a key granted to it begins); ``visitors`` when it is
        open to them: the runs a visitor has a day, and all of them together.
    """
    from agent_runtimes.routes.a2a import register_a2a_agent

    if visitors_key is not None:
        problem = (
            "visitors_key is for an application open to visitors."
            if not visitors
            else visitors_key_problem(visitors_key, app.id)
        )
        if problem:
            raise ValueError(problem)
    stop_serving_apps()
    url = url.rstrip("/")
    opened = VisitorsOpen(visitors_key) if visitors else None
    register_a2a_agent(
        agent,
        card_of(app, f"{url}/"),
        gate=lambda inner: A2AGate(inner, app.id, visitors=opened, app_name=app.name),
    )
    _SERVED.add(app.id)
    logger.info(
        "Serving the application %s over A2A at %s/%s",
        app.id,
        url,
        ", open to visitors" if opened else "",
    )
    return {
        "url": f"{url}/",
        "card": f"{url}/.well-known/agent-card.json",
        "task": task_prefix(app.id),
        **(
            {
                "visitors": {
                    "turns_a_visitor": _positive(
                        VISITOR_TURNS_ENV, DEFAULT_VISITOR_TURNS
                    ),
                    "turns_a_day": _positive(VISITORS_DAY_ENV, DEFAULT_VISITORS_DAY),
                    "acts_with": "visitors_key"
                    if visitors_key
                    else "the runtime's own",
                }
            }
            if opened
            else {}
        ),
    }
