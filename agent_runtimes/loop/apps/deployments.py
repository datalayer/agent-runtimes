# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Deployments, from the terminal (LOOP S-06).

The same deployments the Studio's Ship tab keeps. An application's
definition is Spacer's — its `app` item, read here for its name, its space
and its latest version; what runs is kept by ai-agents
(`/api/ai-agents/v1/apps/deployments`, LOOP R-11). A deployment points at one
version; deploying moves the pointer; a hosted deployment has its address on
the main site, `/apps/<slug>`.

And a session of a deployment that nobody opened: woken by one of its
schedules (LOOP R-14), the scheduler launches a runtime, creates the
deployment's agent on it with `session_payload` — what ai-agents answers it
with — and asks it the trigger's prompt with `start_session`.

And a deployment kept on a runtime of its own (LOOP R-33): a live deployment
its owner keeps always on has one runtime, launched as its owner, whose
agent is made from the deployment record every time that runtime starts —
`kept_payload`, created with `create_agent` — so that a visitor waits for
the answer and never for the start (R-08).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from typing import Any, Mapping, Optional
from urllib.parse import quote

import httpx

APP_ITEM_TYPE = "app"

#: How a slug is written: lower-case letters, digits and hyphens, at most 64.
SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")


class DeployRefused(RuntimeError):
    """What stands in the way of a deployment, in a sentence."""


@dataclass(frozen=True)
class Deployment:
    uid: str
    app_uid: str
    version: int
    target: str = "hosted"
    state: str = "live"
    slug: str = ""
    updated_at: str = ""


@dataclass(frozen=True)
class StoredApp:
    uid: str
    name: str
    space_id: str
    #: The version saved last: what a deploy runs unless told otherwise.
    version: int


def deployment_path(slug: str) -> str:
    return f"/apps/{quote(slug, safe='')}"


def slug_of(name: str) -> str:
    """An address from a name, as the Studio proposes one."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:64].strip("-")


def slug_problem(slug: str, taken: list[Deployment], own: str = "") -> str:
    """What is wrong with an address, as far as the caller's own tell."""
    if not slug:
        return "Choose the address it is reached at."
    if not SLUG.match(slug):
        return "An address is lower-case letters, digits and hyphens, at most 64."
    if any(d.slug == slug and d.uid != own for d in taken):
        return f"“{slug}” is already the address of another of your applications."
    return ""


def deployment_of(raw: Any) -> Deployment:
    """A deployment as ai-agents answers with it."""
    data = raw if isinstance(raw, dict) else {}
    try:
        version = max(1, int(data.get("version") or 1))
    except (TypeError, ValueError):
        version = 1
    return Deployment(
        uid=str(data.get("uid") or ""),
        app_uid=str(data.get("app_uid") or ""),
        version=version,
        target="embedded" if data.get("target") == "embedded" else "hosted",
        state="paused" if data.get("state") == "paused" else "live",
        slug=str(data.get("slug") or ""),
        updated_at=str(data.get("updated_at") or ""),
    )


APP_ITEM_FORMAT = "loop.app.item/v1"


def version_of_model(model: Any) -> int:
    """The saved version an app item's content holds (`state.revision`).

    Refused for an item in another form: it is said, not guessed at.
    """
    try:
        data = json.loads(model) if isinstance(model, str) else model
    except ValueError:
        data = None
    state = data.get("state") if isinstance(data, dict) else None
    revision = state.get("revision") if isinstance(state, dict) else None
    if (
        not isinstance(data, dict)
        or data.get("format") != APP_ITEM_FORMAT
        or not isinstance(revision, int)
        or revision < 1
    ):
        raise DeployRefused(
            "This application is kept in an older form: open it in the Studio and save it once."
        )
    return revision


