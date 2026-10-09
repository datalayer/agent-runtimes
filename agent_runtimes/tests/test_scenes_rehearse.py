# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop scenes` (LOOP A-14): a scripted scene — fake members answering fixed
lines over the catalogue's ``sales-and-accounting`` scene spec — rehearsed
to a pass, a fail with what differed, and a *not run* with why; the command's
words and exit codes. No live call: the members are pydantic-ai agents on a
``FunctionModel``.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Callable, Dict, List, Optional

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    FunctionModel,
)
from typer.testing import CliRunner

scenes = pytest.importorskip("agentspecs.scenes")

from agent_runtimes.commands import scenes as scenes_command  # noqa: E402
from agent_runtimes.loop.apps.own import FAILED, NOT_RUN, PASSED  # noqa: E402
from agent_runtimes.loop.scenes.rehearsal import (  # noqa: E402
    RehearsalVerdict,
    answer_differences,
    expected_of,
    rehearse,
    scene_names,
    seconds_of,
    shape_differences,
    time_difference,
    verdict_of,
)
from agent_runtimes.loop.scenes.stage import (  # noqa: E402
    A2AAnswer,
    A2AStep,
    Played,
    Stage,
    StageMember,
    members_of,
    shown_kinds,
)
from agent_runtimes.loop.scenes.transcript import line_text  # noqa: E402

runner = CliRunner()

TABLE = (
    "The open customer invoices:\n\n"
    "| Customer | Invoice | Due |\n|---|---|---|\n| Acme | INV-7 | 1,200 EUR |\n| Globex | INV-9 | 800 EUR |\n\n"
    "Total due: 2,000 EUR."
)


@pytest.fixture(autouse=True)
def _no_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nothing reaches Datalayer or a model: the keys and addresses are unset."""
    for name in list(os.environ):
        if name in ("DATALAYER_API_KEY", "TEST_DATALAYER_API_KEY") or (
            name.startswith("DATALAYER_") and name.endswith("_URL")
        ):
            monkeypatch.delenv(name, raising=False)


@pytest.fixture
def scene() -> Any:
    return scenes.SCENE_CATALOGUE["sales-and-accounting"]


def _prompt_of(messages: List[ModelMessage]) -> str:
    for message in messages:
        for part in getattr(message, "parts", []):
            if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                return part.content
    return ""


def scripted(
    calls: Optional[str], answer: str, *, tools: Optional[Dict[str, str]] = None
) -> Agent:
    """A member that calls one tool (when its agent has it), then answers fixed words.

    ``answer`` may hold ``{result}``, the tool's result. ``tools`` are the
    member's own tools, by name, each answering its text (Accounting's Odoo).
    """

    def model(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        names = [tool.name for tool in info.function_tools]
        returned = [
            part for part in messages[-1].parts if isinstance(part, ToolReturnPart)
        ]
        if returned:
            return ModelResponse(
                parts=[TextPart(answer.format(result=str(returned[-1].content)))]
            )
        if calls and calls in names:
            args = {"request": _prompt_of(messages)} if calls.startswith("ask_") else {}
            return ModelResponse(parts=[ToolCallPart(tool_name=calls, args=args)])
        return ModelResponse(parts=[TextPart(answer.format(result=""))])

    async def stream(messages: List[ModelMessage], info: AgentInfo) -> Any:
        # The host streams a turn: the same words, piece by piece.
        for part in model(messages, info).parts:
            if isinstance(part, ToolCallPart):
                yield {
                    0: DeltaToolCall(
                        name=part.tool_name, json_args=json.dumps(part.args)
                    )
                }
            else:
                yield part.content

    agent = Agent(FunctionModel(model, stream_function=stream))
    for name, text in (tools or {}).items():

        def tool(_text: str = text) -> str:
            return _text

        agent.tool_plain(tool, name=name)
    return agent


def cast(
    *,
    accounting_calls: Optional[str] = "odoo_accounting_list_invoices",
    accounting_says: str = TABLE,
    sales_says: str = "Accounting answered: {result}",
) -> Callable[[Any], Agent]:
    """The scene's members as fake agents, by application id."""

    def factory(spec: Any) -> Agent:
        if spec.id == "accounting":
            return scripted(
                accounting_calls,
                accounting_says,
                tools={accounting_calls: TABLE} if accounting_calls else None,
            )
        return scripted("ask_accounting", sales_says)

    return factory


