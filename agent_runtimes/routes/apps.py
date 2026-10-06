# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications on a runtime (LOOP R-03).

`POST /api/v1/apps/configure` makes the runtime's agent the one an
application runs: the application's agent, with what the application says
differently — its model, its instructions — reaching only the MCP servers the
application connects to, and with its rules decided before every tool call.
It is `configure-from-spec` with an Appspec: the companion calls one or the
other at launch.

`GET /api/v1/apps/current` says which application the runtime runs, and
`POST /api/v1/apps/decide` what it would do about a tool call — what an
interface shows before it is made. `GET /api/v1/apps` lists the applications
the runtime knows. `POST /api/v1/apps/feedback` keeps what a person says of a
conversation — a thumb up or down, and a comment — in the application's
record (LOOP V-18). `GET /api/v1/apps/memories/{app}` is what an
application remembers of the caller — its owner, or a visitor apart (LOOP
R-36) — and `DELETE` forgets one thing of it, or everything once the caller
confirmed how many (LOOP R-18).

Every route checks who is calling before anything else (LOOP R-32,
`agent_runtimes.loop.apps.callers`): a person for `configure`; for the
others, a person or an embed token for the application — and a browser only
from the origins its deployment allows. A call from the machine itself needs
no token. On the visitors' runtime (LOOP R-30,
`agent_runtimes.loop.apps.visitors`) a visitor without an account, and only
one, holding a token for the one application they talk to.

An application is a Reactor plugin here as in the page (LOOP §5.4): the
runtime reads applications from the ``loop.app`` contribution point, and
decides their tool calls with what extends their contribution
(`agent_runtimes.loop.apps.plugins`).

An application that its builder's checks would refuse is refused here too,
with the same sentences (422): a runtime never runs what `loop apps validate`
calls not ready.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from agent_runtimes.loop.apps.callers import (
    LOCAL,
    VERIFIER,
    Caller,
    CallerRefused,
    bearer_of,
    is_loopback,
    origin_allowed,
    platform_origins,
)
from agent_runtimes.loop.apps.enforcement import sentence_of
from agent_runtimes.loop.apps.loading import AppNotRunnable, agent_id_of, load_app
from agent_runtimes.loop.apps.plugins import (
    find_app,
    list_apps,
    register_app,
    rules_for,
)
from agent_runtimes.loop.apps.record import COMMENT_LIMIT, RecordNotSent, recorder_of
from agent_runtimes.types import AppSpec
from agent_runtimes.voice import hear, spoken_of, voice_settings

router = APIRouter(prefix="/apps", tags=["apps"])

#: The id of the application each agent of this runtime runs, by agent name.
#: The application itself is a contribution of its plugin.
_RUNNING: Dict[str, str] = {}


class ConfigureAppRequest(BaseModel):
    """What the companion sends to run an application."""

    app: Dict[str, Any] = Field(..., description="The Appspec, as its file holds it")
    env_vars: List[Dict[str, str]] = Field(default_factory=list)
    user_token: Optional[str] = None
    jupyter_sandbox: Optional[str] = None
    mcp_proxy_url: Optional[str] = None
    organization_uid: Optional[str] = Field(
        None,
        description=(
            "The organization it runs for: the plugins it has turned off are read "
            "from IAM (LOOP C-12), and its contexts, which the agent keeps to (U-31)"
        ),
    )
    a2a: bool = Field(
        False,
        description=(
            "Also serve it over A2A, with fasta2a, at /api/v1/a2a/agents/<its id>/: "
            "to the members of its team that ask it (agentspecs `talks_to`)"
        ),
    )
    public_url: Optional[str] = Field(
        None,
        description=(
            "The runtime's address as its callers reach it, for its agent card: "
            "a cloud runtime's ingress; the request's own address when unsaid"
        ),
    )
    visitors: bool = Field(
        False,
        description=(
            "Served over A2A (a2a), also open to visitors without an account (LOOP "
            "R-30): a visitor's token from ai-inference naming this application is "
            "answered; their runs only read and are counted, a few a day each"
        ),
    )
    visitors_key: Optional[str] = Field(
        None,
        description=(
            "The owner's key visitors' runs act with: a token from a task grant whose "
            "task is this application's A2A route on this runtime, reaching its "
            "connections read only. Unsaid, they keep the runtime's own credential. "
            "Never the visitor's own token"
        ),
    )


class DecideRequest(BaseModel):
    """A tool call to decide, without making it."""

    tool: str = Field(..., description="The tool, as the runtime names it")
    arguments: Dict[str, Any] = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    """What a person says of a conversation with the application."""

    session: str = Field(
        ...,
        min_length=1,
        description="The conversation, as the chat names it: its AG-UI thread",
    )
    liked: bool = Field(..., description="The thumb: up or down")
    comment: str = Field("", max_length=COMMENT_LIMIT)