class Deployments:
    """The caller's applications on the Spacer, and their deployments on ai-agents."""

    def __init__(
        self,
        spacer_url: str,
        token: str,
        client: Optional[httpx.Client] = None,
        ai_agents_url: str = "",
    ):
        self.base = f"{spacer_url.rstrip('/')}/api/spacer/v1"
        self.agents = f"{(ai_agents_url or spacer_url).rstrip('/')}/api/ai-agents/v1/apps/deployments"
        self.http = client or httpx.Client(
            headers={"Authorization": f"Bearer {token}"}, timeout=30.0
        )

    def _answer(self, response: httpx.Response, failure: str) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        if response.status_code >= 300 or body.get("success") is False:
            said = body.get("detail") or body.get("message") or response.status_code
            raise DeployRefused(f"{failure}: {said}")
        return body

    def app(self, uid: str) -> StoredApp:
        body = self._answer(
            self.http.get(f"{self.base}/lexicals/{quote(uid, safe='')}"),
            "The application could not be read",
        )
        document = body.get("document") or {}
        if document.get("type_s") != APP_ITEM_TYPE:
            raise DeployRefused(f"{uid} is not an application.")
        try:
            metadata = json.loads(document.get("metadata_s") or "{}")
        except ValueError:
            metadata = {}
        return StoredApp(
            uid=uid,
            name=document.get("name_t") or document.get("name") or "App",
            space_id=metadata.get("space", "") if isinstance(metadata, dict) else "",
            version=version_of_model(document.get("model_s")),
        )

    def list(self, app_uid: str = "") -> list[Deployment]:
        params = {"app_uid": app_uid} if app_uid else None
        body = self._answer(
            self.http.get(self.agents, params=params),
            "The deployments could not be listed",
        )
        return [deployment_of(raw) for raw in body.get("deployments") or []]

    def create(self, app: StoredApp, version: int, slug: str) -> Deployment:
        body = self._answer(
            self.http.post(
                self.agents,
                json={
                    "app_uid": app.uid,
                    "space_uid": app.space_id,
                    "app_name": app.name,
                    "version": version,
                    "target": "hosted",
                    "slug": slug,
                },
            ),
            "The application could not be deployed",
        )
        return deployment_of(body.get("deployment"))

    def update(self, deployment: Deployment) -> Deployment:
        body = self._answer(
            self.http.patch(
                f"{self.agents}/{quote(deployment.uid, safe='')}",
                json={"version": deployment.version, "state": deployment.state},
            ),
            "The deployment could not be changed",
        )
        return deployment_of(body.get("deployment"))

    def delete(self, uid: str) -> None:
        self._answer(
            self.http.delete(f"{self.agents}/{quote(uid, safe='')}"),
            "The deployment could not be taken down",
        )


def deploy(
    deployments: Deployments,
    app_uid: str,
    version: Optional[int] = None,
    slug: Optional[str] = None,
) -> tuple[Deployment, str]:
    """Deploy a version at the application's hosted address.

    Returns the deployment and what was done, in a word: ``created``,
    ``moved``, ``resumed`` or ``unchanged``.
    """
    app = deployments.app(app_uid)
    target = version or app.version
    if target < 1 or target > app.version:
        raise DeployRefused(
            f"{app.name} has no version {target}; the latest is {app.version}."
        )
    mine = deployments.list()
    hosted = next(
        (d for d in mine if d.app_uid == app_uid and d.target == "hosted"), None
    )
    if hosted is None:
        chosen = slug or slug_of(app.name)
        problem = slug_problem(chosen, mine)
        if problem:
            raise DeployRefused(problem)
        return deployments.create(app, target, chosen), "created"
    if slug and slug != hosted.slug:
        raise DeployRefused(
            f"{app.name} is already at {deployment_path(hosted.slug)}; "
            "take it down in the Studio to move it."
        )
    if hosted.version == target and hosted.state == "live":
        return hosted, "unchanged"
    done = "moved" if hosted.version != target else "resumed"
    return deployments.update(replace(hosted, version=target, state="live")), done


# --- a session of a deployment, woken by its trigger (LOOP R-14) ----------------


@dataclass(frozen=True)
class ScheduleTrigger:
    """One of an application's schedules: where it sits among its triggers,
    when it fires, and what its agent is asked then.
    """

    position: int
    cron: str
    prompt: str
    description: str = ""


def schedule_triggers(spec: Mapping[str, Any]) -> list[ScheduleTrigger]:
    """The schedules an Appspec declares, each known by its position among
    the application's triggers: a trigger has no name of its own, and the
    position is what the scheduler keeps it under.

    What the agent is asked is the trigger's ``prompt``, or its
    ``description`` when it has no prompt; a schedule with neither is
    refused, since a session woken with nothing to do does nothing.
    """
    found: list[ScheduleTrigger] = []
    for position, trigger in enumerate(spec.get("triggers") or []):
        if not isinstance(trigger, Mapping) or trigger.get("type") != "schedule":
            continue
        cron = str(trigger.get("cron") or "").strip()
        description = str(trigger.get("description") or "").strip()
        prompt = str(trigger.get("prompt") or "").strip() or description
        if not cron:
            raise DeployRefused(
                f"The schedule at trigger {position} says no time: its cron is empty."
            )
        if not prompt:
            raise DeployRefused(
                f"The schedule at trigger {position} ({cron}) asks its agent nothing: give it a prompt."
            )
        found.append(ScheduleTrigger(position, cron, prompt, description))
    return found


def session_payload(
    spec: Mapping[str, Any],
    *,
    app_uid: str,
    deployment_uid: str,
    version: int,
    woken_by: Mapping[str, Any],
) -> dict[str, Any]:
    """What creates a deployment's agent on a runtime for a session nobody
    opened: the payload the hosted page sends (`AppRenderer`), on Vercel AI
    since the session is one prompt, with the instance its record is kept
    under — the deployment, and what woke it.

    `AppNotRunnable` when the runtime's own loader refuses the Appspec;
    `DeployRefused` for an application run by a team, which a woken session
    does not run yet.
    """
    from agent_runtimes.loop.apps.loading import agent_id_of, load_app

    app = load_app(spec)
    if not app.agent:
        raise DeployRefused(
            f"{app.name or app.id} is run by a team, which a woken session does not run yet."
        )
    return {
        "name": app.id,
        "description": f"{app.name or app.id}, version {version}, woken by its {woken_by.get('kind') or 'trigger'}",
        "transport": "vercel-ai",
        "agent_spec_id": agent_id_of(app),
        "app_spec": dict(spec),
        "enable_codemode": bool(app.permissions.computer.shell),
        **({"model": app.model} if app.model else {}),
        "app_instance": {
            "app_uid": app_uid,
            "deployment_uid": deployment_uid,
            "version": int(version),
            "woken_by": dict(woken_by),
        },
    }