def stage_of(scene: Any, factory: Callable[[Any], Agent]) -> Stage:
    members, entry = members_of(scene)
    return Stage(members, entry, agent=factory)


# --- the stage --------------------------------------------------------------------------


def test_the_cast_is_read_from_the_scene_spec(scene: Any) -> None:
    members, entry = members_of(scene)
    assert entry == "sales"
    assert [member.id for member in members] == ["sales", "accounting"]
    sales, accounting = members
    assert (sales.name, sales.runs_in, sales.talks_to) == (
        "Sales",
        "browser",
        ("accounting",),
    )
    assert accounting.runs_in == "runtime" and accounting.document["id"] == "accounting"
    # The system as the setting shows it, with the server's tools.
    assert [connection.label for connection in accounting.connections] == ["Odoo"]
    assert "odoo_accounting_list_invoices" in accounting.connections[0].tools


def test_a_beat_played_in_process_gives_the_transcript(scene: Any) -> None:
    stage = stage_of(scene, cast())
    played = asyncio.run(stage.play(scene.script[0].cue.text))
    assert played.error == ""
    assert [line_text(line) for line in played.lines] == [
        "You → Sales: Which customer invoices are still open, and how much is due in total?",
        "Sales → Accounting: Which customer invoices are still open, and how much is due in total?",
        "Accounting → Odoo: odoo_accounting_list_invoices",
        f"Accounting: {TABLE}",
        f"Sales: Accounting answered: {TABLE}",
    ]
    assert "table" in played.lines[3].shows
    assert played.answer.startswith("Accounting answered:")
    assert played.seconds >= 0


# --- the verdicts -------------------------------------------------------------------------


def test_the_scripted_scene_passes_its_rehearsal(scene: Any) -> None:
    verdict = asyncio.run(
        rehearse(scene, stage_of(scene, cast()), where="here", beats=["open-invoices"])
    )
    assert [(beat.beat, beat.state, beat.says) for beat in verdict.beats] == [
        ("open-invoices", PASSED, "")
    ]
    assert verdict.live and verdict.exit_code == 0
    assert verdict.says == "Rehearsal: 1 of 1 beats passed. The scene is Live."


def test_a_beat_whose_shape_differs_fails_and_says_what_differed(scene: Any) -> None:
    # Accounting answers without reading the books.
    verdict = asyncio.run(
        rehearse(
            scene,
            stage_of(
                scene,
                cast(
                    accounting_calls=None, accounting_says="The books are closed. error"
                ),
            ),
            where="here",
            beats=["open-invoices"],
        )
    )
    [beat] = verdict.beats
    assert beat.state == FAILED
    assert beat.says.startswith(
        "Expected “Accounting → Odoo: odoo_accounting_list_invoices” after “Sales → Accounting”; "
        "the transcript went on: “Accounting: The books are closed. error”"
    )
    # The answer's words: what it did not say, what it should not have said.
    assert "It did not say “invoice”." in beat.says
    assert "It said “error”." in beat.says
    assert verdict.exit_code == 1 and not verdict.live
    assert (
        verdict.says
        == "Rehearsal: 0 of 1 beats passed. 1 failed. The scene is not Live."
    )


def test_a_member_that_cannot_play_makes_the_beat_not_run_with_why(scene: Any) -> None:
    stage = stage_of(scene, cast())
    stage.members[
        "accounting"
    ].reason = "Accounting is not set up: The MCP server odoo-accounting needs DATALAYER_ODOO_URL."
    verdict = asyncio.run(rehearse(scene, stage, where="here"))
    assert [beat.state for beat in verdict.beats] == [NOT_RUN] * 4
    assert verdict.beats[0].says == stage.members["accounting"].reason
    assert verdict.exit_code == 3
    assert (
        verdict.says
        == "Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live."
    )


