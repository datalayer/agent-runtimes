# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Scenes: the catalogue generated from agentspecs 0.0.61 (A-12).

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

#: The four scenes of the home page (A-08): the entry, the members on a runtime.
HOME_SCENES = {
    "sales-and-accounting": ("sales", ["accounting"]),
    "month-end-close": ("month-end-close", ["month-end-close"]),
    "crop-monitoring": ("crop-monitoring", ["crop-monitoring"]),
    "disaster-assessment": (
        "event-response",
        ["disaster-assessment", "change-detection"],
    ),
}


#: The demo stages: the home page's four, and a coding agent behind the Shield.
DEMO_SCENES = (*HOME_SCENES, "coding-agent-behind-the-shield")

#: The Personal Agent Protocol's Stages, scripted (X-02).
PAP_STAGES = (
    "pap-a-person-and-a-company",
    "pap-approve-once",
    "pap-your-application-a-company",
    "pap-two-companies",
)
#: The other protocols' Stages, scripted (EX-14, EX-15).
PROTOCOL_STAGES = ("ucp-a-purchase-approved", "pact-a-personal-agent-at-a-business")


def test_the_catalogue_holds_the_four_scenes_with_their_faces() -> None:
    assert set(SCENE_CATALOGUE) == set(DEMO_SCENES) | set(PAP_STAGES) | set(
        PROTOCOL_STAGES
    )
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


def test_the_pap_stages_arrive_scripted_with_their_actors_and_lines() -> None:
    for scene_id in PAP_STAGES:
        scene = SCENE_CATALOGUE[scene_id]
        assert scene.kind == "scripted" and not scene.team and not scene.cast, scene_id
        assert scene.actors and scene.lines and scene.live, scene_id
        ids = {actor.id for actor in scene.actors}
        assert all(line.from_ in ids for line in scene.lines), scene_id
        assert any(line.turn for line in scene.lines), scene_id


def test_each_beat_says_its_cue_its_moves_and_what_it_shows() -> None:
    for scene in (scene for scene in SCENE_CATALOGUE.values() if scene.kind == "team"):
        # The home page's scenes play four beats; the coding agent two.
        assert len(scene.script) == (4 if scene.id in HOME_SCENES else 2), scene.id
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


def test_the_demo_stages_say_the_hero_backdrop_and_the_others_the_studio() -> None:
    for scene in SCENE_CATALOGUE.values():
        wanted = "hero" if scene.id in DEMO_SCENES else "studio"
        assert scene.stage.backdrop == wanted, scene.id


def test_what_a_scene_needs_arrives_as_setup() -> None:
    assert SCENE_CATALOGUE["crop-monitoring"].setup == [
        "The agent 'worker-crop-monitoring:0.0.1' is not enabled.",
    ]
    assert (
        "The MCP server 'odoo-accounting:0.0.1' is not enabled."
        in SCENE_CATALOGUE["sales-and-accounting"].setup
    )
