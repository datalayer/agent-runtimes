# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene and its stage written in Python (LOOP P-30): ``loop.scene`` and
``loop.stage`` write the scene spec agentspecs reads — refused in agentspecs'
sentences — ``loop scenes rehearse scene.py`` plays it, ``loop scenes build``
writes the YAML the Studio's spec editor reads, and ``loop scenes push`` keeps
it in the person's Space as the Studio keeps a scene.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path
from typing import Any, Dict, List

import httpx
import pytest
import yaml
from typer.testing import CliRunner

scenes = pytest.importorskip("agentspecs.scenes")

from agent_runtimes import loop  # noqa: E402
from agent_runtimes.commands import scenes as scenes_command  # noqa: E402
from agent_runtimes.loop.scenes.store import STUDIO_KEYS, SceneStore  # noqa: E402
from agent_runtimes.loop.scenes.written import (  # noqa: E402
    SceneNotPlayable,
    load_scene_file,
)
from agent_runtimes.tests.test_scenes_rehearse import (  # noqa: E402
    _here,
    _no_platform,  # noqa: F401 - the fixture
    cast,
)

runner = CliRunner()

#: Sales & Accounting's first beat, written in Python over the catalogue's team.
SCENE_PY = textwrap.dedent(
    """
    from agent_runtimes import loop

    scene = loop.scene(
        "books-in-python",
        "Books, in Python",
        emoji="📗",
        description="Sales asks Accounting for the open invoices.",
        team="sales-and-accounting:0.0.1",
    )
    scene.player("sales", name="Sales", line="I take your request.")
    scene.player("accounting", name="Accounting", line="I read the books.")
    scene.system("odoo-accounting:0.0.1", shown_as="Odoo", holds="The books, read only.")
    scene.setting(language="en", assumes="Two agents over A2A.")

    beat = scene.beat(
        "open-invoices",
        say="Which customer invoices are still open?",
        expect="A table of the open invoices.",
        shows=["table"],
    )
    beat.asks("sales", "accounting", what="the open invoices")
    beat.asks("accounting", "odoo", tool="odoo_accounting_list_invoices", does="read")
    beat.answers("accounting", "table", what="the open invoices")
    beat.answers("sales", "words")
    beat.rehearse(
        "You → Sales",
        "Sales → Accounting",
        "Accounting → Odoo: odoo_accounting_list_invoices",
        "Accounting: a table",
        "Sales: words",
        must_say=["invoice"],
        within="120s",
    )

    loop.stage(
        scene,
        positions={"sales": (0.25, 0.5), "accounting": (0.75, 0.5)},
        opens_first="sales",
        inspectors=["agent", "a2a"],
        audience="nobody",
    )
    """
)


@pytest.fixture()
def scene_py(tmp_path: Path) -> Path:
    path = tmp_path / "scene.py"
    path.write_text(SCENE_PY)
    return path


def test_loop_writes_the_scene_spec_agentspecs_reads(scene_py: Path) -> None:
    written = load_scene_file(scene_py)
    spec = written.spec
    assert isinstance(spec, scenes.SceneSpec)
    assert spec.schema_ == "loop.scene/v1"
    assert (spec.id, spec.name, spec.emoji, spec.team) == (
        "books-in-python",
        "Books, in Python",
        "📗",
        "sales-and-accounting:0.0.1",
    )
    # The cast is the team's, its personas the scene's.
    assert [member.persona.name for member in spec.cast_of()] == ["Sales", "Accounting"]
    # `over` was said for the developer: a player over a2a, a system over mcp.
    [beat] = spec.script
    assert [
        (move.who, move.asks, move.over and move.over.value) for move in beat.moves
    ] == [
        ("sales", "accounting", "a2a"),
        ("accounting", "odoo", "mcp"),
        ("accounting", "", None),
        ("sales", "", None),
    ]
    # The stage is the scene's own parts, not a spec apart.
    assert spec.stage.positions["accounting"].x == 0.75
    assert spec.stage.opens_first == "sales"
    assert spec.audience.who.value == "nobody"
    assert scenes.scene_problems(spec) == []


def test_the_yaml_it_builds_is_read_back_as_the_same_scene(
    scene_py: Path, tmp_path: Path
) -> None:
    out = tmp_path / "scene.yaml"
    result = runner.invoke(
        scenes_command.app, ["build", str(scene_py), "--out", str(out)]
    )
    assert result.exit_code == 0, result.output
    assert "Books, in Python written to" in result.output
    text = out.read_text()
    assert text.startswith(
        "# Built from scene.py by `loop scenes build`: the file is the source; edit it there.\n"
        "schema: loop.scene/v1\n"
    )
    # agentspecs reads the file as the scene the Python wrote, field for field.
    assert scenes.load_scene(out) == load_scene_file(scene_py).spec
    assert yaml.safe_load(text) == scenes.dump_scene(load_scene_file(scene_py).spec)
    # Printed when no file is said, and never written over without --force.
    assert runner.invoke(scenes_command.app, ["build", str(scene_py)]).output == text
    again = runner.invoke(
        scenes_command.app, ["build", str(scene_py), "--out", str(out)]
    )
    assert again.exit_code == 1
    assert "is there already; --force overwrites it." in again.output