def test_a_member_refused_in_this_process_is_said_in_its_sentence(scene: Any) -> None:
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    def refusing(spec: Any) -> Agent:
        if spec.id == "accounting":
            raise AppNotRunnable(
                ["accounting has connections, which this process does not bring."]
            )
        return scripted("ask_accounting", "Accounting answered: {result}")

    stage = stage_of(scene, refusing)
    played = asyncio.run(stage.play(scene.script[0].cue.text))
    # Accounting could not answer: the ask is a failed line, and Sales says so.
    assert played.error == ""
    assert any(
        line.failed and line.who == "Accounting" and "could not answer" in line.text
        for line in played.lines
    )
    # Checked before playing, the beat is not run with the same sentence.
    stage = scenes_command.stage_here(scene, agent=refusing)
    assert stage.members["accounting"].reason == (
        "accounting has connections, which this process does not bring."
    )
    verdict = asyncio.run(rehearse(scene, stage, where="here", beats=["open-invoices"]))
    assert verdict.beats[0].state == NOT_RUN
    assert (
        verdict.beats[0].says
        == "accounting has connections, which this process does not bring."
    )


def test_a_scene_with_a_recording_and_no_live_run_says_its_recording_stands(
    scene: Any,
) -> None:
    recorded = scene.model_copy(
        update={
            "rehearsal": scene.rehearsal.model_copy(
                update={
                    "recording": scenes.SceneRecording(
                        path="sales-and-accounting/recording.json",
                        taken="2026-10-07",
                        note="recorded on a developer's machine",
                    )
                }
            )
        }
    )
    stage = stage_of(recorded, cast())
    for member in stage.members.values():
        member.reason = "Not signed in to Datalayer."
    verdict = asyncio.run(rehearse(recorded, stage, where="here"))
    assert verdict.not_run == 4
    assert verdict.notes == [
        "Not played live: its recording stands (sales-and-accounting/recording.json, taken 2026-10-07): "
        "recorded on a developer's machine."
    ]


def test_the_time_a_beat_may_take_is_read_on_its_seconds(scene: Any) -> None:
    assert (
        seconds_of("60s") == 60
        and seconds_of("2m") == 120
        and seconds_of("500ms") == 0.5
    )
    assert seconds_of("") is None
    assert time_difference(72, "60s") == ["It took 72 s; the beat allows 60s."]
    assert time_difference(12, "60s") == []
    # The beat's own time, whatever the spec says it is: a beat that takes
    # twice it fails with both numbers.
    beat = scene.rehearsal.beats[0]
    allowed = seconds_of(beat.within)
    played = asyncio.run(stage_of(scene, cast()).play(scene.script[0].cue.text))
    played.seconds = allowed * 2
    verdict = verdict_of(beat, played, scene_names(scene))
    assert (verdict.state, verdict.says) == (
        FAILED,
        f"It took {allowed * 2:.0f} s; the beat allows {beat.within}.",
    )


def test_the_shape_is_matched_in_order_by_name_pattern_and_kind(scene: Any) -> None:
    names = scene_names(scene)
    played = asyncio.run(stage_of(scene, cast()).play(scene.script[0].cue.text))
    lines = played.lines
    # Ids, persona names and the system's server or shown name all name the same.
    assert (
        shape_differences(
            expected_of(["you → sales", "sales → accounting"]), lines, names
        )
        == []
    )
    assert (
        shape_differences(
            expected_of(["Accounting → odoo-accounting: odoo_accounting_*"]),
            lines,
            names,
        )
        == []
    )
    assert (
        shape_differences(
            expected_of(["Accounting: a table", "Sales: words"]), lines, names
        )
        == []
    )
    # Order is kept: Sales' report comes after Accounting's table, not before.
    assert shape_differences(
        expected_of(["Sales: words", "Accounting: a table"]), lines, names
    ) == [
        "Expected “Accounting: a table” after “Sales: words”; the transcript ended there."
    ]
    # A kind the answer does not come with.
    assert shape_differences(expected_of(["Accounting: a chart"]), lines, names)[
        0
    ].startswith("Expected “Accounting: a chart”; the transcript went on:")
    assert answer_differences("Two invoices are open.", ["invoice"], ["error"]) == []
    assert shown_kinds("| a | b |\n|---|---|\n| 1 | 2 |") == ("words", "table")
    assert shown_kinds("", [{"component": "Chart"}]) == ("chart",)


# --- over A2A -----------------------------------------------------------------------------


