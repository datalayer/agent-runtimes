# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's agent acts as its application's principal (I-03).

A deployed application is somebody of its own on the platform: a service
principal, whose token names it, its owner, the deployment it acts for, and
exactly what that deployment was granted (`authorization_details`, checked
live by every service reading it). Its agent on a runtime acts with that
token and with nothing else — not the runtime's inference token, not the
token of the person who launched the runtime.

How the token gets here: the agent of a deployment is made on a runtime by
whoever opens its session — the scheduler on a tick, the hosted page — with
`app_instance.deployment_uid` and their own token. With that token and its
own proof the runtime asks ai-agents for the principal's
(`POST /apps/deployments/{uid}/principal-token`), keeps it in memory, by
deployment, and asks again with the token of the latest request when less
than :data:`REFRESH_MARGIN_SECONDS` are left. Without it the agent is not
made; once it has expired the agent calls nothing, and says so.

What it is used for: model calls through ai-inference (metered on the owner,
naming the principal), the Datalayer MCP gateway (as a run with an identity
of its own), and the session's record in ai-agents.

**It goes to the runtime, not to a person.** The token that asks says who
opened the session; it does not say the call comes from a runtime. So a runtime
launched for a deployment holds a proof of that, which the platform minted at
its launch and its companion gave it (`give_runtime_proof`), and sends it to
ai-agents beside that token (`_proved`). ai-agents answers anybody but the
deployment's owner only with it. It is held in this process's memory alone: it
is no variable of the environment, so no subprocess, harness or kernel inherits
it; no route reads it back; it is written in no log, and it is sent to the one
ai-agents this runtime knew as it was given it, whatever the environment says
since. The same proof puts the runtime behind the application's own routes from
its launch rather than from its first agent (`launched_for`).

**What it runs is not the launcher's to say.** A proof is minted for whoever
launches a runtime naming a deployment, and the principal's token follows from
it, so what such a runtime runs as the principal comes from ai-agents, over
that proof: the Appspec, the version and the instance of the version the
deployment runs (`read_deployment`), read as the companion gives the proof
(`read_launched_app`) and again as the agent is made. What the launcher sends,
with the launch, with the agent or to the start hooks, is not read.

**A Preview is held to the same grants** (R-25, decided 2026-10-06):
though it runs as the person trying it, it reaches only the Spaces its
application is granted, and the companies it works with (P-01). As its session opens, and on each of its requests, the runtime asks
ai-agents with the person's token for a token of theirs narrowed to what the
Appspec it runs grants (`preview_grants`: its `permissions` and its `pap`
connections, its `pact` businesses and `commerce` merchants; `POST
/apps/{app_uid}/preview-token`, minted by IAM) — nothing
when it grants nothing — keeps it here beside the principals' and asks again
before it runs out, the same way (`ensure_preview_token`). Its runs carry that token in
place of the person's (`sessions.LiveSession.forward`); its model calls do
not change.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Awaitable, Callable, Mapping, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "ORGANIZATION_OWNER",
    "OWN_ROUTES_ONLY",
    "MembershipsUnread",
    "REFRESH_MARGIN_SECONDS",
    "PrincipalTokenMissing",
    "a_deployment_is_served",
    "administers",
    "agent_refused_here",
    "api_key_for",
    "deployment_of",
    "DeploymentCodeUnread",
    "DEPLOYMENT_RUNS_ITS_OWN",
    "deployments_served",
    "ensure_preview_token",
    "ensure_principal_token",
    "forget_principal_token",
    "gateway_toolsets_of_the_run",
    "give_principal_token",
    "give_runtime_proof",
    "holds_principal_token",
    "is_held_principal",
    "launched_app",
    "launched_for",
    "owner_of",
    "preview_grants",
    "preview_key",
    "preview_token",
    "preview_token_refusal",
    "principal_token",
    "principal_token_refusal",
    "principal_uid_of",
    "read_deployment",
    "read_deployment_code",
    "read_launched_app",
    "renew_principal_token",
    "use_code_reader",
    "use_memberships_asker",
    "use_preview_asker",
]

#: Asked again when less than this is left: a session in progress never meets
#: an expired token while somebody is still talking to it.
REFRESH_MARGIN_SECONDS = 300

#: deployment uid -> {"token", "expires_at", "principal_uid"}. Process memory only.
_HELD: dict[str, dict[str, Any]] = {}

#: The header a runtime's proof is sent in (`datalayer_common.authn.runtime_proof`).
RUNTIME_PROOF_HEADER = "X-Datalayer-Runtime-Proof"

#: How long ai-agents' refusal is held back for a proof not given yet, in
#: seconds: a page's first call can reach a runtime it saw start before the
#: platform has finished its start hooks.
RUNTIME_PROOF_WAIT = 15.0

#: This runtime's proof: {"token", "deployment_uid", "ai_agents_url"}, as it was
#: given. Process memory only: never `os.environ`, which a harness or a kernel
#: could read, and never answered by a route.
_PROOF: dict[str, str] = {}