def test_what_agentspecs_refuses_is_said_in_its_sentences(tmp_path: Path) -> None:
    scene = loop.scene("probe", "Probe", team="sales-and-accounting:0.0.1")
    scene.beat("one", say="Hello", expect="Something.").answers("accounting", "words")
    loop.stage(scene, positions={"sales": (5, 0.5)})
    with pytest.raises(SceneNotPlayable) as refused:
        scene.spec
    assert refused.value.problems == [
        "probe: stage.positions.sales.x: Input should be less than or equal to 1"
    ]
    # A shape agentspecs takes, and a rule it does not.
    scene = loop.scene("probe", "Probe", team="sales-and-accounting:0.0.1")
    scene.beat("one", say="Hello", expect="Something.").answers("accounting", "words")
    with pytest.raises(SceneNotPlayable) as refused:
        scene.spec
    assert refused.value.problems == [
        "Beat 'one': its cue is answered by nobody — no move is the entry's ('sales')."
    ]
    # The stage of a player the scene does not have, before agentspecs is asked.
    with pytest.raises(ValueError, match="has no player 'nobody'"):
        loop.stage(scene, runs_in={"nobody": "browser"})
    # On the command line, the same sentences, and nothing written.
    path = tmp_path / "scene.py"
    path.write_text(
        "from agent_runtimes import loop\n"
        "scene = loop.scene('probe', 'Probe', team='sales-and-accounting:0.0.1')\n"
        "scene.beat('one', say='Hello', expect='Something.').answers('accounting', 'words')\n"
    )
    result = runner.invoke(scenes_command.app, ["build", str(path)])
    assert result.exit_code == 1
    assert (
        "scene.py is not a scene: Beat 'one': its cue is answered by nobody"
        in result.output
    )


def test_an_inline_cast_takes_where_each_player_runs_from_the_stage() -> None:
    scene = loop.scene("desk-and-sales", "Desk & Sales", emoji="🎬", entry="desk")
    scene.player("desk", app="support-desk", role="initiator", talks_to=["sales"])
    scene.player("sales", app="sales")
    beat = scene.beat("pipeline", say="What is a pipeline?", expect="Sales says.")
    beat.asks("desk", "sales", what="a pipeline").answers("desk", "words")
    loop.stage(scene, runs_in={"desk": "browser", "sales": "runtime"})
    spec = scene.spec
    assert {member.member: member.runs_in.value for member in spec.cast} == {
        "desk": "browser",
        "sales": "runtime",
    }
    # On a team, where a player runs is the team's: agentspecs says so.
    staged = loop.scene("probe", "Probe", team="sales-and-accounting:0.0.1")
    staged.player("sales")
    staged.beat("one", say="Hello", expect="Something.").answers("sales", "words")
    loop.stage(staged, runs_in={"sales": "browser"})
    with pytest.raises(SceneNotPlayable) as refused:
        staged.spec
    assert refused.value.problems == [
        "The cast member 'sales' is the team's: it says its persona and its brief, nothing of what it is."
    ]


def test_a_file_that_writes_no_scene_or_two_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "scene.py"
    path.write_text("from agent_runtimes import loop\n")
    result = runner.invoke(scenes_command.app, ["rehearse", str(path)])
    assert result.exit_code == 2
    # Typer draws the refusal in a box: read it as one line.
    said = " ".join(result.output.replace("│", " ").split())
    assert (
        "scene.py does not load: ValueError: scene.py writes 0 scenes; it has to write one."
        in said
    )
    path.write_text(
        "from agent_runtimes import loop\n"
        "one = loop.scene('a', 'A', team='sales-and-accounting')\n"
        "two = loop.scene('b', 'B', team='sales-and-accounting')\n"
    )
    result = runner.invoke(scenes_command.app, ["build", str(path)])
    assert result.exit_code == 1
    assert "scene.py writes 2 scenes; it has to write one." in result.output