def test_a_member_at_an_address_is_asked_there_and_its_steps_are_lines(
    scene: Any,
) -> None:
    asked: List[str] = []

    async def over_a2a(member: StageMember, request: str) -> A2AAnswer:
        asked.append(f"{member.id}@{member.address}: {request}")
        return A2AAnswer(
            TABLE,
            (
                A2AStep("odoo_accounting_list_invoices"),
                A2AStep("odoo_accounting_list_invoices", ended=True),
            ),
        )

    members, entry = members_of(
        scene,
        addresses={"accounting": ("http://runtime/api/v1/a2a/agents/accounting", "k")},
    )
    stage = Stage(members, entry, agent=cast(), ask=over_a2a)
    verdict = asyncio.run(
        rehearse(scene, stage, where="cloud", beats=["open-invoices"])
    )
    assert asked == [
        "accounting@http://runtime/api/v1/a2a/agents/accounting: "
        "Which customer invoices are still open, and how much is due in total?"
    ]
    assert verdict.beats[0].state == PASSED, verdict.beats[0].says
    assert "Accounting → Odoo: odoo_accounting_list_invoices" in verdict.beats[0].lines


def test_a_member_at_an_address_is_asked_for_what_it_can_show_and_its_surface_is_read(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    # A caller that names nothing is answered in words alone, and a chart drawn
    # in words is not a chart: the stage names what it accepts, as the page
    # does, and reads the kinds off the surface the answer came with.
    import httpx

    from agent_runtimes.loop.scenes.stage import (
        ACCEPTED_OUTPUT_MODES,
        ask_over_a2a,
    )

    surface = {
        "surfaceId": "answer-1",
        "catalogId": "loop.answer",
        "title": "Aged receivables",
        "messages": [
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": "answer-1",
                    "components": [
                        {"id": "root", "component": "Column", "children": ["aged"]},
                        {"id": "aged", "component": "Chart"},
                    ],
                },
            }
        ],
    }
    events = [
        'data: {"result": {"kind": "artifact-update", "artifact": {"artifactId": "a1", '
        '"parts": [{"text": "The receivables, aged."}]}}}',
        'data: {"result": {"kind": "artifact-update", "artifact": {"artifactId": "a2", '
        '"parts": [{"mediaType": "application/json+a2ui", "data": '
        + json.dumps(surface)
        + "}]}}}",
        'data: {"result": {"kind": "status-update", "status": {"state": "completed", '
        '"message": {"parts": []}}}}',
    ]
    sent: List[Dict[str, Any]] = []

    class _Stream:
        status_code = 200

        async def __aenter__(self) -> "_Stream":
            return self

        async def __aexit__(self, *_: Any) -> bool:
            return False

        async def aiter_lines(self) -> Any:
            for line in events:
                yield line

    class _Client:
        def __init__(self, **_: Any) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: Any) -> bool:
            return False

        def stream(self, _method: str, _url: str, **kwargs: Any) -> _Stream:
            sent.append(kwargs["json"])
            return _Stream()

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    member = members_of(
        scene, addresses={"accounting": ("http://runtime/a2a/accounting", "")}
    )[0][1]
    answered = asyncio.run(ask_over_a2a(member, "Chart the aged receivables."))
    [body] = sent
    # The scene shows a table, a chart, the sources and a choice, every one of
    # them a component: words and a surface, and no notebook composed for nobody.
    assert body["params"]["configuration"]["acceptedOutputModes"] == list(
        ACCEPTED_OUTPUT_MODES
    )
    assert "application/x-ipynb+json" not in ACCEPTED_OUTPUT_MODES
    assert answered.failed == "" and answered.text == "The receivables, aged."
    assert [node["component"] for node in answered.components] == ["Column", "Chart"]
    assert shown_kinds(answered.text, answered.components) == ("words", "chart")


def test_the_cast_s_brief_is_given_over_the_application_s_instructions(
    scene: Any,
) -> None:
    # The brief is "what it is for in this scene, over its application's
    # instructions": Sales's application may ask the person which period it
    # means, and in the scene there is nobody to answer — so the brief wins.
    from agent_runtimes.loop.scenes.stage import with_ask_tools, with_brief

    sales = members_of(scene)[0][0]
    document = with_brief(sales, with_ask_tools(sales, {}))
    instructions = document["instructions"]
    assert sales.document["instructions"] in instructions
    assert sales.brief.strip() in instructions
    assert instructions.index(sales.brief.strip()) > instructions.index(
        sales.document["instructions"]
    )
    assert "the brief is what you do" in instructions
    # A member with no brief is left as its application is.
    assert with_brief(StageMember("x", "X", document={"a": 1}), {"a": 1}) == {"a": 1}


