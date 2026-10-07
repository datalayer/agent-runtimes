# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Scenes: the catalogue generated from agentspecs 0.0.61 (LOOP A-12).

A scene stages a team; the generated catalogue carries it with its cast
resolved, its entry said, what each beat shows, and what it needs set up.
"""

from agent_runtimes.specs.scenes import (
    SCENE_CATALOGUE,
    get_scene_spec,
    list_scene_specs,
    scenes_staging,
)
from agent_runtimes.specs.teams import get_team_spec
from agent_runtimes.types import SceneSpec

#: The four scenes of the home page (LOOP A-08): the entry, the members on a runtime.
HOME_SCENES = {
    "sales-and-accounting": ("sales", ["accounting"]),
    "month-end-close": ("month-end-close", ["month-end-close"]),
    "crop-monitoring": ("crop-monitoring", ["crop-monitoring"]),
    "disaster-assessment": (
        "event-response",
        ["disaster-assessment", "change-detection"],
    ),
}


def test_the_catalogue_holds_the_four_scenes_with_their_faces() -> None:
    assert set(SCENE_CATALOGUE) == set(HOME_SCENES)
    faces = [scene.emoji for scene in SCENE_CATALOGUE.values()]
    assert len(set(faces)) == len(faces) and "👀" not in faces
    for scene in SCENE_CATALOGUE.values():
        assert isinstance(scene, SceneSpec) and scene.schema_ == "loop.scene/v1"
        assert scene.name and scene.description and scene.icon
        assert scene.emoji not in {member.persona.face for member in scene.cast}


def test_a_scene_is_found_by_id_or_reference() -> None:
    assert get_scene_spec("month-end-close:0.0.1") is SCENE_CATALOGUE["month-end-close"]
    assert get_scene_spec("nope") is None
    assert [scene.id for scene in list_scene_specs("odoo")] == [
        "month-end-close",
        "sales-and-accounting",
    ]
    assert [scene.id for scene in scenes_staging("disaster-assessment:0.0.1")] == [
        "disaster-assessment"
    ]


def test_the_cast_arrives_resolved_from_the_team() -> None:
    for scene_id, (entry, on_runtime) in HOME_SCENES.items():
        scene = SCENE_CATALOGUE[scene_id]
        team = get_team_spec(scene.team)
        assert team is not None and scene.entry == entry, scene_id
        assert [member.member for member in scene.cast] == [
            agent.id for agent in team.agents
        ]
        for member in scene.cast:
            assert member.app and member.persona.name and member.persona.face, (
                scene_id,
                member.member,
            )
            assert member.runs_in in ("browser", "runtime") and member.brief, scene_id
        assert list(scene.deployment.addresses) == on_runtime, scene_id
        assert all(
            variable.endswith("_A2A_URL")
            for variable in scene.deployment.addresses.values()
        )


def test_each_beat_says_its_cue_its_moves_and_what_it_shows() -> None:
    for scene in SCENE_CATALOGUE.values():
        assert len(scene.script) == 3, scene.id
        for beat in scene.script:
            assert beat.cue.say and beat.moves and beat.expect and beat.shows, (
                scene.id,
                beat.id,
            )
            assert any(move.who == scene.entry and not move.asks for move in beat.moves)
        assert [item.beat for item in scene.rehearsal.beats] == [
            beat.id for beat in scene.script
        ]
        assert (
            scene.audience.who == "visitors" and scene.stage.opens_first == scene.entry
        )


def test_what_a_scene_needs_arrives_as_setup() -> None:
    assert SCENE_CATALOGUE["crop-monitoring"].setup == [
        "The agent 'worker-crop-monitoring:0.0.1' is not enabled.",
    ]
    assert (
        "The MCP server 'odoo-accounting:0.0.1' is not enabled."
        in SCENE_CATALOGUE["sales-and-accounting"].setup
    )
