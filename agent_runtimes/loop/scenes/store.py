# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene kept in the person's Space, as the Studio keeps one (LOOP P-30, S-08).

The Studio keeps a scene as an item of type ``scene`` whose content is
``{"format": "loop.scene.item/v1", "spec": <the scene spec>}`` — its name and
description on the item, its space and its emoji beside it
(``views/studio/shell/scenesApi.ts``). ``loop scenes push`` writes the same
item, so what the Studio opens is the scene that was pushed: the spec editor
reads its text, the stage draws its players.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict
from urllib.parse import quote

from agent_runtimes.loop.apps.deployments import Deployments, DeployRefused

#: The item type a scene is kept under (`SCENE_ITEM_TYPE`).
SCENE_ITEM_TYPE = "scene"

#: What a scene's item is written as (`SCENE_ITEM_FORMAT`).
SCENE_ITEM_FORMAT = "loop.scene.item/v1"


@dataclass(frozen=True)
class SceneItem:
    """A scene of the person's, as the Space holds it."""

    uid: str
    name: str
    space_id: str
    #: The item's content, as the Studio wrote it.
    model: Dict[str, Any]


#: The keys agentspecs spells with an underscore, as the Studio's item spells
#: them (`sceneYaml.ts`'s `TEXT_KEYS`): the item holds the Studio's
#: `SceneSpec`, and `sceneOfStored` reads it without respelling, so a
#: `talks_to` kept as written was read as no link at all (seen 2026-10-10).
STUDIO_KEYS: Dict[str, str] = {
    "runs_in": "runsIn",
    "talks_to": "talksTo",
    "opens_first": "opensFirst",
    "rests_after": "restsAfter",
    "ceiling_per_ask": "ceilingPerAsk",
    "asks_a_day": "asksADay",
    "must_say": "mustSay",
    "must_not_say": "mustNotSay",
}


def _respelled(value: Any) -> Any:
    """Every key the map names renamed, deep; a member's id, which it does not name, kept."""
    if isinstance(value, list):
        return [_respelled(item) for item in value]
    if isinstance(value, dict):
        return {STUDIO_KEYS.get(key, key): _respelled(item) for key, item in value.items()}
    return value


def stored(spec: Dict[str, Any]) -> Dict[str, Any]:
    """The content of a scene's item: the format, and the spec as the Studio spells it."""
    if spec.get("schema") != "loop.scene/v1":
        raise DeployRefused(
            "This is not a scene spec: its schema is not loop.scene/v1."
        )
    return {"format": SCENE_ITEM_FORMAT, "spec": _respelled(spec)}


class SceneStore(Deployments):
    """The caller's scenes, on the Spacer."""

    def item(self, uid: str) -> SceneItem:
        """A scene by its uid; refused when the item is not one."""
        body = self._answer(
            self.http.get(f"{self.base}/lexicals/{quote(uid, safe='')}"),
            "The scene could not be read",
        )
        document = body.get("document") or {}
        if document.get("type_s") != SCENE_ITEM_TYPE:
            raise DeployRefused(f"{uid} is not a scene.")
        try:
            metadata = json.loads(document.get("metadata_s") or "{}")
            model = json.loads(document.get("model_s") or "{}")
        except ValueError:
            raise DeployRefused(f"{uid} holds no scene the CLI can read.") from None
        return SceneItem(
            uid=uid,
            name=document.get("name_t") or "Untitled scene",
            space_id=metadata.get("space", "") if isinstance(metadata, dict) else "",
            model=model if isinstance(model, dict) else {},
        )

    def create(self, space_id: str, spec: Dict[str, Any]) -> str:
        """A new scene in a space, as the Studio's *Save scene* makes one; its uid."""
        body = self._answer(
            self.http.post(
                f"{self.base}/lexicals",
                data={
                    "spaceId": space_id,
                    "documentType": SCENE_ITEM_TYPE,
                    "name": str(spec.get("name") or ""),
                    "description": str(spec.get("description") or ""),
                    "metadata": json.dumps(
                        {
                            "schema": SCENE_ITEM_FORMAT,
                            "space": space_id,
                            "emoji": str(spec.get("emoji") or ""),
                        }
                    ),
                },
                files={
                    "file": (
                        "scene.json",
                        json.dumps(stored(spec)),
                        "application/json",
                    )
                },
            ),
            "The scene could not be created",
        )
        document = body.get("document") or {}
        uid = str(document.get("uid") or document.get("id") or "")
        if not uid:
            raise DeployRefused(
                "The scene was created, and the Spacer did not say its uid."
            )
        return uid

    def save(self, uid: str, spec: Dict[str, Any]) -> str:
        """A scene's spec replaced, its name and description with it: ``saved`` or ``unchanged``."""
        item = self.item(uid)
        content = stored(spec)
        if item.model == content:
            return "unchanged"
        self._answer(
            self.http.put(
                f"{self.base}/lexicals/{quote(uid, safe='')}/model",
                json={"model": json.dumps(content)},
            ),
            "The scene could not be saved",
        )
        self._answer(
            self.http.put(
                f"{self.base}/lexicals/{quote(uid, safe='')}",
                json={
                    "name": str(spec.get("name") or ""),
                    "description": str(spec.get("description") or ""),
                },
            ),
            "The scene could not be renamed",
        )
        return "saved"


__all__ = [
    "SCENE_ITEM_FORMAT",
    "SCENE_ITEM_TYPE",
    "SceneItem",
    "SceneStore",
    "stored",
]