#: What the deployment this runtime was launched for runs, as ai-agents said it:
#: {"spec", "instance"}. Empty when it was not said.
_LAUNCHED_APP: dict[str, dict[str, Any]] = {}


class PrincipalTokenMissing(RuntimeError):
    """A deployment's agent with no principal's token it may use, in a sentence."""


def deployment_of(app_instance: Optional[Mapping[str, Any]]) -> str:
    """The deployment an agent serves, or ``""`` for a Preview, a test or no application."""
    if not app_instance:
        return ""
    return str(app_instance.get("deployment_uid") or "").strip()


#: Why the conversation an agent that serves a deployment holds in memory is read by nobody.
EVERY_VISITORS = (
    "{agent} serves a deployment: what it holds in memory is every visitor's, so nobody reads it "
    "here; each person reads their own conversation through their own session."
)


def serves_a_deployment(agent_id: Optional[str]) -> bool:
    """Whether an agent serves a deployment, every visitor of which talks to it.

    Its message history, its context, its pending approvals and its events
    are then every visitor's at once — the last run's, whoever ran it — so
    the runtime's agent-wide reads (the monitoring stream, history, context,
    checkpoints) hand them to nobody, and nobody decides an approval there:
    a person's own conversation is their session's (`/apps/sessions`), their
    approvals ai-agents' (the release gates, found on r1, 14
    October 2026: a second account, and a caller with no token at all, read
    the first person's turns and approved their tool call).
    """
    from agent_runtimes.models.models import app_instance_of

    return bool(deployment_of(app_instance_of(agent_id)))


#: Why a runtime that serves a deployment answers a route that is not the application's own.
OWN_ROUTES_ONLY = (
    "This runtime serves a deployment: it answers only the application's own routes."
)


def give_runtime_proof(proof: str) -> str:
    """
    Keep the proof that this runtime was launched for a deployment.

    Parameters
    ----------
    proof : str
        What the platform minted at its launch, given by its companion. Its
        signature is ai-agents' to verify: here it is read for the deployment
        it names, and a proof that names none is refused.

    Returns
    -------
    str
        The deployment it names.

    Raises
    ------
    ValueError
        When it names no deployment.
    """
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.callers import _unverified_claims  # noqa: PLC0415

    token = (proof or "").strip()
    deployment = str(_unverified_claims(token).get("deployment_uid") or "").strip()
    if not deployment:
        raise ValueError("This proof names no deployment.")
    _PROOF.update(
        token=token,
        deployment_uid=deployment,
        ai_agents_url=(DatalayerURLs.from_environment().ai_agents_url or "").rstrip(
            "/"
        ),
    )
    return deployment


def forget_runtime_proof() -> None:
    """Forget this runtime's proof and what it read with it (a test)."""
    _PROOF.clear()
    _LAUNCHED_APP.clear()


def launched_for() -> str:
    """The deployment this runtime was launched for, or ``""`` for a runtime launched for none.

    As its proof says, from the moment it holds one, before any agent is made
    there: what `visitors.OwnRoutesOnly` holds it to, so that the time between
    its launch and its first agent is not one in which its routes answer as a
    person's own runtime's do.
    """
    return _PROOF.get("deployment_uid", "")


def launched_app() -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    """The Appspec and the instance of the deployment this runtime was launched
    for, as ai-agents said them (`read_launched_app`); ``(None, None)`` when it
    has not."""
    if not _LAUNCHED_APP:
        return None, None
    return _LAUNCHED_APP["spec"], _LAUNCHED_APP["instance"]


def agent_refused_here(
    deployment_uid: str, sandbox_variant: Optional[str]
) -> Optional[str]:
    """Why this agent may not be made here, or ``None`` when it may.

    A runtime launched for a deployment makes that deployment's agent and no
    other, and never with a sandbox inside this process, which holds what acts
    as it.
    """
    launched = launched_for()
    if not launched:
        return None
    if deployment_uid != launched:
        return "This runtime was launched for a deployment: it makes that deployment's agent, and no other."
    if sandbox_variant == "eval":
        return NO_SANDBOX_IN_THIS_PROCESS
    return None


#: Why a runtime launched for a deployment takes no spec of anybody's.
DEPLOYMENT_RUNS_ITS_OWN = (
    "This runtime was launched for a deployment: it runs that deployment's version, "
    "as ai-agents says it, and no spec it is sent."
)


#: Why a runtime launched for a deployment runs no code in its own process.
NO_SANDBOX_IN_THIS_PROCESS = (
    "This runtime was launched for a deployment: code runs in its sandbox, never "
    "in the process that holds what acts as it."
)