def kept_payload(
    spec: Mapping[str, Any],
    *,
    app_uid: str,
    deployment_uid: str,
    version: int,
    organization_uid: str = "",
) -> dict[str, Any]:
    """What creates a deployment's agent on the runtime it is kept on
    (LOOP R-33): the payload the hosted page sends (`AppRenderer`'s
    `appDatalayerCreatePayload`) — under the application's id, over AG-UI,
    with its Appspec and the deployment as its instance — so that the page's
    chat finds the agent it would have made, already there.

    `AppNotRunnable` when the runtime's own loader refuses the Appspec;
    `DeployRefused` for an application run by a team, which is not kept yet.
    """
    from agent_runtimes.loop.apps.loading import agent_id_of, load_app

    app = load_app(spec)
    if not app.agent:
        raise DeployRefused(
            f"{app.name or app.id} is run by a team, which is not kept on a runtime yet."
        )
    return {
        "name": app.id,
        "description": f"{app.name or app.id}, version {version}, kept on its runtime",
        "transport": "ag-ui",
        "agent_spec_id": agent_id_of(app),
        "app_spec": dict(spec),
        "enable_codemode": bool(app.permissions.computer.shell),
        **({"model": app.model} if app.model else {}),
        "app_instance": {
            "app_uid": app_uid,
            "deployment_uid": deployment_uid,
            "version": int(version),
            **({"organization_uid": organization_uid} if organization_uid else {}),
        },
    }


class SessionNotStarted(RuntimeError):
    """Why a woken session could not start on its runtime, in a sentence."""


def create_agent(
    *,
    ingress: str,
    token: str,
    payload: Mapping[str, Any],
    attempts: int = 12,
    wait_seconds: float = 5.0,
    client: Optional[httpx.Client] = None,
) -> str:
    """Create a deployment's agent on a runtime that was just launched
    (`/api/v1/agents`); its id.

    The runtime may not answer yet when it has just been launched: creating
    the agent is tried again for ``attempts`` times, ``wait_seconds`` apart.
    An agent already there (409) is the one kept. `SessionNotStarted` when
    the agent could not be created — the runtime never answered, or refused
    the application.
    """
    import time

    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

    base = build_agent_runtimes_base_url(ingress).rstrip("/")
    if not base:
        raise SessionNotStarted("The runtime has no address to reach it at.")
    http = client or httpx.Client(timeout=60.0)
    fallback = str(payload.get("name") or "").lower().replace(" ", "-")
    last = ""
    try:
        for attempt in range(max(1, attempts)):
            try:
                response = http.post(
                    f"{base}/api/v1/agents",
                    json=dict(payload),
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as error:
                last = f"the runtime did not answer: {error}"
            else:
                if response.status_code == 409:
                    return fallback
                if response.status_code in (400, 422):
                    raise SessionNotStarted(
                        f"The runtime refused the application: {response.text[:500]}"
                    )
                if response.status_code < 300:
                    created = response.json() if response.content else {}
                    return str((created or {}).get("id") or fallback)
                last = f"the runtime answered {response.status_code}: {response.text[:200]}"
            if attempt + 1 < attempts:
                time.sleep(wait_seconds)
    finally:
        if client is None:
            http.close()
    raise SessionNotStarted(f"The application's agent could not be created: {last}.")


def start_session(
    *,
    ingress: str,
    token: str,
    payload: Mapping[str, Any],
    prompt: str,
    timeout: int = 300,
    attempts: int = 12,
    wait_seconds: float = 5.0,
    client: Optional[httpx.Client] = None,
) -> dict[str, Any]:
    """Create the deployment's agent on a runtime that was just launched
    (`create_agent`), then ask it the trigger's prompt — the routes the
    hosted page and the Evals engine use (`/api/v1/agents`, then
    `/api/v1/vercel-ai/<agent>`).

    Answers the agent's id and the chat's result (``status`` ``completed`` or
    not, the answer's text, and why it failed when it did);
    `SessionNotStarted` when the agent could not be created.
    """
    from agent_runtimes.client.agent_client import run_cloud_agent_chat

    agent_id = create_agent(
        ingress=ingress,
        token=token,
        payload=payload,
        attempts=attempts,
        wait_seconds=wait_seconds,
        client=client,
    )
    result = run_cloud_agent_chat(
        ingress=ingress,
        token=token,
        prompt=prompt,
        route_candidates=[agent_id],
        timeout=timeout,
    )
    return {"agent_id": agent_id, "result": result}
