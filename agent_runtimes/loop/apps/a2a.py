# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application served over A2A, to the members of its team (agentspecs `teams`).

A team of applications says who asks whom (``talks_to``, over ``a2a``). The
application asked is served here with fasta2a, through the runtime's own A2A
route (`agent_runtimes.routes.a2a`): its agent, with its connections and its
rules, answers at ``/api/v1/a2a/agents/<application id>/``. Its agent card is
written from its Appspec: its name, its description, and one skill named for
it, whose examples are its starters. A request and an answer are text.

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

logger = logging.getLogger(__name__)

__all__ = [
    "A2AGate",
    "SECURITY_REQUIREMENTS",
    "SECURITY_SCHEME",
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
        it does, its tags, and its starters as examples. Text in, text out.
    """
    from agent_runtimes.routes.a2a import A2AAgentCard

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
                "output_modes": ["text/plain"],
            }
        ],
        security_schemes=_SCHEMES,
        security_requirements=SECURITY_REQUIREMENTS,
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
    """

    def __init__(
        self,
        app: Any,
        app_id: str,
        verifier: CallerVerifier = VERIFIER,
        runtime_id: Optional[str] = None,
    ) -> None:
        self.app = app
        self.app_id = app_id
        self.verifier = verifier
        self.prefix = task_prefix(app_id, runtime_id)

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
        refusal = await self._refusal(token)
        if refusal is not None:
            for message in _json(*refusal):
                await send(message)
            return
        body = await read_body(receive)
        await self.app(scope, replay(_with_credential(body, token), receive), send)

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


def serve_app_over_a2a(app: Any, agent: Any, url: str) -> dict[str, str]:
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

    Returns
    -------
    dict[str, str]
        ``url`` (where requests go), ``card`` (its agent card) and ``task``
        (how the task of a key granted to it begins).
    """
    from agent_runtimes.routes.a2a import register_a2a_agent

    stop_serving_apps()
    url = url.rstrip("/")
    register_a2a_agent(
        agent,
        card_of(app, f"{url}/"),
        gate=lambda inner: A2AGate(inner, app.id),
    )
    _SERVED.add(app.id)
    logger.info("Serving the application %s over A2A at %s/", app.id, url)
    return {
        "url": f"{url}/",
        "card": f"{url}/.well-known/agent-card.json",
        "task": task_prefix(app.id),
    }