def _proved(deployment_uid: str, url: str) -> dict[str, str]:
    """The header proving this runtime to ai-agents, for that deployment and that
    address alone: no header at all for any other."""
    if _PROOF.get("deployment_uid") != deployment_uid or _PROOF.get(
        "ai_agents_url"
    ) != url.rstrip("/"):
        return {}
    return {RUNTIME_PROOF_HEADER: _PROOF["token"]}


async def _asked_with_proof(
    deployment_uid: str,
    url: str,
    ask: Callable[[dict[str, str]], Awaitable[Any]],
) -> Any:
    """An answer of ai-agents, asked with this runtime's proof.

    A refusal (403) of a call that carried none is held back while the proof
    may still be on its way (:data:`RUNTIME_PROOF_WAIT`), then asked once more.
    """
    headers = _proved(deployment_uid, url)
    response = await ask(headers)
    if response.status_code != 403 or headers:
        return response
    deadline = time.monotonic() + RUNTIME_PROOF_WAIT
    while time.monotonic() < deadline:
        await asyncio.sleep(0.2)
        headers = _proved(deployment_uid, url)
        if headers:
            return await ask(headers)
    return response


def a_deployment_is_served() -> bool:
    """Whether an agent of this runtime serves a deployment (`serves_a_deployment`).

    Such a runtime — a deployment's kept runtime, or the one a hosted page
    launched for it — then answers anybody but itself only on the
    application's own routes (`agent_runtimes.apps.visitors.path_answered`):
    configuring it, making, changing or listing its agents, its MCP servers,
    its sandbox and its monitoring stream are nobody's to reach from outside
    (the release gates, decided 14 October 2026).
    """
    from agent_runtimes.models.models import agents_serving_apps

    return any(serves_a_deployment(agent) for agent in agents_serving_apps())


def deployments_served() -> list[str]:
    """The deployments the agents of this runtime serve, by uid, each once."""
    from agent_runtimes.models.models import agents_serving_apps, app_instance_of

    served = (deployment_of(app_instance_of(agent)) for agent in agents_serving_apps())
    return sorted({deployment for deployment in served if deployment})


def owner_of(deployment_uid: str) -> str:
    """Whose a deployment an agent here serves is: its owner's account uid, or ``""``.

    As the token of its principal held here says (``account_uid``, which IAM
    signs and ai-agents handed this runtime as its agent was made) — never as
    a caller says. What keeps it on this runtime answers its owner alone
    (the release gates, decided 14 October 2026). ``""`` when no
    token of its principal is held here: nobody's, so nobody is answered.
    """
    from agent_runtimes.apps.callers import _unverified_claims  # noqa: PLC0415

    held = _HELD.get(deployment_uid)
    if not held:
        return ""
    return str(_unverified_claims(str(held["token"])).get("account_uid") or "")


#: IAM's administrator role in an organization (`OrganizationRoles.OWNER`),
#: as its memberships carry it (`roles_ss`).
ORGANIZATION_OWNER = "organization_owner"


class MembershipsUnread(RuntimeError):
    """IAM could not say which organizations a person administers, in a sentence."""


async def _ask_iam_memberships(bearer: str) -> list[dict[str, Any]]:
    """The caller's memberships as IAM says them (``GET /api/iam/v1/memberships``)."""
    import httpx

    from agent_runtimes.apps.callers import _platform_url  # noqa: PLC0415

    # The IAM that verified the caller's token (`callers.CallerVerifier`).
    url = _platform_url("DATALAYER_IAM_URL")
    if not url:
        raise MembershipsUnread(
            "This runtime does not know where IAM is, so it cannot read who administers an organization."
        )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{url}/api/iam/v1/memberships",
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise MembershipsUnread(
            f"IAM could not be asked who administers the organization ({type(error).__name__})."
        ) from error
    if response.status_code != 200:
        raise MembershipsUnread(
            f"IAM did not say who administers the organization ({response.status_code})."
        )
    try:
        return list((response.json() or {}).get("memberships") or [])
    except (ValueError, AttributeError, TypeError) as error:
        raise MembershipsUnread(
            f"IAM said memberships this runtime cannot read ({type(error).__name__})."
        ) from error


#: Who says a person's memberships: IAM, or a test.
_memberships_asker: dict[str, Callable[[str], Awaitable[list[dict[str, Any]]]]] = {
    "ask": _ask_iam_memberships
}


def use_memberships_asker(
    asker: Optional[Callable[[str], Awaitable[list[dict[str, Any]]]]],
) -> None:
    """Who says a person's memberships: IAM, or a test; ``None`` for IAM."""
    _memberships_asker["ask"] = asker or _ask_iam_memberships


