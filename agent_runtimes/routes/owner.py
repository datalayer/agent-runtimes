# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who this runtime runs for, asked by a skill on the pod's loopback.

A Datalayer skill that needs the platform identity — who the person is, the
agent's events — used to read ``DATALAYER_API_KEY`` from the sandbox's
environment. A sandbox holds none: the key is the platform's, no person sets
it, and a pool runtime handed to a hosted page or kept by the keeper is given
no key at all. So the skill asks the runtime beside it, as the memory, mail
and Library skills do, and the runtime answers with the identity it holds:

- ``GET /api/v1/owner`` — the account the runtime runs for: handle, name,
  email, roles and avatar (what the ``datalayer-whoami`` skill prints);
- ``POST|GET /api/v1/owner/events`` and ``GET|PATCH
  /api/v1/owner/events/{event_id}`` — the agent's events on Datalayer (the
  ``events`` skill), asked of ai-agents by the runtime.

**Whose identity.** A runtime a person launched for themselves holds their
token (``routes.spaces.owner_token``): IAM says their profile. A runtime that
serves a deployment acts as the application's principal and as nothing else
(:mod:`agent_runtimes.apps.principal`) — never as whoever launched it — so
there the answer is its owner's public face (handle, name, avatar; no email,
no roles: the people talking to a hosted application are not its owner), and
the events are the principal's. The visitors' runtime runs for nobody.

**No secret crosses.** The sandbox names no token and receives none; the
caller can only name which of the runtime's agents asks, never whose account.

**The pod's loopback only**, as the Space and Library routes are. On a runtime
held to its application's own routes (`apps.visitors.OwnRoutesOnly`), the
identity is answered to the sandbox at any time — it is public there — and
the events only while code the agent was let run is running.