def running_app(agent: str = "default") -> Optional[AppSpec]:
    """The application an agent of this runtime runs, or None."""
    app_id = _RUNNING.get(agent)
    return find_app(app_id) if app_id else None


@dataclass(frozen=True)
class Authorized:
    """Who called, and the application they were authorized for.

    The handler answers about this application and no other: one read, under
    one check, so that an application configured while a token is being
    verified is never answered for under the first one's authorization.
    """

    caller: Caller
    app: Optional[AppSpec]


async def _authorize(
    request: Request,
    person_only: bool,
    for_app: Optional[AppSpec] = None,
    app_uid: str = "",
) -> Authorized:
    """Who is calling, or an HTTP refusal that says why.

    For the application the runtime runs, or the one ``for_app`` names — the
    application of an agent a session is opened on (LOOP R-04). An embed
    token is checked against ``app_uid``, the application as the platform
    knows it, when the session's instance names it; its spec's id otherwise.
    """
    app = for_app if for_app is not None else running_app()
    origin = request.headers.get("origin")
    embedded = app.deployment.embedded if app and app.deployment else None
    allowed = platform_origins() + tuple(embedded.origins if embedded else ())
    # A browser's origin first, whoever the client: a page elsewhere reaches a
    # developer's localhost through their browser.
    if not origin_allowed(origin, allowed):
        raise HTTPException(
            status_code=403, detail=f"This application does not answer {origin}."
        )
    if is_loopback(request.client.host if request.client else None):
        return Authorized(LOCAL, app)
    token = bearer_of(request.headers.get("authorization"))
    if not token:
        from agent_runtimes.loop.apps.visitors import NO_TOKEN, visitors_runtime

        raise HTTPException(
            status_code=401,
            detail=NO_TOKEN
            if visitors_runtime()
            else "Who is calling is not said: send a token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        caller = await VERIFIER.verify(token, app_uid or (app.id if app else ""))
    except CallerRefused as refused:
        raise HTTPException(status_code=refused.status, detail=refused.reason) from None
    if person_only and caller.kind != "person":
        raise HTTPException(
            status_code=403,
            detail="Only a person configures the application a runtime runs.",
        )
    if caller.kind == "embed":
        # The page an embed's visitor is on, said to ai-agents when it is
        # asked whether to open the session and for its principal (LOOP D-12).
        from agent_runtimes.loop.apps.opening import PAGE_ORIGIN

        PAGE_ORIGIN.set(origin or "")
    return Authorized(caller, app)


def _reaches(caller: Caller, agent: str) -> None:
    """A visitor's token reaches the one application it names, and no other (R-30)."""
    if caller.kind != "visitor":
        return
    from agent_runtimes.loop.apps.visitors import OTHER_APPLICATION, agent_of

    try:
        named = agent_of(caller.app_uid) if caller.app_uid else ""
    except ValueError:
        named = ""
    if named != agent:
        raise HTTPException(status_code=403, detail=OTHER_APPLICATION)


async def _visitors_agent(agent: str, request: Request) -> None:
    """On the visitors' runtime, the agent a visitor's new session is opened on.

    The visitor's token names it; an application at its address has its
    agent made here as it is first talked to, from what ai-agents shows
    somebody not signed in (R-30, D-02).
    """
    from agent_runtimes.loop.apps.visitors import (
        AT_PREFIX,
        AddressRefused,
        ensure_address_agent,
        visitors_runtime,
    )

    if not visitors_runtime():
        return
    caller = (await _authorize(request, False)).caller
    if caller.kind != "visitor":
        return
    _reaches(caller, agent)
    if caller.app_uid.startswith(AT_PREFIX):
        try:
            await ensure_address_agent(caller.app_uid)
        except AddressRefused as refused:
            raise HTTPException(
                status_code=refused.status, detail=refused.reason
            ) from None


async def a_person(request: Request) -> Authorized:
    """A person, or the machine itself: who may configure the runtime."""
    return await _authorize(request, person_only=True)


async def a_caller(request: Request) -> Authorized:
    """Whoever the running application answers."""
    return await _authorize(request, person_only=False)


def connections_not_started(adapter: Any) -> List[Tuple[str, str]]:
    """The MCP servers an agent reaches that failed to start, with why.

    A server still starting (in the background) is not one of them, nor one
    reached through a Contents session, which has no process.
    """
    from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

    manager = get_mcp_lifecycle_manager()
    failed = manager.get_failed_servers()
    starting = set(getattr(manager, "_starting_servers", ()))
    not_started: List[Tuple[str, str]] = []
    for selection in getattr(adapter, "_selected_mcp_servers", None) or []:
        server_id = getattr(selection, "id", str(selection))
        if getattr(selection, "origin", None) == "contents":
            continue
        if server_id in starting or manager.is_server_running(server_id):
            continue
        if server_id in failed:
            # A traceback's last line says what went wrong.
            lines = [line.strip() for line in str(failed[server_id]).splitlines()]
            said = [line for line in lines if line] or ["unknown error"]
            not_started.append((server_id, said[-1][:300]))
    return not_started


@router.post("/configure")
async def configure_app(
    http_request: Request,
    body: ConfigureAppRequest,
    authorized: Authorized = Depends(a_person),
) -> Dict[str, Any]:
    """Make the runtime's agent the one the application runs.

    The plugins its organization has turned off are read from IAM with the
    person's token, and a block of its page from one of them is said in its
    setup notes; ``plugins_off_says`` says where the list came from, or why
    none is off. Its agent keeps to the organization's contexts (LOOP U-31),
    read when it is made: one that cannot be read refuses it.
    """
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.loop.apps.plugins_off import read_plugins_off

    plugins_off = await asyncio.to_thread(
        read_plugins_off,
        body.organization_uid,
        iam_url=DatalayerURLs.from_environment().iam_url,
        token=body.user_token or bearer_of(http_request.headers.get("authorization")),
    )
    try:
        app = load_app(body.app, plugins_off.plugins)
    except AppNotRunnable as error:
        raise HTTPException(
            status_code=422, detail={"problems": error.problems}
        ) from None
    if app.team:
        raise HTTPException(
            status_code=422,
            detail={
                "problems": [
                    "An application run by a team is not supported on a runtime yet."
                ]
            },
        )
    if body.visitors or body.visitors_key:
        # Open to visitors: over A2A, with the owner's key for their runs if given.
        from agent_runtimes.loop.apps.a2a import visitors_key_problem

        problem = (
            "visitors is a way of serving it over A2A: set a2a too."
            if not body.a2a
            else "visitors_key is for an application open to visitors: set visitors."
            if not body.visitors
            else visitors_key_problem(body.visitors_key, app.id)
            if body.visitors_key
            else ""
        )
        if problem:
            raise HTTPException(status_code=422, detail={"problems": [problem]})
    from agent_runtimes.routes.agents import (
        ConfigureFromSpecRequest,
        configure_from_spec_endpoint,
    )

    result = await configure_from_spec_endpoint(
        http_request,
        ConfigureFromSpecRequest(
            agent_spec_id=agent_id_of(app),
            env_vars=body.env_vars,
            user_token=body.user_token,
            jupyter_sandbox=body.jupyter_sandbox,
            mcp_proxy_url=body.mcp_proxy_url,
            app_spec=body.app,
            app_instance=(
                {"organization_uid": body.organization_uid}
                if body.organization_uid
                else None
            ),
            model=app.model or None,
            # An application is spoken to over AG-UI — by its page and by the
            # terminal — whatever the runtime started its default agent on.
            transport="ag-ui",
        ),
    )
    # Fail fast: an application whose connections did not start is not
    # served, and the caller is told which and why (an MCP start is bounded,
    # so this is known before the caller gives up waiting).
    from agent_runtimes.routes.acp import _agents as _acp_agents

    if "default" in _acp_agents:
        not_started = connections_not_started(_acp_agents["default"][0])
        if not_started:
            raise HTTPException(
                status_code=502,
                detail={
                    "problems": [
                        f"{app.name} is not served: its connection {server} "
                        f"did not start ({error})."
                        for server, error in not_started
                    ]
                },
            )
    # Its own plugin, whether or not agent creation registered it already.
    register_app(app)
    _RUNNING["default"] = app.id
    # Served over A2A on its agent as it is now: the agent configured before
    # is not answered for, whichever application it ran.
    from agent_runtimes.loop.apps.a2a import serve_app_over_a2a, stop_serving_apps

    a2a: Optional[Dict[str, Any]] = None
    if body.a2a:
        from agent_runtimes.routes.a2a import _api_prefix
        from agent_runtimes.routes.acp import _agents

        base = (body.public_url or str(http_request.base_url)).rstrip("/")
        a2a = serve_app_over_a2a(
            app,
            _agents["default"][0],
            f"{base}{_api_prefix}/a2a/agents/{app.id}",
            visitors=body.visitors,
            visitors_key=body.visitors_key,
        )
    else:
        stop_serving_apps()
    return {
        **result,
        "app": {
            "id": app.id,
            "version": app.version,
            "name": app.name,
            "emoji": app.emoji,
        },
        "setup": app.setup,
        # Its voice, so that the page knows it before the first answer (VO-45).
        "voice": voice_settings(app),
        "plugins_off_says": plugins_off.says,
        **({"a2a": a2a} if a2a else {}),
    }


@router.get("")
async def apps(authorized: Authorized = Depends(a_person)) -> Dict[str, Any]:
    """The applications this runtime knows: the catalogue's, and its own."""
    return {
        "apps": [
            {
                "id": app.id,
                "version": app.version,
                "name": app.name,
                "emoji": app.emoji,
                "kind": app.kind,
            }
            for app in list_apps()
        ]
    }


@router.get("/current")
async def current_app(authorized: Authorized = Depends(a_caller)) -> Dict[str, Any]:
    """Which application the runtime runs."""
    app = authorized.app
    if app is None:
        raise HTTPException(status_code=404, detail="This runtime runs no application.")
    return {
        "id": app.id,
        "version": app.version,
        "name": app.name,
        "emoji": app.emoji,
        "kind": app.kind,
        "setup": app.setup,
        "voice": voice_settings(app),
    }


@router.post("/decide")
async def decide(
    body: DecideRequest, authorized: Authorized = Depends(a_caller)
) -> Dict[str, Any]:
    """What the application would do about a tool call, and why — without making it."""
    app = authorized.app
    if app is None:
        raise HTTPException(status_code=404, detail="This runtime runs no application.")
    enforced = rules_for(app).decide(body.tool, body.arguments)
    decision = enforced.decision
    return {
        "behaviour": decision.behaviour,
        "tool": decision.tool,
        "classes": list(decision.classes),
        "because": decision.because,
        "rule": decision.rule,
        "sentence": sentence_of(decision),
        "parts": [
            {
                "tool": part.tool,
                "behaviour": part.behaviour,
                "sentence": sentence_of(part),
            }
            for part in enforced.parts
        ],
    }


@router.post("/feedback")
async def feedback(
    body: FeedbackRequest, authorized: Authorized = Depends(a_caller)
) -> Dict[str, Any]:
    """Keep a person's word on a conversation in the application's record (V-18)."""
    if authorized.caller.kind == "visitor":
        from agent_runtimes.loop.apps.visitors import NOTHING_KEPT

        raise HTTPException(status_code=409, detail=NOTHING_KEPT)
    if authorized.caller.kind == "embed":
        # An embed's visitor speaks of their own session, and no other (R-20).
        from agent_runtimes.loop.apps.sessions import session_of

        live = session_of(body.session)
        if live is None or not live.answers_to(authorized.caller):
            raise HTTPException(
                status_code=404,
                detail=f"No conversation {body.session} is yours here.",
            )
    app = authorized.app
    if app is None:
        raise HTTPException(status_code=404, detail="This runtime runs no application.")
    recorder = recorder_of(body.session)
    if recorder is None or recorder.app.id != app.id:
        raise HTTPException(
            status_code=404,
            detail=f"No conversation {body.session} with {app.name} was recorded here.",
        )
    if not recorder.kept("feedback"):
        raise HTTPException(
            status_code=409,
            detail=f"{app.name} keeps no feedback: its record does not name it.",
        )
    caller = authorized.caller
    try:
        entry = await recorder.feedback(
            body.session,
            liked=body.liked,
            comment=body.comment,
            by=caller.uid or caller.kind,
        )
    except RecordNotSent as error:
        raise HTTPException(status_code=502, detail=str(error)) from None
    return {"kept": True, "summary": entry["summary"]}


# --- the session API (LOOP R-04) ------------------------------------------------
#
# An application's sessions over the wire: start, message, action, settings
# change, stop and resume, each streamed as AG-UI events (`text/event-stream`),
# the first a `loop.session` custom event saying what the session is. And an
# application's agent spoken to over AG-UI as any agent is, each thread a
# session: what the chat of an application's page sends.


class StartSessionRequest(BaseModel):
    """What a session is started with."""

    agent: str = Field(
        ...,
        min_length=1,
        description="The agent the platform made for the application on this runtime",
    )
    app_uid: str = Field("", description="Its `app` item, checked against the agent's")
    version: int = Field(
        0, ge=0, description="The version, checked against the agent's"
    )
    deployment_uid: str = Field(
        "",
        description="The deployment it runs as, checked against the agent's; none for a Preview",
    )
    opener: str = Field("", description="The first message, answered at once")
    settings: Dict[str, Any] = Field(default_factory=dict)
    session: str = Field("", description="Its uid, when the caller names it")
    woken_by: Dict[str, Any] = Field(
        default_factory=dict, description="What woke it, when nobody opened it (R-14)"
    )


class SessionMessageRequest(BaseModel):
    """A message, or an answer."""

    text: str = Field(..., description="What the person says, or answers")


class SessionActionRequest(BaseModel):
    """A page block's action, and the files given with it."""

    name: str = Field(
        ..., min_length=1, description="The action, as its block names it"
    )
    payload: Dict[str, Any] = Field(default_factory=dict)
    text: str = Field("", description="What the page says the action asks, in words")
    files: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Files given with it, as File upload gives them: {name, type, size, data_url}",
    )