async def administers(organization_uid: str, bearer: str) -> bool:
    """Whether the person whose token ``bearer`` is administers ``organization_uid``.

    Read from IAM with their own token, as Spacer and Contents read an
    organization's owners: their membership of it (``GET
    /api/iam/v1/memberships``, `datalayer_core.models.iam.MembershipsModel`)
    carries IAM's administrator role, :data:`ORGANIZATION_OWNER`, which only
    an organization's memberships carry. A member without it does not.
    Fails closed: `MembershipsUnread` when IAM cannot say.
    """
    from datalayer_core.models.iam import MembershipsModel

    if not organization_uid or not bearer:
        return False
    try:
        memberships = MembershipsModel(
            memberships=await _memberships_asker["ask"](bearer)
        ).memberships
    except ValueError as error:
        raise MembershipsUnread(
            f"IAM said memberships this runtime cannot read ({type(error).__name__})."
        ) from error
    return any(
        membership.uid == organization_uid and ORGANIZATION_OWNER in membership.roles_ss
        for membership in memberships
    )


def give_principal_token(
    deployment_uid: str, token: str, *, expires_in: int, principal_uid: str = ""
) -> None:
    """Keep the principal's token for a deployment, for ``expires_in`` seconds."""
    _HELD[deployment_uid] = {
        "token": token,
        "expires_at": time.time() + max(0, int(expires_in)),
        "principal_uid": principal_uid,
    }


def holds_principal_token(deployment_uid: str) -> bool:
    """Whether an agent here was made for a deployment: its principal's token held, expired or not."""
    return deployment_uid in _HELD


def forget_principal_token(deployment_uid: str) -> None:
    """Forget a deployment's token (its agent deleted, a test)."""
    _HELD.pop(deployment_uid, None)


def principal_token_refusal(deployment_uid: str) -> Optional[str]:
    """Why the deployment's agent cannot act now, or ``None`` when it can."""
    held = _HELD.get(deployment_uid)
    if not held:
        return (
            f"The agent of deployment {deployment_uid} holds no token of its "
            "application's principal: it acts in nobody's name, and calls nothing."
        )
    if held["expires_at"] <= time.time():
        when = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(held["expires_at"]))
        return (
            f"The token of deployment {deployment_uid}'s principal expired at {when}: "
            "it calls nothing more. Open a new session."
        )
    return None


def principal_uid_of(deployment_uid: str) -> str:
    """The uid of the principal a deployment's agent acts as, or ``""`` when it holds none."""
    return str((_HELD.get(deployment_uid) or {}).get("principal_uid") or "")


def is_held_principal(claims: Mapping[str, Any]) -> bool:
    """Whether a token's claims are those of a principal this runtime acts as, for the
    same deployment: its `agent_uid` and the deployment's live grant (`task_grant_uid`)
    those of a token held here. What ai-agents sends a kept deployment's agent a
    company's turn with (B-04) — never a person's, never another's.
    """
    from agent_runtimes.apps.callers import _unverified_claims  # noqa: PLC0415

    agent = str(claims.get("agent_uid") or "")
    grant = str(claims.get("task_grant_uid") or "")
    if not agent or not grant:
        return False
    for held in _HELD.values():
        if held.get("principal_uid") != agent or held["expires_at"] <= time.time():
            continue
        if (
            str(_unverified_claims(str(held["token"])).get("task_grant_uid") or "")
            == grant
        ):
            return True
    return False


def principal_token(deployment_uid: str) -> Optional[str]:
    """The principal's token for a deployment, or ``None`` when it has none it may use."""
    if principal_token_refusal(deployment_uid):
        return None
    return str(_HELD[deployment_uid]["token"])


async def _ask_ai_agents(deployment_uid: str, bearer: str) -> dict[str, Any]:
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.opening import page_origin_headers

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise PrincipalTokenMissing(
            f"The principal of deployment {deployment_uid} cannot be asked for: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await _asked_with_proof(
                deployment_uid,
                url,
                lambda proved: client.post(
                    f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/principal-token",
                    # An embed's page, which ai-agents checks against the
                    # sites its owner allows it on (D-12).
                    headers={
                        "Authorization": f"Bearer {bearer}",
                        **page_origin_headers(),
                        **proved,
                    },
                ),
            )
    except httpx.HTTPError as error:
        raise PrincipalTokenMissing(
            f"ai-agents could not be asked for the principal of deployment {deployment_uid}: {error}."
        ) from error
    if response.status_code >= 300:
        detail = ""
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
        raise PrincipalTokenMissing(
            f"ai-agents gave deployment {deployment_uid} no principal's token "
            f"({response.status_code}){': ' + detail if detail else ''}."
        )
    return dict(response.json() or {})


#: Who is asked; replaced by a test.
_asker: dict[str, Callable[[str, str], Awaitable[dict[str, Any]]]] = {
    "ask": _ask_ai_agents
}


def use_asker(asker: Optional[Callable[[str, str], Awaitable[dict[str, Any]]]]) -> None:
    """Who answers the principal's token: ai-agents, or a test; ``None`` for ai-agents."""
    _asker["ask"] = asker or _ask_ai_agents


class DeploymentCodeUnread(RuntimeError):
    """The code of the version a deployment runs, not read, in a sentence."""


