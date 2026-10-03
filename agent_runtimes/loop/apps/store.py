# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's file, between the Studio and a repository (LOOP S-04).

`pull` writes the Appspec the Studio keeps — the text its builder wrote,
comments included (F-09) — and `push` saves a file back the way the Studio's
own save does: the version left behind is kept as an `appversion` item, and a
changed specification is the next version; the same one is not.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import quote

import yaml

from agent_runtimes.loop.apps.deployments import (
    APP_ITEM_TYPE,
    Deployments,
    DeployRefused,
    version_of_model,
)

APP_ITEM_FORMAT = "loop.app.item/v1"
APP_VERSION_ITEM_TYPE = "appversion"


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


@dataclass(frozen=True)
class AppItem:
    uid: str
    name: str
    description: str
    space_id: str
    #: The item's content, as the Studio wrote it.
    model: dict[str, Any]

    @property
    def version(self) -> int:
        return version_of_model(self.model)


class AppStore(Deployments):
    """The caller's applications, on the Spacer."""

    def item(self, uid: str) -> AppItem:
        body = self._answer(
            self.http.get(f"{self.base}/lexicals/{quote(uid, safe='')}"),
            "The application could not be read",
        )
        document = body.get("document") or {}
        if document.get("type_s") != APP_ITEM_TYPE:
            raise DeployRefused(f"{uid} is not an application.")
        try:
            metadata = json.loads(document.get("metadata_s") or "{}")
            model = json.loads(document.get("model_s") or "{}")
        except ValueError:
            raise DeployRefused(f"{uid} holds no application the CLI can read.")
        return AppItem(
            uid=uid,
            name=document.get("name_t") or "App",
            description=document.get("description_t") or "",
            space_id=metadata.get("space", "") if isinstance(metadata, dict) else "",
            model=model if isinstance(model, dict) else {},
        )

    def keep_version(self, app: AppItem) -> None:
        """The version being left behind, kept as it was."""
        if not app.space_id:
            raise DeployRefused("The application's space is not known.")
        self._answer(
            self.http.post(
                f"{self.base}/lexicals",
                data={
                    "spaceId": app.space_id,
                    "documentType": APP_VERSION_ITEM_TYPE,
                    "name": f"{app.name} v{app.version}",
                    "description": app.description,
                    "metadata": json.dumps({"app": app.uid, "version": app.version}),
                },
                files={
                    "file": (
                        "app-version.json",
                        json.dumps(app.model),
                        "application/json",
                    )
                },
            ),
            "The version could not be kept",
        )

    def save(self, uid: str, model: dict[str, Any]) -> None:
        self._answer(
            self.http.put(
                f"{self.base}/lexicals/{quote(uid, safe='')}/model",
                json={"model": json.dumps(model)},
            ),
            "The application could not be saved",
        )

    def rename(self, uid: str, name: str, description: str) -> None:
        self._answer(
            self.http.put(
                f"{self.base}/lexicals/{quote(uid, safe='')}",
                json={"name": name, "description": description},
            ),
            "The application could not be renamed",
        )


def pull(store: AppStore, uid: str) -> tuple[str, int]:
    """The application's Appspec as its file, and the version it is."""
    app = store.item(uid)
    if app.model.get("format") != APP_ITEM_FORMAT or not isinstance(
        app.model.get("spec"), dict
    ):
        raise DeployRefused(
            f"{app.name} is kept in an older form: open it in the Studio and save it once."
        )
    source = app.model.get("source")
    if isinstance(source, str) and source.strip():
        return source if source.endswith("\n") else source + "\n", app.version
    return yaml.safe_dump(
        app.model["spec"], sort_keys=False, allow_unicode=True
    ), app.version


def push(
    store: AppStore, uid: str, text: str, spec: Optional[dict[str, Any]] = None
) -> tuple[int, str]:
    """Save a file as the application. Returns its version and what was done:
    ``saved`` (the next version), ``rewritten`` (the same specification,
    written differently) or ``unchanged``.
    """
    if spec is None:
        loaded = yaml.safe_load(text)
        if not isinstance(loaded, dict):
            raise DeployRefused("The file is not an application.")
        spec = loaded
    app = store.item(uid)
    if app.model.get("format") != APP_ITEM_FORMAT:
        raise DeployRefused(
            f"{app.name} is kept in an older form: open it in the Studio and save it once."
        )
    same = _canonical(spec) == _canonical(app.model.get("spec"))
    if same and app.model.get("source") == text:
        return app.version, "unchanged"
    state = dict(app.model.get("state") or {})
    if not same:
        store.keep_version(app)
        state["revision"] = app.version + 1
    store.save(
        uid,
        {"format": APP_ITEM_FORMAT, "spec": spec, "state": state, "source": text},
    )
    name = spec.get("name")
    if isinstance(name, str) and name.strip() and name.strip() != app.name:
        store.rename(uid, name.strip(), app.description)
    return int(state.get("revision") or app.version), "rewritten" if same else "saved"
