# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Deployments, from the terminal (LOOP S-06).

The same deployments the Studio's Ship tab keeps. An application's
definition is Spacer's — its `app` item, read here for its name, its space
and its latest version; what runs is kept by ai-agents
(`/api/ai-agents/v1/apps/deployments`, LOOP R-11). A deployment points at one
version; deploying moves the pointer; a hosted deployment has its address on
the main site, `/apps/<slug>`.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from typing import Any, Optional
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


def version_of_model(model: Any) -> int:
    """The saved version an app item's content holds, in either format."""
    if isinstance(model, str):
        try:
            model = json.loads(model)
        except ValueError:
            return 1
    if not isinstance(model, dict):
        return 1
    state = model.get("state")
    value: Any = (state if isinstance(state, dict) else {}).get(
        "revision", model.get("version", 1)
    )
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


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