async def _read_from_ai_agents(
    deployment_uid: str, version: Optional[int], bearer: Optional[str]
) -> dict[str, Any]:
    """What ai-agents answers of a deployment's version: the one named, or with
    ``None`` the one it runs. Its ``code`` read; the rest is `read_deployment`'s."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.opening import page_origin_headers

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise DeploymentCodeUnread(
            f"The code of deployment {deployment_uid} cannot be read: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await _asked_with_proof(
                deployment_uid,
                url,
                lambda proved: client.get(
                    f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/code",
                    params={} if version is None else {"version": int(version)},
                    # An embed's page, checked as for the principal's token (D-12).
                    # With no token, asked as nobody: answered only for a deployment
                    # somebody without an account may talk to (R-30), and only
                    # with this runtime's proof.
                    headers={
                        **({"Authorization": f"Bearer {bearer}"} if bearer else {}),
                        **page_origin_headers(),
                        **proved,
                    },
                ),
            )
    except httpx.HTTPError as error:
        raise DeploymentCodeUnread(
            f"ai-agents could not be asked for the code of deployment {deployment_uid}: {error}."
        ) from error
    if response.status_code >= 300:
        detail = ""
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
        raise DeploymentCodeUnread(
            f"ai-agents gave deployment {deployment_uid} no code "
            f"({response.status_code}){': ' + detail if detail else ''}."
        )
    try:
        answer = response.json()
    except ValueError as error:
        raise DeploymentCodeUnread(
            f"ai-agents answered the code of deployment {deployment_uid} in no JSON."
        ) from error
    if not isinstance(answer, dict) or "code" not in answer:
        raise DeploymentCodeUnread(
            f"ai-agents answered the code of deployment {deployment_uid} without it."
        )
    code = answer["code"]
    if code is not None and not isinstance(code, dict):
        raise DeploymentCodeUnread(
            f"ai-agents answered the code of deployment {deployment_uid} in another shape."
        )
    return answer


async def _code_from_ai_agents(
    deployment_uid: str, version: int, bearer: Optional[str]
) -> Optional[dict[str, Any]]:
    answer = await _read_from_ai_agents(deployment_uid, version, bearer)
    return answer["code"]


#: Who answers a deployment's code; replaced by a test.
_code_reader: dict[
    str, Callable[[str, int, Optional[str]], Awaitable[Optional[dict[str, Any]]]]
] = {"read": _code_from_ai_agents}


def use_code_reader(
    reader: Optional[
        Callable[[str, int, Optional[str]], Awaitable[Optional[dict[str, Any]]]]
    ],
) -> None:
    """Who answers a deployment's code: ai-agents, or a test; ``None`` for ai-agents."""
    _code_reader["read"] = reader or _code_from_ai_agents


async def read_deployment_code(
    deployment_uid: str, version: int, bearer: Optional[str]
) -> Optional[dict[str, Any]]:
    """
    The ``app.py`` of the version a deployment runs, ``{file, text}``, or
    ``None`` for a version written as a spec (R-14).

    Read from ai-agents (`GET /apps/deployments/{uid}/code`) with the token
    of whoever opened the session and this runtime's proof, admitted as for
    the principal's token: never taken from the request that makes the agent.
    With none — the runtime a deployment is kept on, making the agent a
    visitor without an account talks to — asked as nobody, which ai-agents
    answers only for a deployment such a visitor may talk to (R-30), with
    this runtime's proof.

    Parameters
    ----------
    deployment_uid : str
        The deployment the agent serves.
    version : int
        The version its agent runs.
    bearer : str | None
        The token of whoever opened the session; ``None`` to ask as nobody.

    Returns
    -------
    dict | None
        The code, or ``None`` when the version has none.

    Raises
    ------
    DeploymentCodeUnread
        When it could not be read: the agent is not made.
    """
    return await _code_reader["read"](deployment_uid, int(version), bearer)


async def read_deployment(
    deployment_uid: str, version: Optional[int], bearer: Optional[str]
) -> dict[str, Any]:
    """
    What a deployment's version is, as ai-agents says it: what makes its agent
    on a runtime launched for it, in place of anything the caller sent.

    Asked as `read_deployment_code` is, and refused to the same people.

    Parameters
    ----------
    deployment_uid : str
        The deployment.
    version : int | None
        A version its owner moves it to, which ai-agents answers them alone;
        ``None`` for the one it runs.
    bearer : str | None
        The token of whoever opened the session; ``None`` to ask as nobody.

    Returns
    -------
    dict
        ``spec``, ``code``, ``version``, ``app_uid``, ``organization_uid`` and
        ``spend_limit``.

    Raises
    ------
    DeploymentCodeUnread
        When ai-agents refused it, or did not say all of it: nothing is made
        from a part of it, and nothing the caller sent takes its place.
    """
    answer = await _read_from_ai_agents(deployment_uid, version, bearer)
    said = answer.get("version")
    if (
        not isinstance(answer.get("spec"), dict)
        or not isinstance(said, int)
        or said < 1
        or not answer.get("app_uid")
    ):
        raise DeploymentCodeUnread(
            f"ai-agents did not say what deployment {deployment_uid} runs."
        )
    return answer