def test_a_member_at_an_address_that_fails_is_a_failed_line(scene: Any) -> None:
    async def over_a2a(member: StageMember, request: str) -> A2AAnswer:
        return A2AAnswer("", failed="Accounting asks for a key it was not given.")

    members, entry = members_of(
        scene, addresses={"accounting": ("http://runtime/a2a", "")}
    )
    stage = Stage(members, entry, agent=cast(), ask=over_a2a)
    verdict = asyncio.run(
        rehearse(scene, stage, where="cloud", beats=["open-invoices"])
    )
    [beat] = verdict.beats
    assert beat.state == FAILED
    assert (
        "Accounting: could not answer: Accounting asks for a key it was not given. (failed)"
        in beat.lines
    )


# --- the command --------------------------------------------------------------------------


def test_ls_lists_the_catalogue_with_faces_members_and_setup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The catalogue keeps each scene's last rehearsal beside its spec (A-14):
    # read as none here, so the listing says the spec's own `verified` words.
    monkeypatch.setattr(scenes, "scene_played", lambda _id: None)
    result = runner.invoke(scenes_command.app, ["ls"])
    assert result.exit_code == 0, result.output
    assert (
        "🤝  Sales & Accounting (sales-and-accounting)  Not verified yet"
        in result.output
    )
    assert "Sales in the browser → accounting" in result.output
    assert "Accounting on a runtime; Odoo via MCP" in result.output
    assert (
        "Beats: open-invoices, aged-receivables, largest-balance, payment-reminders"
        in result.output
    )
    assert (
        "· To set up: The MCP server 'odoo-accounting:0.0.1' is not enabled."
        in result.output
    )
    listed = json.loads(runner.invoke(scenes_command.app, ["ls", "--json"]).output)
    assert [scene["id"] for scene in listed] == sorted(scenes.SCENE_CATALOGUE)
    assert listed[-1]["entry"] == "sales" and listed[-1]["state"] == "Not verified yet"


def _here(monkeypatch: pytest.MonkeyPatch, factory: Callable[[Any], Agent]) -> None:
    from agent_runtimes.loop.apps import agent as agent_module

    # A member on a runtime is built by `local_agent`, one in the browser by `browser_agent`.
    monkeypatch.setattr(agent_module, "local_agent", factory)
    monkeypatch.setattr(agent_module, "browser_agent", factory)


def test_rehearse_passes_in_the_validate_tab_s_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _here(monkeypatch, cast())
    result = runner.invoke(
        scenes_command.app,
        ["rehearse", "sales-and-accounting", "--beat", "open-invoices"],
    )
    assert result.exit_code == 0, result.output
    assert (
        "Sales & Accounting (sales-and-accounting), rehearsed on this machine"
        in result.output
    )
    assert "✓ open-invoices: passed" in result.output
    assert "Accounting → Odoo: odoo_accounting_list_invoices" in result.output
    assert "Rehearsal: 1 of 1 beats passed. The scene is Live." in result.output


def test_rehearse_fails_with_what_differed_and_exits_1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _here(monkeypatch, cast(accounting_calls=None, accounting_says="Nothing is open."))
    result = runner.invoke(
        scenes_command.app,
        ["rehearse", "sales-and-accounting", "--beat", "open-invoices", "--json"],
    )
    assert result.exit_code == 1, result.output
    verdict = json.loads(result.output)
    assert verdict["beats"][0]["word"] == "failed"
    assert verdict["beats"][0]["says"].startswith(
        "Expected “Accounting → Odoo: odoo_accounting_list_invoices”"
    )
    assert verdict["live"] is False and verdict["exit_code"] == 1


def test_rehearse_says_not_run_and_exits_3_when_a_member_cannot_play() -> None:
    # No fake: the catalogue's members name connections and skills this process does not bring.
    result = runner.invoke(scenes_command.app, ["rehearse", "sales-and-accounting"])
    assert result.exit_code == 3, result.output
    assert "· open-invoices: not run — " in result.output
    assert "which this process does not bring" in result.output
    assert (
        "Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live."
        in result.output
    )