class SessionSettingsRequest(BaseModel):
    """A settings change."""

    values: Dict[str, Any] = Field(..., description="The settings changed, by id")


class ResumeSessionRequest(BaseModel):
    """What a session is resumed with."""

    agent: str = Field(
        "",
        description="The application's agent here, for a session this runtime no longer holds",
    )


#: The most sessions a runtime holds; the oldest idle ones go first.
SESSIONS_HELD = 500


def _refused(refusal: Any) -> HTTPException:
    """A refusal of the session API as an HTTP one."""
    return HTTPException(status_code=refusal.status, detail=refusal.reason)


def _stream(chunks: Any) -> Any:
    """AG-UI events, streamed."""
    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        chunks,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _acts_as(
    instance: Dict[str, Any], caller: Caller, bearer: str
) -> Dict[str, str]:
    """In whose name a session runs: a deployment's principal, else the person (I-03).

    A deployment's caller is let in by its level first (D-02,
    `loop.apps.opening`), on every request of the session. Its principal's
    token is asked for again with the caller's token when it runs out, as
    every request of the session may.
    """
    from agent_runtimes.loop.apps.opening import NotLetIn, ensure_may_open
    from agent_runtimes.loop.apps.principal import (
        PrincipalTokenMissing,
        deployment_of,
        ensure_principal_token,
        principal_uid_of,
    )
    from agent_runtimes.loop.apps.sessions import SessionRefused

    deployment = deployment_of(instance)
    if caller.kind == "embed":
        # An embed token runs a session of its application's embedded
        # deployment, as that deployment's principal, and nothing beyond
        # (LOOP R-20): never a Preview, never in its owner's name.
        from agent_runtimes.loop.apps.callers import SESSION_SCOPE

        if SESSION_SCOPE not in caller.scopes:
            raise HTTPException(
                status_code=403,
                detail="This embed token does not run a session: ask its owner's server for a new one.",
            )
        if not deployment:
            raise HTTPException(
                status_code=403,
                detail="An embed token runs its application as it is deployed, not a Preview.",
            )
    if caller.kind == "visitor":
        # A visitor nobody knows (R-30): their own token calls the models,
        # and no principal acts for them — an application at its address is
        # opened to them by ai-agents, asked as nobody.
        if deployment:
            try:
                await ensure_may_open(deployment, caller, bearer)
            except NotLetIn as refused:
                raise HTTPException(
                    status_code=refused.status, detail=refused.reason
                ) from None
        return {
            "kind": "visitor",
            "uid": caller.uid,
            **({"deployment_uid": deployment} if deployment else {}),
        }
    if not deployment:
        return {"kind": "person", "uid": caller.uid}
    # Who may open it (D-02), before its principal acts for them: the token
    # held for the deployment is no reason to let anybody else talk to it.
    try:
        await ensure_may_open(deployment, caller, bearer)
    except NotLetIn as refused:
        raise HTTPException(status_code=refused.status, detail=refused.reason) from None
    try:
        await ensure_principal_token(deployment, bearer or None)
    except PrincipalTokenMissing as missing:
        raise _refused(SessionRefused(403, str(missing))) from None
    return {
        "kind": "principal",
        "uid": principal_uid_of(deployment),
        "deployment_uid": deployment,
    }


