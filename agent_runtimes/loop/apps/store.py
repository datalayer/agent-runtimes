# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's file, between the Studio and a repository (LOOP S-04).

`pull` writes the Appspec the Studio keeps — the text its builder wrote,
comments included (F-09) — and `push` saves a file back the way the Studio's
own save does: the version left behind is kept as an `appversion` item, and a
changed specification is the next version; the same one is not.

An application written in Python keeps its ``app.py`` in its item, beside
the Appspec it builds (LOOP P-10, decided 2026-10-06): ``code`` —
``{"file": "app.py", "text": ...}`` — saved by ``push`` of the file,
versioned with the spec (a changed file is the next version, and the one
left behind keeps its own), written back by ``pull``, and read by the
Studio, whose Canvas links to its lines.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import quote

import yaml

from agent_runtimes.loop.apps.deployments import (
    APP_ITEM_FORMAT,
    APP_ITEM_TYPE,
    Deployments,
    DeployRefused,
    version_of_model,
)

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


def code_of(model: dict[str, Any]) -> Optional[dict[str, str]]:
    """The ``app.py`` an application's item keeps, ``{file, text}``, or None."""
    code = model.get("code")
    if (
        isinstance(code, dict)
        and isinstance(code.get("file"), str)
        and isinstance(code.get("text"), str)
        and code["text"].strip()
    ):
        return {"file": code["file"], "text": code["text"]}
    return None


def pull(store: AppStore, uid: str) -> tuple[str, int, Optional[dict[str, str]]]:
    """The application's Appspec as its file, the version it is, and its
    ``app.py`` when it is written in Python (``{file, text}``).
    """
    app = store.item(uid)
    if app.model.get("format") != APP_ITEM_FORMAT or not isinstance(
        app.model.get("spec"), dict
    ):
        raise DeployRefused(
            f"{app.name} is kept in an older form: open it in the Studio and save it once."
        )
    code = code_of(app.model)
    source = app.model.get("source")
    if isinstance(source, str) and source.strip():
        return source if source.endswith("\n") else source + "\n", app.version, code
    return (
        yaml.safe_dump(app.model["spec"], sort_keys=False, allow_unicode=True),
        app.version,
        code,
    )


def push(
    store: AppStore,
    uid: str,
    text: str,
    spec: Optional[dict[str, Any]] = None,
    code: Optional[dict[str, str]] = None,
) -> tuple[int, str]:
    """Save a file as the application. Returns its version and what was done:
    ``saved`` (the next version), ``rewritten`` (the same specification,
    written differently) or ``unchanged``.

    ``code`` is the ``app.py`` the text was built from, ``{file, text}``:
    kept beside it, and a changed file is the next version too. An
    application kept with its code is refused a spec without one: its code
    is pushed, not the spec it builds.
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
    kept_code = code_of(app.model)
    if kept_code is not None and code is None:
        raise DeployRefused(
            f"{app.name} is written in Python: push its {kept_code['file']}, "
            "which builds this spec."
        )
    same = _canonical(spec) == _canonical(app.model.get("spec")) and code == kept_code
    if same and app.model.get("source") == text:
        return app.version, "unchanged"
    state = dict(app.model.get("state") or {})
    if not same:
        store.keep_version(app)
        state["revision"] = app.version + 1
    store.save(
        uid,
        {
            "format": APP_ITEM_FORMAT,
            "spec": spec,
            "state": state,
            "source": text,
            **({"code": code} if code is not None else {}),
        },
    )
    name = spec.get("name")
    if isinstance(name, str) and name.strip() and name.strip() != app.name:
        store.rename(uid, name.strip(), app.description)
    return int(state.get("revision") or app.version), "rewritten" if same else "saved"