**No identity is said in a sentence** (:data:`NOBODY`), and
:func:`identity_refusal` is what a skill's readiness is read from
(``GET /api/v1/configure/skills``, an application's equipment).
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/owner", tags=["owner"])

#: Said when the runtime holds no identity to answer with.
NOBODY = (
    "This runtime runs for nobody: it holds no identity of a Datalayer account. "
    "Sign in and start it from your account."
)

#: Said on the visitors' runtime, which runs for whoever visits.
VISITORS = (
    "This runtime runs for visitors, not for an account: sign in and start an "
    "agent from your account."
)

#: Said when the identity held is no longer accepted.
EXPIRED = (
    "The identity this runtime holds is no longer accepted: start it again "
    "from your account."
)

#: The skills that need the runtime's identity, and which one each needs:
#: ``identity`` (who it runs for — :func:`runs_for`), ``mail`` (the social
#: token the mailer is asked with) or ``owner`` (the owner's own token, which a
#: publication is made with). No person sets a variable for any of them.
IDENTITY_SKILLS = {
    "datalayer-whoami": "identity",
    "events": "identity",
    "datalayer-email": "mail",
    "datalayer-library-publish": "owner",
}

#: What the sandbox may reach of these routes on a runtime held to its own routes.
_IDENTITY_PATH = re.compile(r"^/api/v1/owner/?$")
_EVENTS_PATH = re.compile(r"^/api/v1/owner/events(/[^/]+)?/?$")


@dataclass(frozen=True)
class Identity:
    """The identity a runtime holds: a person's token, or a deployment's principal's."""

    token: str
    #: ``person`` or ``principal``.
    kind: str
    #: The deployment whose principal it is, ``""`` for a person.
    deployment_uid: str = ""


class IdentityRefused(Exception):
    """Why the runtime answers with no identity, in a sentence."""

    def __init__(self, message: str, status_code: int = 409) -> None:
        """Keep the sentence and the status it is answered with."""
        super().__init__(message)
        self.status_code = status_code


def _expired(token: str) -> bool:
    """Whether a token says it has expired; a key that says nothing has not."""
    from agent_runtimes.apps.callers import _unverified_claims

    expiry = _unverified_claims(token).get("exp")
    return isinstance(expiry, (int, float)) and expiry <= time.time()


def _serves_deployments() -> bool:
    """Whether this runtime serves a deployment, or was launched for one."""
    from agent_runtimes.apps.principal import a_deployment_is_served, launched_for

    return a_deployment_is_served() or bool(launched_for())


def runs_for(agent_id: str = "") -> Identity:
    """The identity this runtime acts with, for one of its agents when named.

    Raises :class:`IdentityRefused` with the sentence when it holds none.
    """
    from agent_runtimes.apps.principal import (
        deployment_of,
        deployments_served,
        principal_token,
        principal_token_refusal,
    )
    from agent_runtimes.apps.visitors import visitors_runtime
    from agent_runtimes.models.models import app_instance_of
    from agent_runtimes.routes.spaces import owner_token

    if visitors_runtime():
        raise IdentityRefused(VISITORS)
    if _serves_deployments():
        named = deployment_of(app_instance_of(agent_id)) if agent_id else ""
        deployments = [named] if named else deployments_served()
        held = {
            deployment: principal_token(deployment)
            for deployment in deployments
            if principal_token(deployment)
        }
        if len(held) == 1:
            deployment, token = next(iter(held.items()))
            return Identity(str(token), "principal", deployment)
        if len(held) > 1:
            raise IdentityRefused(
                "Several applications run on this runtime: say which agent asks "
                "with --agent.",
                422,
            )
        if len(deployments) == 1:
            raise IdentityRefused(
                principal_token_refusal(deployments[0]) or NOBODY,
            )
        raise IdentityRefused(NOBODY)
    token = owner_token()
    if not token:
        raise IdentityRefused(NOBODY)
    if _expired(token):
        raise IdentityRefused(EXPIRED)
    return Identity(token, "person")


def identity_refusal(skill_id: str, agent_id: str = "") -> Optional[str]:
    """Why a skill that needs the runtime's identity cannot work here now, or ``None``.

    ``None`` as well for a skill that needs none. What a skill's readiness is
    read from: no variable of the environment says it, the identity the
    runtime holds does.
    """
    needs = IDENTITY_SKILLS.get(str(skill_id or "").split(":", 1)[0])
    if needs is None:
        return None
    if needs == "mail":
        from agent_runtimes.tools.social import social_token_refusal

        return social_token_refusal()
    if needs == "owner":
        from agent_runtimes.apps.principal import kernel_holds_owner_secrets
        from agent_runtimes.apps.visitors import visitors_runtime
        from agent_runtimes.routes.spaces import owner_token

        if visitors_runtime():
            return VISITORS
        token = owner_token()
        if not token:
            return NOBODY
        if _expired(token):
            return EXPIRED
        if _serves_deployments() and not kernel_holds_owner_secrets():
            return (
                "This runtime serves an application to people who are not its "
                "owner: it publishes nothing in their name."
            )
        return None
    try:
        runs_for(agent_id)
    except IdentityRefused as refused:
        return str(refused)
    return None


def sandbox_may_ask(method: str, path: str) -> bool:
    """Whether a loopback call is a skill asking who the runtime runs for, or for its events.

    On a runtime held to its application's own routes
    (`apps.visitors.OwnRoutesOnly`): the identity at any time — it is the
    owner's public face there — and the events only while code the agent was
    let run is running, as its tool calls are. Never on the visitors' runtime.
    """
    from agent_runtimes.apps.enforcement import code_is_running
    from agent_runtimes.apps.visitors import visitors_runtime

    if visitors_runtime():
        return False
    if method == "GET" and _IDENTITY_PATH.match(path):
        return True
    return (
        method in ("GET", "POST", "PATCH")
        and bool(_EVENTS_PATH.match(path))
        and code_is_running()
    )


def _local(request: Request) -> None:
    """Refuse a caller that is not on the pod's loopback."""
    from agent_runtimes.routes.spaces import _caller_is_local

    if not _caller_is_local(request):
        raise HTTPException(
            status_code=403,
            detail="Only a skill in this runtime's pod asks who it runs for.",
        )


def _identity(agent_id: str = "") -> Identity:
    """The runtime's identity, or its refusal as an HTTP answer."""
    try:
        return runs_for(agent_id)
    except IdentityRefused as refused:
        raise HTTPException(
            status_code=refused.status_code, detail=str(refused)
        ) from refused


def _urls() -> Any:
    """Where the Datalayer services are, as the environment says."""
    from datalayer_core.utils.urls import DatalayerURLs

    return DatalayerURLs.from_environment()


def _service(name: str, said: str) -> str:
    """A service's root, or a 503 saying the runtime does not know it."""
    url = str(getattr(_urls(), name, "") or "").strip().rstrip("/")
    if not url:
        raise HTTPException(503, f"This runtime does not know where {said} is.")
    return url


async def _ask(method: str, url: str, token: str = "", **kwargs: Any) -> httpx.Response:
    """One request to a Datalayer service, never through a redirect; replaced by the tests."""
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    # A token goes to the service it was sent to alone: no redirect is
    # followed, so it reaches no other origin.
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        return await client.request(method, url, headers=headers, **kwargs)


async def _asked(
    service: str, method: str, url: str, token: str = "", **kwargs: Any
) -> httpx.Response:
    """One request to a service; a 502 in a sentence when it cannot be reached or redirects."""
    try:
        answer = await _ask(method, url, token, **kwargs)
    except (httpx.HTTPError, OSError) as error:
        raise HTTPException(
            502, f"{service} could not be reached: {type(error).__name__}."
        ) from error
    if 300 <= answer.status_code < 400:
        # Said, and not followed: the identity stays with the service asked.
        raise HTTPException(
            502,
            f"{service} answered with a redirect ({answer.status_code}), which is "
            "not followed: nothing was sent elsewhere.",
        )
    return answer


def _json(answer: httpx.Response) -> dict[str, Any]:
    """An answer's JSON object, empty when it is none."""
    try:
        said = answer.json()
    except ValueError:
        return {}
    return said if isinstance(said, dict) else {}


def _detail_of(answer: httpx.Response, otherwise: str) -> str:
    """Why a service refused, in its own words when it gave any."""
    said = _json(answer)
    detail = said.get("detail") or said.get("message")
    if isinstance(detail, dict):
        detail = detail.get("message") or str(detail)
    return str(detail or "").strip() or answer.text.strip()[:300] or otherwise


def _person(profile: dict[str, Any]) -> dict[str, Any]:
    """A person's profile as IAM says it, in the skill's words."""
    return {
        "handle": profile.get("handle_s") or profile.get("handle") or "",
        "email": profile.get("email_s") or profile.get("email") or None,
        "first_name": profile.get("first_name_t") or profile.get("first_name") or "",
        "last_name": profile.get("last_name_t") or profile.get("last_name") or "",
        "uid": profile.get("uid") or "",
        "roles": list(profile.get("roles_ss") or profile.get("roles") or []),
        "avatar_url": profile.get("avatar_url_s") or profile.get("avatar_url") or None,
    }


def _public_face(face: dict[str, Any], uid: str) -> dict[str, Any]:
    """An application owner's public face, in the same words: no email, no roles."""
    handle = str(face.get("handle") or "")
    name = str(face.get("display_name") or "").strip()
    first, _, last = ("" if name == handle else name).partition(" ")
    return {
        "handle": handle,
        "email": None,
        "first_name": first,
        "last_name": last.strip(),
        "uid": str(face.get("uid") or uid),
        "roles": [],
        "avatar_url": face.get("avatar_url") or None,
    }


@router.get("")
async def who_it_runs_for(
    request: Request,
    agent: str = Query("", description="Which of the runtime's agents asks."),
) -> dict[str, Any]:
    """The Datalayer account this runtime runs for, as the whoami skill prints it."""
    _local(request)
    identity = _identity(agent.strip())
    iam = _service("iam_url", "IAM")
    if identity.kind == "principal":
        from agent_runtimes.apps.principal import owner_of

        owner = owner_of(identity.deployment_uid)
        if not owner:
            raise HTTPException(409, NOBODY)
        answer = await _asked(
            "IAM",
            "GET",
            f"{iam}/api/iam/v1/users/public/by-uid/{quote(owner, safe='')}",
        )
        face = _json(answer).get("profile") if answer.status_code == 200 else None
        if not isinstance(face, dict):
            raise HTTPException(
                502, "IAM did not say whose application this runtime serves."
            )
        return _public_face(face, owner)
    answer = await _asked("IAM", "GET", f"{iam}/api/iam/v1/whoami", identity.token)
    if answer.status_code in (401, 403):
        raise HTTPException(409, EXPIRED)
    if answer.status_code != 200:
        raise HTTPException(
            502, _detail_of(answer, f"IAM answered {answer.status_code}.")
        )
    profile = _json(answer).get("profile")
    if not isinstance(profile, dict):
        raise HTTPException(409, NOBODY)
    return _person(profile)


# --- the agent's events -------------------------------------------------------


class EventToCreate(BaseModel):
    """An event of the agent, as the events skill creates it."""

    agent_id: str = ""
    title: str = Field(min_length=1)
    kind: str = "generic"
    status: str = "pending"
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventToUpdate(BaseModel):
    """What changes of an event; a field left out is left as it is."""

    agent_id: str = ""
    title: Optional[str] = None
    kind: Optional[str] = None
    status: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None


def _runtime_agent(named: str = "") -> str:
    """The agent the events are of: named, else the runtime's only agent."""
    name = named.strip()
    if name:
        return name
    from agent_runtimes.routes.agents import _agents

    ids = sorted(str(agent_id) for agent_id in _agents)
    if len(ids) == 1:
        return ids[0]
    if not ids:
        raise HTTPException(409, "No agent runs on this runtime: it has no events.")
    raise HTTPException(
        422,
        f"Several agents run on this runtime ({', '.join(ids)}): say which with agent_id.",
    )


def _events_url(agent_id: str, event_id: str = "") -> str:
    """The agent's events at ai-agents, or one of them."""
    base = _service("ai_agents_url", "ai-agents")
    url = f"{base}/api/ai-agents/v1/agents/{quote(agent_id, safe='')}/events"
    return f"{url}/{quote(event_id.strip(), safe='')}" if event_id else url


async def _events(
    method: str, agent_id: str, event_id: str = "", **kwargs: Any
) -> dict[str, Any]:
    """One call to the agent's events at ai-agents, with the runtime's identity."""
    agent = _runtime_agent(agent_id)
    # The identity is the asking agent's when it is one of this runtime's; an
    # agent id of another kind (a platform agent the events are filed under)
    # chooses no principal.
    from agent_runtimes.models.models import app_instance_of

    identity = _identity(agent if app_instance_of(agent) is not None else "")
    answer = await _asked(
        "ai-agents", method, _events_url(agent, event_id), identity.token, **kwargs
    )
    if answer.status_code in (401, 403):
        raise HTTPException(
            409,
            EXPIRED
            if answer.status_code == 401
            else _detail_of(answer, "ai-agents refused the agent's events."),
        )
    if answer.status_code >= 400:
        raise HTTPException(
            answer.status_code,
            _detail_of(answer, f"ai-agents answered {answer.status_code}."),
        )
    return _json(answer)


@router.post("/events")
async def create_event(body: EventToCreate, request: Request) -> dict[str, Any]:
    """Create an event of the agent, as the runtime's identity."""
    _local(request)
    said = await _events(
        "POST",
        body.agent_id,
        json={
            "title": body.title,
            "kind": body.kind,
            "status": body.status,
            "payload": body.payload,
            "metadata": {**body.metadata, "origin": "agent-runtime"},
        },
    )
    return {"event": said.get("event") or {}}


@router.get("/events")
async def list_events(
    request: Request,
    agent_id: str = Query(""),
    kind: str = Query(""),
    status: str = Query(""),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """The agent's events, newest first as ai-agents lists them."""
    _local(request)
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if kind.strip():
        params["kind"] = kind.strip()
    if status.strip():
        params["status"] = status.strip()
    said = await _events("GET", agent_id, params=params)
    return {"total": said.get("total", 0), "events": said.get("events") or []}


@router.get("/events/{event_id}")
async def get_event(
    event_id: str, request: Request, agent_id: str = Query("")
) -> dict[str, Any]:
    """One event of the agent."""
    _local(request)
    said = await _events("GET", agent_id, event_id)
    return {"event": said.get("event") or {}}


@router.patch("/events/{event_id}")
async def update_event(
    event_id: str, body: EventToUpdate, request: Request
) -> dict[str, Any]:
    """Change an event of the agent."""
    _local(request)
    changes = body.model_dump(exclude_none=True, exclude={"agent_id"})
    if not changes:
        raise HTTPException(422, "Nothing to change: name a field of the event.")
    said = await _events("PATCH", body.agent_id, event_id, json=changes)
    return {"event": said.get("event") or {}}