def _prune() -> None:
    """Forget the oldest idle sessions beyond what a runtime holds."""
    from agent_runtimes.loop.apps import sessions

    held = sessions._SESSIONS
    idle = [uid for uid, live in held.items() if live.state in ("open", "stopped")]
    for uid in idle[: max(0, len(held) - SESSIONS_HELD + 1)]:
        held.pop(uid, None)


def _check_instance(
    body: StartSessionRequest, app: AppSpec, instance: Dict[str, Any]
) -> None:
    """The session asked for is the one the agent runs: the same deployment, or a Preview."""
    from agent_runtimes.loop.apps.sessions import SessionRefused

    runs = str(instance.get("deployment_uid") or "")
    if body.deployment_uid != runs:
        raise _refused(
            SessionRefused(
                409,
                f"The agent {body.agent} runs {app.name} as deployment {runs}, "
                f"not {body.deployment_uid}."
                if runs and body.deployment_uid
                else f"The agent {body.agent} runs {app.name} as deployment {runs}: "
                "a Preview runs on an agent of its own."
                if runs
                else f"The agent {body.agent} runs a Preview of {app.name}, not "
                f"deployment {body.deployment_uid}.",
            )
        )
    app_uid = str(instance.get("app_uid") or "")
    if body.app_uid and app_uid and body.app_uid != app_uid:
        raise _refused(
            SessionRefused(
                409, f"The agent {body.agent} runs {app_uid}, not {body.app_uid}."
            )
        )
    version = int(instance.get("version") or 0)
    if body.version and version and body.version != version:
        raise _refused(
            SessionRefused(
                409,
                f"The agent {body.agent} runs version {version}, not {body.version}.",
            )
        )