def test_rehearse_refuses_an_unknown_scene_or_beat() -> None:
    result = runner.invoke(scenes_command.app, ["rehearse", "no-such-scene"])
    assert result.exit_code == 2
    assert "No scene 'no-such-scene' in the catalogue" in result.output
    result = runner.invoke(
        scenes_command.app, ["rehearse", "sales-and-accounting", "--beat", "encore"]
    )
    assert result.exit_code == 2
    assert "has no beat 'encore'" in result.output


def test_a_browser_member_is_played_as_the_browser_plays_it(scene: Any) -> None:
    # Sales, in the browser: its agent names skills and backend tools, which the
    # page has not; the rehearsal leaves them out as the page does (A-13, A-14).
    # Accounting, on a runtime, is still refused in this process.
    from agent_runtimes.loop.scenes.stage import refused_here

    sales, accounting = members_of(scene)[0]
    assert refused_here(sales) == ""
    assert "which this process does not bring" in refused_here(accounting)


# --- the cloud ---------------------------------------------------------------------------


class _Launch:
    runtime_name = "rt-1"
    ingress = "https://r1.example/agent-runtimes/rt-1"
    server_url = "http://127.0.0.1:1"
    attached = False

    def __init__(self) -> None:
        self.stopped = False

    def stop(self) -> bool:
        self.stopped = True
        return True