async def read_launched_app(
    bearer: Optional[str], version: Optional[int] = None
) -> Optional[str]:
    """
    Read what the deployment this runtime was launched for runs, as it is given
    its proof, before any agent is made: what its start hooks declare from.

    Parameters
    ----------
    bearer : str | None
        The token of whoever launched it, which ai-agents answers as it would
        a session of theirs.
    version : int | None
        The version its launch names (`read_deployment`).

    Returns
    -------
    str | None
        Why it was not read, or ``None``. Not read, the start hooks declare
        nothing, and the agent is refused in the same sentence as it is made.
    """
    deployment = launched_for()
    try:
        answer = await read_deployment(deployment, version, bearer)
    except DeploymentCodeUnread as unread:
        return str(unread)
    _LAUNCHED_APP.update(
        spec=answer["spec"],
        instance={
            "app_uid": str(answer["app_uid"]),
            "deployment_uid": deployment,
            "version": int(answer["version"]),
        },
    )
    return None


async def _ensure_held(
    key: str,
    bearer: Optional[str],
    ask: Callable[[str], Awaitable[dict[str, Any]]],
    refusal: Callable[[], Optional[str]],
    what: str,
) -> dict[str, Any]:
    """A token held under ``key``, asked for with ``bearer`` when none is held
    or it runs out: what a deployment's principal and a Preview share.

    Returns what ai-agents answered when it was asked now, else ``{}``.
    """
    held = _HELD.get(key)
    fresh = (
        held is not None and held["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS
    )
    if fresh:
        return {}
    if bearer:
        try:
            answer = await ask(bearer)
        except PrincipalTokenMissing:
            if not refusal():
                # Still good for a few minutes: the next request asks again.
                return {}
            raise
        token = str(answer.get("access_token") or "")
        if not token:
            raise PrincipalTokenMissing(f"ai-agents answered {what} no token.")
        give_principal_token(
            key,
            token,
            expires_in=int(answer.get("expires_in") or 0),
            principal_uid=str(answer.get("principal_uid") or ""),
        )
        return answer
    said = refusal()
    if said:
        raise PrincipalTokenMissing(said)
    return {}


async def ensure_principal_token(deployment_uid: str, bearer: Optional[str]) -> str:
    """
    The principal's token for a deployment, asked for when none is held or it runs out.

    Parameters
    ----------
    deployment_uid : str
        The deployment the agent serves.
    bearer : str | None
        The token of whoever opened the session or sent the request.

    Returns
    -------
    str
        The token.

    Raises
    ------
    PrincipalTokenMissing
        When none is held and none could be had: the agent is not made, or
        calls nothing.
    """
    answer = await _ensure_held(
        deployment_uid,
        bearer,
        lambda asking: _asker["ask"](deployment_uid, asking),
        lambda: principal_token_refusal(deployment_uid),
        f"deployment {deployment_uid}",
    )
    if answer:
        logger.info(
            "Deployment %s acts as its principal %s.",
            deployment_uid,
            answer.get("principal_uid") or "?",
        )
    return str(_HELD[deployment_uid]["token"])


async def renew_principal_token(deployment_uid: str, bearer: str) -> float:
    """
    Ask for a deployment's principal's token now, whatever is held: what keeps
    a deployment kept always on acting (A-08).

    A kept deployment is asked mostly by callers whose token is no reason to
    ask for its principal's — a visitor's over A2A, a key granted to its
    route — so the token its agent was made with runs out an hour later and
    nothing asks again. ai-agents, which keeps it on, renews it before then
    with a key of its owner IAM mints for the runtime.

    Parameters
    ----------
    deployment_uid : str
        The deployment an agent on this runtime serves.
    bearer : str
        The token to ask ai-agents with: its owner's key for the kept runtime.

    Returns
    -------
    float
        When the new token runs out (epoch seconds).

    Raises
    ------
    PrincipalTokenMissing
        When no agent here serves that deployment, or ai-agents gave no token:
        what is held is left as it is.
    """
    if not holds_principal_token(deployment_uid):
        raise PrincipalTokenMissing(
            f"No agent on this runtime serves deployment {deployment_uid}: its principal is not asked for here."
        )
    answer = await _asker["ask"](deployment_uid, bearer)
    token = str(answer.get("access_token") or "")
    if not token:
        raise PrincipalTokenMissing(
            f"ai-agents answered deployment {deployment_uid} no token."
        )
    give_principal_token(
        deployment_uid,
        token,
        expires_in=int(answer.get("expires_in") or 0),
        principal_uid=str(answer.get("principal_uid") or ""),
    )
    logger.info(
        "Deployment %s's principal token renewed by its keeper.", deployment_uid
    )
    return float(_HELD[deployment_uid]["expires_at"])


def api_key_for(deployment_uid: str) -> Callable[[], Awaitable[str]]:
    """
    The API key a deployment's model calls ai-inference with: its principal's token.

    Read as each call is made, as the runtime's inference token is, and never
    that token in its place.

    Parameters
    ----------
    deployment_uid : str
        The deployment.

    Returns
    -------
    Callable[[], Awaitable[str]]
        What the OpenAI client asks before each request.
    """

    async def api_key() -> str:
        from agent_runtimes.models.offered import InferenceTokenMissing

        refusal = principal_token_refusal(deployment_uid)
        if refusal:
            raise InferenceTokenMissing(refusal)
        return str(_HELD[deployment_uid]["token"])

    return api_key


async def gateway_toolsets_of_the_run(
    agent_id: Optional[str], toolsets: list[Any], bearer: Optional[str]
) -> list[Any]:
    """
    An application's run reaches the Datalayer MCP gateway as the application, never with the runtime's key.

    A deployment's run with its principal's token (I-03) — its servers in
    each user's name with the token of the person talking to it (I-04) — and
    a Preview's with the token its run carries, the person's narrowed to the
    Spaces its application is granted (R-25): the gateway holds each to those
    Spaces. Any other agent's toolsets are left as they are.

    Parameters
    ----------
    agent_id : str | None
        The agent running.
    toolsets : list[Any]
        Its toolsets, as the process holds them.
    bearer : str | None
        The token the run's request carries.

    Returns
    -------
    list[Any]
        The toolsets, the gateway's reached with the application's token.
    """
    from agent_runtimes.apps.pap_connections import companies_of_agent
    from agent_runtimes.mcp.datalayer_gateway import toolsets_for_the_run
    from agent_runtimes.models.models import app_instance_of

    instance = app_instance_of(agent_id)
    if not instance or not str(instance.get("app_uid") or "").strip():
        return toolsets
    deployment = deployment_of(instance)
    if not deployment:
        # A Preview: its session's run carries the person's token narrowed to
        # the granted Spaces (`sessions.LiveSession.run_token`); without one,
        # the gateway is reached with none and refuses.
        return toolsets_for_the_run(
            toolsets,
            bearer or "",
            users_token=bearer or "",
            companies=companies_of_agent(agent_id),
        )
    from agent_runtimes.apps.acting import acting_token, servers_in_users_name

    in_users_name = servers_in_users_name(agent_id)
    companies = companies_of_agent(agent_id)
    in_their_name = bool(in_users_name) or any(
        acting != "owner" for _, acting in companies
    )
    return toolsets_for_the_run(
        toolsets,
        principal_token(deployment) or "",
        in_users_name=in_users_name,
        users_token=(await acting_token(deployment, bearer) if in_their_name else ""),
        companies=companies,
    )


# --- a Preview, held to its application's Space grants (R-25) ----------


def preview_grants(app: Any) -> dict[str, Any]:
    """What an Appspec grants a Preview of it, as ai-agents is asked to narrow its token to.

    Its ``permissions`` (the Spaces, R-25) and its ``pap`` connections
    (the companies it works with, P-01): a Preview whose token
    named no company had every call of the gateway's `pap` toolset refused.
    And its ``pact`` connections and ``commerce`` merchants (the businesses
    and the test merchants it asks for the person, PI-42):
    without them, a Preview of *Travel Desk* or *Shopping Desk* had every
    call of the gateway's `pact`, `ucp` and `acp` toolsets refused. And the
    sites it reads signed (``signed_fetch``, EX-11), for the
    gateway's `signed-fetch` toolset.
    """
    pap = app.pap.model_dump(mode="json", by_alias=True, exclude_none=True)
    pact = app.pact.model_dump(mode="json", by_alias=True, exclude_none=True)
    commerce = app.commerce.model_dump(mode="json", by_alias=True, exclude_none=True)
    signed_fetch = app.signed_fetch.model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    return {
        # A repository lent to its computer, unset, is not said: ai-agents
        # is asked with the shape it knows.
        "permissions": app.permissions.model_dump(mode="json", exclude_none=True),
        "pap": {"connections": pap.get("connections") or []},
        "pact": {"connections": pact.get("connections") or []},
        "commerce": {"merchants": commerce.get("merchants") or []},
        "signed_fetch": {"sites": signed_fetch.get("sites") or []},
    }


def preview_key(app_uid: str, person_uid: str, grants: Mapping[str, Any]) -> str:
    """Where a Preview's token is held: by application, the person trying it,
    and what its Appspec grants now (`preview_grants`) — a list changed is a
    token asked again, never one narrowed to the list before.
    """
    permissions = grants.get("permissions") or {}
    spaces = sorted(
        (str(grant.get("space") or ""), str(grant.get("access") or "read"))
        for grant in permissions.get("spaces") or []
    )
    companies = sorted(
        json.dumps(connection, sort_keys=True)
        for connection in (grants.get("pap") or {}).get("connections") or []
    )
    # The businesses and merchants it asks for the person (PI-42),
    # and the sites it reads signed (EX-11).
    others = sorted(
        json.dumps(connection, sort_keys=True)
        for connection in [
            *((grants.get("pact") or {}).get("connections") or []),
            *((grants.get("commerce") or {}).get("merchants") or []),
            *((grants.get("signed_fetch") or {}).get("sites") or []),
        ]
    )
    digest = hashlib.sha256(
        json.dumps([spaces, companies, *([others] if others else [])]).encode("utf-8")
    ).hexdigest()[:16]
    return f"preview:{app_uid}:{person_uid}:{digest}"


def preview_token_refusal(
    app_uid: str, person_uid: str, grants: Mapping[str, Any]
) -> Optional[str]:
    """Why a Preview of an application cannot reach anything now, or ``None`` when it can."""
    held = _HELD.get(preview_key(app_uid, person_uid, grants))
    if not held:
        return (
            f"The Preview of {app_uid} holds no token narrowed to the Spaces and the "
            "companies its application is granted: it reaches nothing."
        )
    if held["expires_at"] <= time.time():
        return (
            f"The token of the Preview of {app_uid} expired: it reaches nothing more. "
            "Send a message again."
        )
    return None


def preview_token(
    app_uid: str, person_uid: str, grants: Mapping[str, Any]
) -> Optional[str]:
    """A Preview's token, or ``None`` when it has none it may use."""
    if preview_token_refusal(app_uid, person_uid, grants):
        return None
    return str(_HELD[preview_key(app_uid, person_uid, grants)]["token"])


async def _ask_ai_agents_for_a_preview(
    app_uid: str, grants: Mapping[str, Any], bearer: str
) -> dict[str, Any]:
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise PrincipalTokenMissing(
            f"The Preview of {app_uid} cannot be held to its grants: no ai-agents is configured."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/{app_uid}/preview-token",
                json=dict(grants),
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise PrincipalTokenMissing(
            f"ai-agents could not be asked for the Preview of {app_uid}: {error}."
        ) from error
    if response.status_code >= 300:
        detail = ""
        try:
            detail = str((response.json() or {}).get("detail") or "")
        except ValueError:
            detail = response.text[:200]
        raise PrincipalTokenMissing(
            f"ai-agents gave the Preview of {app_uid} no token "
            f"({response.status_code}){': ' + detail if detail else ''}."
        )
    return dict(response.json() or {})


#: Who answers a Preview's token; replaced by a test.
_preview_asker: dict[
    str, Callable[[str, Mapping[str, Any], str], Awaitable[dict[str, Any]]]
] = {"ask": _ask_ai_agents_for_a_preview}


def use_preview_asker(
    asker: Optional[Callable[[str, Mapping[str, Any], str], Awaitable[dict[str, Any]]]],
) -> None:
    """Who answers a Preview's token: ai-agents, or a test; ``None`` for ai-agents."""
    _preview_asker["ask"] = asker or _ask_ai_agents_for_a_preview


async def ensure_preview_token(
    app_uid: str,
    person_uid: str,
    grants: Mapping[str, Any],
    bearer: Optional[str],
) -> str:
    """
    The token a Preview runs with, asked for when none is held or it runs out (R-25).

    The person's own, narrowed by ai-agents and IAM to what the Appspec the
    Preview runs grants (``permissions.spaces``, and the companies of its
    ``pap.connections`` in the person's name: P-01) — nothing
    when it grants nothing — asked for with the person's token, as a
    deployment's principal's is with its opener's, and kept in memory.

    Parameters
    ----------
    app_uid : str
        The application tried, as Datalayer knows it.
    person_uid : str
        Who is trying it.
    grants : Mapping[str, Any]
        What the Appspec the Preview runs grants (`preview_grants`).
    bearer : str | None
        The person's token, from the request.

    Returns
    -------
    str
        The token.

    Raises
    ------
    PrincipalTokenMissing
        When none is held and none could be had: the Preview runs nothing.
    """
    if not app_uid:
        raise PrincipalTokenMissing(
            "A Preview reaches the Spaces its application is granted on Datalayer, "
            "and this one is not there: save it first."
        )
    key = preview_key(app_uid, person_uid, grants)
    answer = await _ensure_held(
        key,
        bearer,
        lambda asking: _preview_asker["ask"](app_uid, grants, asking),
        lambda: preview_token_refusal(app_uid, person_uid, grants),
        f"the Preview of {app_uid}",
    )
    if answer:
        logger.info(
            "The Preview of %s for %s reaches %d Space(s) and %d company(ies).",
            app_uid,
            person_uid,
            len(answer.get("spaces") or []),
            len(answer.get("companies") or []),
        )
    return str(_HELD[key]["token"])