async def _held(uid: str, request: Request) -> Tuple[Any, str]:
    """A session of this runtime its caller may drive, and the caller's token."""
    from agent_runtimes.context.identities import set_request_user_jwt
    from agent_runtimes.loop.apps.sessions import session_of

    live = session_of(uid)
    if live is None:
        raise HTTPException(status_code=404, detail=f"No session {uid} is held here.")
    authorized = await _authorize(
        request, False, live.app, str(live.instance.get("app_uid") or "")
    )
    if not live.answers_to(authorized.caller):
        # Somebody else's is not said to exist.
        raise HTTPException(status_code=404, detail=f"No session {uid} is held here.")
    _reaches(authorized.caller, live.agent_id)
    bearer = bearer_of(request.headers.get("authorization"))
    set_request_user_jwt(bearer or None)
    live.acts_as = await _acts_as(live.instance, authorized.caller, bearer)
    return live, bearer


@router.post("/sessions")
async def start_session(body: StartSessionRequest, request: Request) -> Any:
    """Start a session of the application an agent of this runtime runs."""
    from agent_runtimes.context.identities import set_request_user_jwt
    from agent_runtimes.loop.apps.sessions import SessionRefused, agent_app, new_session

    await _visitors_agent(body.agent, request)
    try:
        app, instance = agent_app(body.agent)
    except SessionRefused as refused:
        raise _refused(refused) from None
    authorized = await _authorize(
        request, False, app, str(instance.get("app_uid") or "")
    )
    _reaches(authorized.caller, body.agent)
    _check_instance(body, app, instance)
    bearer = bearer_of(request.headers.get("authorization"))
    set_request_user_jwt(bearer or None)
    acts_as = await _acts_as(instance, authorized.caller, bearer)
    _prune()
    try:
        live = new_session(
            agent_id=body.agent,
            app=app,
            instance=instance,
            opened_by=authorized.caller,
            acts_as=acts_as,
            settings=body.settings,
            uid=body.session,
        )
        return _stream(
            live.open(
                opener=body.opener.strip(),
                woken_by=body.woken_by or None,
                head=live.session_event(),
                bearer=bearer,
            )
        )
    except SessionRefused as refused:
        raise _refused(refused) from None