def _cloud(
    monkeypatch: pytest.MonkeyPatch,
    *,
    launch: Any = None,
    configured: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Datalayer faked: what `launch_cloud` and `configure_on` were asked, kept."""
    from agent_runtimes.commands import apps as apps_module
    from agent_runtimes.loop import launch as launch_module

    asked: Dict[str, Any] = {"launches": [], "configures": []}

    def launch_cloud(agent_id: str, **kwargs: Any) -> Any:
        asked["launches"].append((agent_id, kwargs))
        if isinstance(launch, Exception):
            raise launch
        return launch or _Launch()

    def configure_on(
        base_url: str, document: Dict[str, Any], **kwargs: Any
    ) -> Dict[str, Any]:
        asked["configures"].append((base_url, document["id"], kwargs))
        return configured or {
            "a2a": {
                "url": f"{kwargs.get('a2a_url')}/api/v1/a2a/agents/{document['id']}/"
            },
            "setup": [],
        }

    monkeypatch.setattr(launch_module, "launch_cloud", launch_cloud)
    monkeypatch.setattr(apps_module, "configure_on", configure_on)
    return asked


def test_a_runtime_member_is_launched_for_its_application_and_needs_a_key(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    asked = _cloud(monkeypatch)
    stage, launches = scenes_command.stage_in_cloud(
        scene, keys={}, environment=None, minutes=None, status=lambda _m: None
    )
    # Launched for Accounting's own Appspec, so that the runtime is given the
    # secrets its connections declare (R-19), not the bootstrap agent's none.
    [(agent_id, kwargs)] = asked["launches"]
    assert agent_id == "example-simple" and kwargs["app_spec"]["id"] == "accounting"
    assert kwargs["label"] == "🧾 Accounting"
    assert [launch.runtime_name for launch in launches] == ["rt-1"]
    accounting = stage.members["accounting"]
    assert accounting.address.endswith("/api/v1/a2a/agents/accounting/")
    assert accounting.reason.startswith("Accounting is served at https://r1.example")
    assert "--key accounting=<key>" in accounting.reason
    assert "--address accounting=https://r1.example" in accounting.reason
    # Sales, in the browser, is played here.
    assert stage.members["sales"].reason == ""


def test_a_member_at_an_address_is_not_launched(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    asked = _cloud(monkeypatch)
    stage, launches = scenes_command.stage_in_cloud(
        scene,
        keys={"accounting": "k"},
        addresses={"accounting": "https://deployed/api/v1/a2a/agents/accounting/"},
        environment=None,
        minutes=None,
        status=lambda _m: None,
    )
    assert asked["launches"] == [] and launches == []
    accounting = stage.members["accounting"]
    assert accounting.address == "https://deployed/api/v1/a2a/agents/accounting/"
    assert accounting.key == "k" and accounting.reason == ""
    # Without a key, the address alone is not enough: said, not launched.
    stage, _ = scenes_command.stage_in_cloud(
        scene,
        keys={},
        addresses={"accounting": "https://deployed/a2a"},
        environment=None,
        minutes=None,
        status=lambda _m: None,
    )
    assert asked["launches"] == []
    assert "DATALAYER_SCENE_KEY_ACCOUNTING" in stage.members["accounting"].reason


def test_addresses_are_read_from_the_option_and_the_scene_s_variable(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    assert scenes_command._addresses_of([], scene) == {}
    monkeypatch.setenv("DATALAYER_DEMO_TEAM_ACCOUNTING_A2A_URL", " https://demo/a2a ")
    assert scenes_command._addresses_of([], scene) == {"accounting": "https://demo/a2a"}
    assert scenes_command._addresses_of(["accounting=https://kept/a2a"], scene) == {
        "accounting": "https://kept/a2a"
    }
    import typer

    with pytest.raises(typer.BadParameter, match="--address takes member=URL"):
        scenes_command._addresses_of(["accounting"], scene)


def test_a_launch_datalayer_does_not_set_up_is_the_member_s_sentence(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    _cloud(
        monkeypatch,
        launch=RuntimeError(
            "Datalayer did not set up rt-9 in time (the account's secrets and model token are given then); it was stopped."
        ),
    )
    stage, launches = scenes_command.stage_in_cloud(
        scene, keys={}, environment=None, minutes=None, status=lambda _m: None
    )
    assert launches == []
    assert stage.members["accounting"].reason.startswith(
        "Datalayer did not set up rt-9"
    )


def test_what_the_runtime_says_is_to_set_up_is_the_member_s_notes(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    # The catalogue's own notes come back from the configure (an agent or a
    # server not offered by default); the member is served all the same, as
    # `loop apps run` serves it. A secret not given is a refusal, not a note.
    _cloud(
        monkeypatch,
        configured={
            "a2a": {"url": "https://r1.example/api/v1/a2a/agents/accounting/"},
            "setup": [
                "The agent 'worker-accountant:0.0.1' is not enabled.",
                "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
            ],
        },
    )
    stage, _ = scenes_command.stage_in_cloud(
        scene,
        keys={"accounting": "k"},
        environment=None,
        minutes=None,
        status=lambda _m: None,
    )
    accounting = stage.members["accounting"]
    assert accounting.reason == "" and accounting.key == "k"
    assert accounting.address == "https://r1.example/api/v1/a2a/agents/accounting/"
    assert accounting.notes == [
        "The agent 'worker-accountant:0.0.1' is not enabled.",
        "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
    ]


def test_a_runtime_that_refuses_the_configure_is_the_member_s_sentence(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    import typer

    from agent_runtimes.commands import apps as apps_module

    _cloud(monkeypatch)

    def refusing(
        base_url: str, document: Dict[str, Any], **kwargs: Any
    ) -> Dict[str, Any]:
        raise typer.BadParameter(
            "the MCP server odoo-accounting needs DATALAYER_API_KEY, which this runtime was not given."
        )

    monkeypatch.setattr(apps_module, "configure_on", refusing)
    stage, _ = scenes_command.stage_in_cloud(
        scene,
        keys={"accounting": "k"},
        environment=None,
        minutes=None,
        status=lambda _m: None,
    )
    assert stage.members["accounting"].reason == (
        "the MCP server odoo-accounting needs DATALAYER_API_KEY, which this runtime was not given."
    )


# --- Live, read from the rehearsal that was played ----------------------------------------


def _played(**changes: Any) -> Any:
    played = {
        "at": "2026-10-08T18:39:08+00:00",
        "passed": True,
        "says": "Rehearsal: 4 of 4 beats passed. The scene is Live.",
        "beats": [],
        "runtime": "1.3.94",
    }
    played.update(changes)
    return scenes.ScenePlayed.model_validate(played)


def test_live_is_read_from_the_rehearsal_that_was_played(
    monkeypatch: pytest.MonkeyPatch, scene: Any
) -> None:
    # Nothing played: the scene's own `verified` sentences say it.
    monkeypatch.setattr(scenes, "scene_played", lambda _id: None)
    assert scenes_command.verified_state(scene) == "Not verified yet"
    monkeypatch.setattr(scenes, "scene_played", lambda _id: _played())
    assert scenes_command.verified_state(scene) == "Live"
    assert scenes_command.played_says(_played()) == (
        "Rehearsed on Datalayer on 2026-10-08: Rehearsal: 4 of 4 beats passed. The scene is Live."
    )
    monkeypatch.setattr(
        scenes,
        "scene_played",
        lambda _id: _played(
            passed=False,
            says="Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live.",
        ),
    )
    assert scenes_command.verified_state(scene) == "Not Live"

    # A result that cannot be read is not a pass.
    def refused(_id: str) -> Any:
        raise scenes.SceneError(
            "rehearsal.json of 'sales-and-accounting' is not a rehearsal's result"
        )

    monkeypatch.setattr(scenes, "scene_played", refused)
    assert scenes_command.verified_state(scene) == "Not verified yet"
    # `ls` says it, and `ls --json` carries it.
    monkeypatch.setattr(scenes, "scene_played", lambda _id: _played())
    result = runner.invoke(scenes_command.app, ["ls"])
    assert "Sales & Accounting (sales-and-accounting)  Live" in result.output
    assert (
        "Rehearsed on Datalayer on 2026-10-08: Rehearsal: 4 of 4 beats passed."
        in result.output
    )
    result = runner.invoke(scenes_command.app, ["ls", "--json"])
    listed = {item["id"]: item for item in json.loads(result.output)}
    assert listed["sales-and-accounting"]["state"] == "Live"
    assert listed["sales-and-accounting"]["played"]["runtime"] == "1.3.94"


def test_a_cloud_rehearsal_of_a_catalogue_scene_is_kept_as_its_last(
    monkeypatch: pytest.MonkeyPatch, scene: Any, tmp_path: Any
) -> None:
    kept: List[Any] = []

    def write_played(scene_id: str, played: Any, directory: Any = None) -> Any:
        kept.append((scene_id, played))
        return tmp_path / scene_id / "rehearsal.json"

    monkeypatch.setattr(scenes, "write_played", write_played)
    monkeypatch.setattr(scenes, "scene_played", lambda _id: None)

    def stage_in_cloud(scene: Any, **kwargs: Any) -> Any:
        members, entry = members_of(scene)
        return Stage(members, entry, agent=cast()), []

    monkeypatch.setattr(scenes_command, "stage_in_cloud", stage_in_cloud)
    result = runner.invoke(
        scenes_command.app, ["rehearse", "sales-and-accounting", "--cloud", "--json"]
    )
    # The fakes answer the first beat's shape alone: the rest fail, and what
    # was found is kept all the same — a scene that did not pass says so.
    assert result.exit_code == 1, result.output
    # stdout is the verdict alone: what else is said goes to stderr.
    verdict = json.loads(result.stdout)
    assert verdict["live"] is False and verdict["where"] == "on Datalayer"
    assert "Kept as the scene's last rehearsal:" in result.stderr
    [(scene_id, played)] = kept
    assert scene_id == "sales-and-accounting" and played.passed is False
    assert played.where == "on Datalayer" and played.says == verdict["says"]
    assert [beat.beat for beat in played.beats] == [
        "open-invoices",
        "aged-receivables",
        "largest-balance",
        "payment-reminders",
    ]
    assert played.beats[0].state == PASSED and played.beats[1].state == FAILED
    assert played.beats[1].says.startswith("Expected") and played.at.startswith("20")
    from agent_runtimes._version import __version__

    assert played.runtime == __version__
    # One beat alone, or a local run, is not the scene's last rehearsal.
    kept.clear()
    runner.invoke(
        scenes_command.app,
        ["rehearse", "sales-and-accounting", "--cloud", "--beat", "open-invoices"],
    )
    _here(monkeypatch, cast())
    runner.invoke(scenes_command.app, ["rehearse", "sales-and-accounting"])
    assert kept == []


def test_a_verdict_as_a_dict_carries_each_beat_s_word() -> None:
    verdict = RehearsalVerdict(scene="s", name="S", where="here")
    assert verdict.says == "Rehearsal: no beat to play." and verdict.exit_code == 3
    verdict.beats.append(verdict_of(_Beat(), Played(cue="hi", error="no key"), {}))
    assert verdict.as_dict()["beats"][0]["word"] == "not run"


class _Beat:
    beat = "b"
    lines: List[str] = []
    must_say: List[str] = []
    must_not_say: List[str] = []
    within = ""