def test_rehearse_plays_the_scene_the_python_wrote(
    scene_py: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _here(monkeypatch, cast())
    result = runner.invoke(scenes_command.app, ["rehearse", str(scene_py)])
    assert result.exit_code == 0, result.output
    assert (
        "Books, in Python (books-in-python), rehearsed on this machine" in result.output
    )
    assert "✓ open-invoices: passed" in result.output
    assert "Accounting → Odoo: odoo_accounting_list_invoices" in result.output
    assert "Rehearsal: 1 of 1 beats passed. The scene is Live." in result.output


class _Spacer:
    """The Spacer's lexicals, as the Studio's scenes API reaches them."""

    def __init__(self) -> None:
        self.items: Dict[str, Dict[str, Any]] = {}
        self.requests: List[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(f"{request.method} {request.url.path}")
        path = request.url.path.removeprefix("/api/spacer/v1")
        if request.method == "POST" and path == "/lexicals":
            fields = dict(
                part.split(b"\r\n\r\n", 1)
                for part in request.content.split(
                    b"--"
                    + request.headers["content-type"].split("boundary=")[1].encode()
                )
                if b"\r\n\r\n" in part
            )
            said = {
                key.split(b'name="')[1].split(b'"')[0].decode(): value.rstrip(
                    b"\r\n"
                ).decode()
                for key, value in fields.items()
            }
            uid = f"scene-{len(self.items) + 1}"
            self.items[uid] = {
                "uid": uid,
                "type_s": said["documentType"],
                "name_t": said["name"],
                "description_t": said["description"],
                "metadata_s": said["metadata"],
                "model_s": said["file"],
            }
            return httpx.Response(
                200, json={"success": True, "document": self.items[uid]}
            )
        uid = path.split("/")[2]
        if request.method == "GET":
            return httpx.Response(
                200, json={"success": True, "document": self.items[uid]}
            )
        body = json.loads(request.content)
        if path.endswith("/model"):
            self.items[uid]["model_s"] = body["model"]
        else:
            self.items[uid]["name_t"] = body["name"]
            self.items[uid]["description_t"] = body["description"]
        return httpx.Response(200, json={"success": True})


def test_the_studio_keys_are_the_studios_own() -> None:
    """The map is `TEXT_KEYS` in the Studio's reader, key for key."""
    source = (
        Path(__file__).resolve().parents[2] / "src" / "apps" / "apps" / "sceneYaml.ts"
    ).read_text()
    block = source[source.index("export const TEXT_KEYS") :]
    block = block[: block.index("};")]
    for text, studio in STUDIO_KEYS.items():
        assert f"{text}: '{studio}'" in block
    assert block.count(": '") == len(STUDIO_KEYS)


def test_push_keeps_it_as_the_studio_keeps_a_scene(scene_py: Path) -> None:
    spacer = _Spacer()
    store = SceneStore(
        "https://spacer.test",
        "token",
        client=httpx.Client(transport=httpx.MockTransport(spacer.handle)),
    )
    document = scenes.dump_scene(load_scene_file(scene_py).spec)
    uid = store.create_scene("space-1", document)
    item = spacer.items[uid]
    # What `scenesApi.ts` lists and reads: a `scene` item, its emoji and space beside it,
    # its content the format and the spec (`sceneOfStored`).
    assert item["type_s"] == "scene"
    assert (item["name_t"], item["description_t"]) == (
        "Books, in Python",
        "Sales asks Accounting for the open invoices.",
    )
    assert json.loads(item["metadata_s"]) == {
        "schema": "loop.scene.item/v1",
        "space": "space-1",
        "emoji": "📗",
    }
    stored = json.loads(item["model_s"])
    assert stored["format"] == "loop.scene.item/v1"
    # Spelled as the Studio's item is (`sceneOfStored` reads it as it is):
    # a link kept as `talks_to` was read in the Studio as none (2026-10-10).
    inline = loop.scene("desk-and-sales", "Desk & Sales", emoji="🎬", entry="desk")
    inline.player("desk", app="support-desk", role="initiator", talks_to=["sales"])
    inline.player("sales", app="sales")
    inline.beat("pipeline", say="What is a pipeline?", expect="Sales says.").asks(
        "desk", "sales", what="a pipeline"
    ).answers("desk", "words")
    loop.stage(inline, runs_in={"desk": "browser", "sales": "runtime"})
    written = scenes.dump_scene(inline.spec)
    spec = json.loads(spacer.items[store.create_scene("space-1", written)]["model_s"])["spec"]
    assert spec["cast"][0]["talksTo"] == written["cast"][0]["talks_to"]
    assert [member["runsIn"] for member in spec["cast"]] == ["browser", "runtime"]
    assert not set(STUDIO_KEYS) & set(json.dumps(spec).replace('"', " ").split())
    # Saved again: the same is unchanged, a change is saved and renamed.
    assert store.save(uid, document) == "unchanged"
    changed = {**document, "name": "Books, renamed"}
    assert store.save(uid, changed) == "saved"
    assert spacer.items[uid]["name_t"] == "Books, renamed"
    assert json.loads(spacer.items[uid]["model_s"])["spec"]["name"] == "Books, renamed"


def test_push_says_where_it_goes(scene_py: Path) -> None:
    result = runner.invoke(scenes_command.app, ["push", str(scene_py)])
    assert result.exit_code == 1
    assert "Say where it goes: --scene <uid>" in result.output


#: The example a developer starts from, and the YAML the Studio's reader is held to.
EXAMPLE = Path(__file__).parents[2] / "examples" / "scene-in-python" / "scene.py"
FIXTURE = (
    Path(__file__).parents[2]
    / "src"
    / "apps"
    / "__tests__"
    / "fixtures"
    / "sceneWrittenInPython.yaml"
)


def test_the_example_builds_the_yaml_the_studio_s_reader_is_held_to() -> None:
    """`scene-written-in-python.test.ts` reads this YAML as the Studio does: it
    has to be what `loop scenes build` writes of the example, today."""
    assert load_scene_file(EXAMPLE).yaml(EXAMPLE.name) == FIXTURE.read_text(), (
        "Write it again: loop scenes build examples/scene-in-python/scene.py "
        "--out src/apps/__tests__/fixtures/sceneWrittenInPython.yaml --force"
    )