@router.get("/sessions")
async def list_sessions(request: Request, agent: str = "") -> Dict[str, Any]:
    """The caller's sessions held by this runtime, of one agent or all."""
    from agent_runtimes.loop.apps import sessions

    authorized = await _authorize(request, False)
    return {
        "sessions": [
            live.describe()
            for live in sessions._SESSIONS.values()
            if (not agent or live.agent_id == agent)
            and live.answers_to(authorized.caller)
        ]
    }


@router.get("/sessions/{uid}")
async def get_session(uid: str, request: Request) -> Dict[str, Any]:
    """What a session is: its application, in whose name it runs, where it stands."""
    live, _ = await _held(uid, request)
    return dict(live.describe())


@router.get("/sessions/{uid}/messages")
async def session_thread(uid: str, request: Request) -> Dict[str, Any]:
    """What a session's conversation holds, as AG-UI messages: what a page
    that reloaded draws again, for the caller that opened it — an embed's
    visit, with a token renewed for it (LOOP D-13). A session this runtime
    no longer holds, or somebody else's, is a 404."""
    live, _ = await _held(uid, request)
    return {"uid": live.uid, "messages": live.thread()}


@router.post("/sessions/{uid}/messages")
async def session_message(
    uid: str, body: SessionMessageRequest, request: Request
) -> Any:
    """A message: the next turn, or the answer to what the application asked."""
    from agent_runtimes.loop.apps.sessions import SessionRefused

    live, bearer = await _held(uid, request)
    try:
        return _stream(
            live.message(body.text, bearer=bearer, head=live.session_event())
        )
    except SessionRefused as refused:
        raise _refused(refused) from None


@router.post("/sessions/{uid}/actions")
async def session_action(uid: str, body: SessionActionRequest, request: Request) -> Any:
    """A page block's action, with the files given with it."""
    from agent_runtimes.loop.apps.sessions import SessionRefused, given_files

    live, bearer = await _held(uid, request)
    try:
        return _stream(
            live.action(
                body.name,
                payload=body.payload,
                text=body.text,
                files=given_files(body.files),
                bearer=bearer,
                head=live.session_event(),
            )
        )
    except SessionRefused as refused:
        raise _refused(refused) from None


@router.put("/sessions/{uid}/settings")
async def session_settings(
    uid: str, body: SessionSettingsRequest, request: Request
) -> Any:
    """A settings change: checked against the application's inputs, then kept."""
    from agent_runtimes.loop.apps.sessions import SessionRefused

    live, _ = await _held(uid, request)
    try:
        return _stream(live.change_settings(body.values, head=live.session_event()))
    except SessionRefused as refused:
        raise _refused(refused) from None


@router.post("/sessions/{uid}/stop")
async def stop_session(uid: str, request: Request) -> Dict[str, Any]:
    """Stop a session: what runs is cancelled; it waits to be resumed."""
    live, _ = await _held(uid, request)
    await live.stop()
    return dict(live.describe())


