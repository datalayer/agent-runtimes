# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Deployments, from the terminal (LOOP S-06).

The same deployments the Studio's Ship tab keeps: a Spacer item of type
`appdeployment` beside the application's `app` item, whose content points at
one version. Deploying moves the pointer; a hosted deployment has its address
on the main site, `/apps/<slug>`. What the Studio writes, this reads, and the
other way round — the format is `loop.deployment/v1`.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

import httpx

DEPLOYMENT_ITEM_TYPE = "appdeployment"
DEPLOYMENT_FORMAT = "loop.deployment/v1"
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

    def content(self) -> str:
        return json.dumps(
            {
                "format": DEPLOYMENT_FORMAT,
                "app": self.app_uid,
                "version": self.version,
                "target": self.target,
                "state": self.state,
                "slug": self.slug,
                "updatedAt": self.updated_at,
            }
        )


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
    if not slug:
        return "Choose the address it is reached at."
    if not SLUG.match(slug):
        return "An address is lower-case letters, digits and hyphens, at most 64."
    if any(d.slug == slug and d.uid != own for d in taken):
        return f"“{slug}” is already the address of another of your applications."
    return ""


def parse_deployment(
    uid: str, content: Any, updated_at: str = ""
) -> Optional[Deployment]:
    raw = content
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return None
    if not isinstance(raw, dict):
        return None
    if raw.get("format") != DEPLOYMENT_FORMAT or not isinstance(raw.get("app"), str):
        return None
    try:
        version = int(raw.get("version") or 1)
    except (TypeError, ValueError):
        version = 1
    slug = raw.get("slug")
    stamped = raw.get("updatedAt")
    return Deployment(
        uid=uid,
        app_uid=raw["app"],
        version=max(1, version),
        target="embedded" if raw.get("target") == "embedded" else "hosted",
        state="paused" if raw.get("state") == "paused" else "live",
        slug=slug if isinstance(slug, str) else "",
        updated_at=stamped if isinstance(stamped, str) else updated_at,
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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Deployments:
    """The caller's deployments, on the Spacer."""

    def __init__(
        self, spacer_url: str, token: str, client: Optional[httpx.Client] = None
    ):
        self.base = f"{spacer_url.rstrip('/')}/api/spacer/v1"
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
            raise DeployRefused(
                f"{failure}: {body.get('message') or response.status_code}"
            )
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

    def get(self, uid: str) -> Optional[Deployment]:
        body = self._answer(
            self.http.get(f"{self.base}/lexicals/{quote(uid, safe='')}"),
            "The deployment could not be read",
        )
        document = body.get("document") or {}
        return parse_deployment(
            uid,
            document.get("model_s", document.get("content")),
            str(document.get("last_update_ts_dt") or ""),
        )

    def list(self, app_uid: str = "") -> list[Deployment]:
        body = self._answer(
            self.http.get(f"{self.base}/spaces/items/types/{DEPLOYMENT_ITEM_TYPE}"),
            "The deployments could not be listed",
        )
        found = []
        for item in body.get("items") or []:
            uid = str(item.get("uid") or "")
            if not uid:
                continue
            try:
                deployment = self.get(uid)
            except DeployRefused:
                continue
            if deployment and (not app_uid or deployment.app_uid == app_uid):
                found.append(deployment)
        return found

    def create(self, app: StoredApp, version: int, slug: str) -> Deployment:
        if not app.space_id:
            raise DeployRefused("The application's space is not known.")
        deployment = Deployment(
            uid="", app_uid=app.uid, version=version, slug=slug, updated_at=_now()
        )
        response = self.http.post(
            f"{self.base}/lexicals",
            data={
                "spaceId": app.space_id,
                "documentType": DEPLOYMENT_ITEM_TYPE,
                "name": f"{app.name} — hosted",
                "description": deployment_path(slug),
                "metadata": json.dumps(
                    {"app": app.uid, "target": "hosted", "slug": slug}
                ),
            },
            files={
                "file": ("deployment.json", deployment.content(), "application/json")
            },
        )
        body = self._answer(response, "The application could not be deployed")
        return replace(
            deployment, uid=str((body.get("document") or {}).get("uid") or "")
        )

    def update(self, deployment: Deployment) -> Deployment:
        changed = replace(deployment, updated_at=_now())
        self._answer(
            self.http.put(
                f"{self.base}/lexicals/{quote(deployment.uid, safe='')}/model",
                json={"model": changed.content()},
            ),
            "The deployment could not be changed",
        )
        return changed


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