@router.post("/sessions/{uid}/end")
async def end_session(uid: str, request: Request) -> Dict[str, Any]:
    """End a session: what runs is cancelled, a Python application's ``end`` runs,
    and the runtime no longer holds it (LOOP P-14). Its record stays."""
    live, _ = await _held(uid, request)
    await live.end()
    return dict(live.describe())


@router.post("/sessions/logout")
async def logout_sessions(request: Request) -> Dict[str, Any]:
    """The caller signed out: each of their sessions here runs its ``logout``,
    then ends (LOOP P-14)."""
    from agent_runtimes.loop.apps import sessions

    authorized = await _authorize(request, False)
    ended: List[str] = []
    for live in list(sessions._SESSIONS.values()):
        if live.answers_to(authorized.caller):
            await live.logout()
            ended.append(live.uid)
    return {"ended": ended}


@router.post("/sessions/{uid}/resume")
async def resume_session(uid: str, body: ResumeSessionRequest, request: Request) -> Any:
    """Resume a stopped session — or, from its record, one this runtime no longer holds."""
    from agent_runtimes.context.identities import set_request_user_jwt
    from agent_runtimes.loop.apps.sessions import (
        SessionRefused,
        agent_app,
        conversation_from_record,
        new_session,
        session_of,
    )

    try:
        if session_of(uid) is not None:
            live, _ = await _held(uid, request)
            return _stream(live.resume(head=live.session_event()))
        if not body.agent:
            raise SessionRefused(
                404,
                f"No session {uid} is held here: say which agent runs its application, "
                "and it is resumed from its record.",
            )
        app, instance = agent_app(body.agent)
        authorized = await _authorize(
            request, False, app, str(instance.get("app_uid") or "")
        )
        if authorized.caller.kind == "visitor":
            from agent_runtimes.loop.apps.visitors import NOTHING_KEPT

            raise SessionRefused(404, NOTHING_KEPT)
        if authorized.caller.kind == "embed":
            # Its record names nobody who opened it (R-31): nobody can say
            # it is theirs to go on with (LOOP R-20).
            raise SessionRefused(
                404,
                "An embedded session is resumed only while this runtime holds it.",
            )
        bearer = bearer_of(request.headers.get("authorization"))
        set_request_user_jwt(bearer or None)
        acts_as = await _acts_as(instance, authorized.caller, bearer)
        messages = await conversation_from_record(uid, app, instance, bearer)
        _prune()
        live = new_session(
            agent_id=body.agent,
            app=app,
            instance=instance,
            opened_by=authorized.caller,
            acts_as=acts_as,
            uid=uid,
            messages=messages,
            resumed=True,
        )
        return _stream(live.resume(head=live.session_event()))
    except SessionRefused as refused:
        raise _refused(refused) from None


@router.post("/agents/{agent}/ag-ui/")
async def session_agui(agent: str, request: Request) -> Any:
    """An application's agent over AG-UI, each thread a session of it.

    What the chat of an application's page sends: an AG-UI run whose thread
    is the session — opened at its first run — and whose
    ``forwardedProps.loop`` carries what the page did besides the message
    (its settings, a block's action, the files given).
    """
    from agent_runtimes.context.identities import set_request_user_jwt
    from agent_runtimes.loop.apps.sessions import (
        SessionRefused,
        agent_app,
        new_session,
        session_of,
    )

    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=422, detail="An AG-UI run is JSON.") from None
    if not isinstance(body, dict):
        raise HTTPException(status_code=422, detail="An AG-UI run is a JSON object.")
    if session_of(str(body.get("threadId") or "")) is None:
        await _visitors_agent(agent, request)
    try:
        app, instance = agent_app(agent)
    except SessionRefused as refused:
        raise _refused(refused) from None
    authorized = await _authorize(
        request, False, app, str(instance.get("app_uid") or "")
    )
    _reaches(authorized.caller, agent)
    bearer = bearer_of(request.headers.get("authorization"))
    set_request_user_jwt(bearer or None)
    thread = str(body.get("threadId") or "")
    forwarded = body.get("forwardedProps")
    loop = forwarded.get("loop") if isinstance(forwarded, dict) else None
    # A message the person said: its transcript is the message, and the
    # record keeps it marked spoken (VOICE.md VO-27, VO-29).
    hear(spoken_of(forwarded.get("voice")) if isinstance(forwarded, dict) else None)
    try:
        live = session_of(thread)
        if live is None:
            acts_as = await _acts_as(instance, authorized.caller, bearer)
            _prune()
            live = new_session(
                agent_id=agent,
                app=app,
                instance=instance,
                opened_by=authorized.caller,
                acts_as=acts_as,
                uid=thread,
            )
        elif live.agent_id != agent or not live.answers_to(authorized.caller):
            raise SessionRefused(404, f"No session {thread} of {agent} is held here.")
        else:
            live.acts_as = await _acts_as(instance, authorized.caller, bearer)
        return _stream(live.run_agui(body, loop=loop or {}, bearer=bearer))
    except SessionRefused as refused:
        raise _refused(refused) from None


# --- What an application remembers (LOOP R-18, R-36) --------------------------


async def _whose(request: Request) -> str:
    """Whose memories the caller reaches: their own — the owner's, or a visitor's.

    An application's memories are kept per person and application
    (`agent_runtimes.loop.apps.memory`): each person reads, corrects and
    forgets what it remembers of them — its owner for its Preview and its
    deployments alike, a visitor at its address what it remembers of the
    visitor (R-36) — and nobody else's. The machine itself is the owner.
    """
    from agent_runtimes.memory.identity import resolve_memory_identity

    authorized = await _authorize(request, person_only=True, for_app=None)
    caller = authorized.caller
    identity = resolve_memory_identity()
    if caller.kind == "local" or (caller.uid and caller.uid == identity.user_uid):
        return identity.user_id
    if caller.kind == "person" and caller.uid:
        return caller.uid
    raise HTTPException(
        status_code=403,
        detail="What an application remembers is kept for each person who is signed in.",
    )


def _memory_of(app: str, user_id: str) -> Any:
    """What an application remembers of a person, or a refusal."""
    from agent_runtimes.loop.apps.memory import MemoryNotKept, app_memory, key_of

    try:
        return app_memory(key_of(app), user_id)
    except ValueError as refused:
        raise HTTPException(status_code=422, detail=str(refused)) from None
    except MemoryNotKept as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from None


def _remembered(entry: Dict[str, Any]) -> Dict[str, Any]:
    """One memory as an application's page shows it: what, and when it was learned."""
    return {
        "id": entry["id"],
        "memory": entry["content"],
        "created_at": entry["created_at"],
        "updated_at": entry["updated_at"],
        "corrected_by": entry["metadata"].get("corrected_by"),
        "corrected_at": entry["metadata"].get("corrected_at"),
    }


@router.get("/memories/{app}")
async def app_memories(
    app: str, request: Request, limit: int = Query(500, ge=1, le=1000)
) -> Dict[str, Any]:
    """What an application remembers of the caller, newest first.

    ``app`` is its uid — the `app` item it is kept as — or, for an
    application run from its file, its id.
    """
    memory = _memory_of(app, await _whose(request))
    listed = await memory.list_all(limit=limit)
    return {
        "app": app,
        "count": len(listed),
        "memories": [_remembered(entry) for entry in listed],
    }


@router.delete("/memories/{app}/{memory_id}")
async def forget_memory(app: str, memory_id: str, request: Request) -> Dict[str, Any]:
    """Forget one thing an application remembers of the caller; somebody else's is not found."""
    if not await _memory_of(app, await _whose(request)).forget(memory_id):
        raise HTTPException(
            status_code=404, detail=f"{app} remembers nothing as {memory_id}."
        )
    return {"forgotten": 1}


#: The longest correction kept, in characters — as the runtimes service keeps it.
CORRECTION_LIMIT = 2000


class Correction(BaseModel):
    """What a memory should say instead."""

    memory: str


@router.patch("/memories/{app}/{memory_id}")
async def correct_memory(
    app: str, memory_id: str, correction: Correction, request: Request
) -> Dict[str, Any]:
    """Correct one thing an application remembers, in place (LOOP R-34).

    Its words change — mem0 embeds them again — and the correction is kept
    with who made it and when. Somebody else's is not found.
    """
    whose = await _whose(request)
    words = " ".join(correction.memory.split())
    if not words:
        raise HTTPException(
            status_code=422,
            detail="A correction says what it should remember: it is empty.",
        )
    if len(words) > CORRECTION_LIMIT:
        raise HTTPException(
            status_code=422,
            detail=f"A correction is at most {CORRECTION_LIMIT} characters, not {len(words)}.",
        )
    memory = _memory_of(app, whose)
    corrected = await memory.correct(memory_id, words, corrected_by=whose)
    if corrected is None:
        raise HTTPException(
            status_code=404, detail=f"{app} remembers nothing as {memory_id}."
        )
    return {"corrected": 1, "memory": _remembered(corrected)}


@router.delete("/memories/{app}")
async def forget_everything(
    app: str, request: Request, count: int = Query(..., ge=0)
) -> Dict[str, Any]:
    """Forget everything an application remembers — no more than ``count``.

    ``count`` is what the caller was shown and confirmed: when it remembers
    more now, nothing is forgotten (409).
    """
    memory = _memory_of(app, await _whose(request))
    if len(await memory.list_all(limit=count + 1)) > count:
        raise HTTPException(
            status_code=409,
            detail=f"It remembers more than the {count} you confirmed now. "
            "Nothing was forgotten.",
        )
    return {"forgotten": await memory.forget_all()}
