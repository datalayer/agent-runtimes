# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's computer (LOOP R-23, I-01).

Its three permissions — browse, files, shell — each off until it is turned on,
gate the tools its agent is given where its connections' are (U-15): a part
off is never shown to the model. The tools of its files run on its sandbox,
inside its working directory. A person takes it over — its agent's calls to
it wait — runs code on it, and hands it back. The routes show it to whoever
talks to it in a Preview; a deployment's to its owner and the editors of
its application only, as ai-agents answers (decided 2026-10-06).
"""

import asyncio
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.loop.apps import computer, sessions
from agent_runtimes.loop.apps.callers import Caller, CallerRefused
from agent_runtimes.loop.apps.computer import (
    FILE_TOOLS,
    ComputerRefused,
    computer_toolset,
    sandbox_of,
)
from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes
from agent_runtimes.types import AppSpec

OFFERED = [
    "execute_code",
    "run_skill_script",
    "list_computer_files",
    "read_computer_file",
    "write_computer_file",
    "search_tools",
]


def app(**computer_parts: bool) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "permissions": {"computer": computer_parts},
        }
    )


def _defs(*names: str) -> List[ToolDefinition]:
    return [ToolDefinition(name=name) for name in names]


async def _given(spec: AppSpec) -> List[str]:
    capability = AppRulesCapability(app=spec, agent_id="desk")
    return [tool.name for tool in await capability.prepare_tools(None, _defs(*OFFERED))]


@pytest.fixture(autouse=True)
def _in_tmp(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    # The sandbox an agent runs code in works where the runtime runs: here.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(computer, "WAIT_STEP", 0.01)
    yield
    computer.forget_holders()


# --- what it is given ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_each_part_off_gives_none_of_its_tools() -> None:
    assert await _given(app()) == ["search_tools"]
    assert await _given(app(shell=True)) == [
        "execute_code",
        "run_skill_script",
        "search_tools",
    ]
    assert await _given(app(files=True)) == [
        "list_computer_files",
        "read_computer_file",
        "write_computer_file",
        "search_tools",
    ]
    # No browser tool exists: browse on gives nothing more.
    assert await _given(app(browse=True)) == ["search_tools"]


def test_the_tools_of_its_files_are_made_only_when_its_files_are_on() -> None:
    assert computer_toolset(app(shell=True), "desk") is None
    toolset = computer_toolset(app(files=True), "desk")
    assert toolset is not None and set(toolset.tools) == set(FILE_TOOLS)


@pytest.mark.asyncio
async def test_a_model_is_shown_only_the_parts_turned_on() -> None:
    seen: List[str] = []

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        seen.extend(tool.name for tool in info.function_tools)
        return ModelResponse(parts=[TextPart("done")])

    for spec in (app(), app(files=True)):
        seen.clear()
        agent = Agent(
            FunctionModel(model),
            capabilities=[AppRulesCapability(app=spec, agent_id="desk")],
        )
        await agent.run("hello")
        assert sorted(seen) == (
            sorted(FILE_TOOLS) if spec.permissions.computer.files else []
        )


@pytest.mark.asyncio
async def test_its_files_are_written_read_and_listed_on_its_sandbox() -> None:
    calls = iter(
        [
            ToolCallPart(
                "write_computer_file", {"path": "notes/a.txt", "content": "hello"}
            ),
            ToolCallPart("read_computer_file", {"path": "notes/a.txt"}),
            ToolCallPart("list_computer_files", {"path": "notes"}),
        ]
    )
    returned: List[str] = []

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if getattr(last, "part_kind", "") == "tool-return":
            returned.append(str(last.content))
        call = next(calls, None)
        return ModelResponse(parts=[call] if call else [TextPart("done")])

    agent = Agent(
        FunctionModel(model),
        capabilities=[
            AppRulesCapability(app=app(files=True), agent_id="desk", ask=_always_yes)
        ],
    )
    await agent.run("go")
    assert returned[0] == "Written: notes/a.txt (5 bytes)."
    assert returned[1] == "hello"
    assert returned[2] == "notes/a.txt (5 bytes)"


async def _always_yes(tool: str, args: Dict[str, Any], decision: Any) -> None:
    return None


def test_a_path_out_of_its_working_directory_is_refused() -> None:
    for path in ("/etc/passwd", "../up", "a/../../up"):
        with pytest.raises(ComputerRefused, match="not in its working directory"):
            computer.inside(path)
    assert computer.inside("a/b.txt") == "a/b.txt"


# --- taken over ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_call_to_its_computer_waits_while_a_person_has_it() -> None:
    capability = AppRulesCapability(app=app(files=True), agent_id="desk")
    computer.take_over("desk", "person", "ada")

    async def call(tool: str) -> Dict[str, Any]:
        return await capability.before_tool_execute(
            None, call=ToolCallPart(tool, {}), tool_def=None, args={}
        )

    waiting = asyncio.ensure_future(call("list_computer_files"))
    await asyncio.sleep(0.05)
    assert not waiting.done()
    # What is not of its computer goes on.
    assert await call("search_tools") == {}
    with pytest.raises(ComputerRefused, match="Somebody else"):
        computer.hand_back("desk", "person", "bob")
    computer.hand_back("desk", "person", "ada")
    assert await asyncio.wait_for(waiting, 1) == {}


def test_only_who_took_it_over_runs_code_on_it() -> None:
    with pytest.raises(ComputerRefused, match="Take the computer over first"):
        computer.run_as_person("desk", "person", "ada", "print(1)")
    computer.take_over("desk", "person", "ada")
    with pytest.raises(ComputerRefused, match="Somebody else"):
        computer.take_over("desk", "person", "bob")
    with pytest.raises(ComputerRefused, match="Take the computer over first"):
        computer.run_as_person("desk", "person", "bob", "print(1)")
    said = computer.run_as_person("desk", "person", "ada", "print(6 * 7)")
    assert said["stdout"].strip() == "42" and not said["error"]


# --- the routes ---------------------------------------------------------------------


class Verifier:
    """Each token is the person it names."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        if token == "expired":
            raise CallerRefused(401, "The token has expired.")
        return Caller(kind="person", uid=token)


class Talking:
    """A session held on an agent, opened by one person."""

    def __init__(self, agent_id: str, uid: str) -> None:
        self.agent_id = agent_id
        self.state = "open"
        self.opened_by = Caller(kind="person", uid=uid)

    def answers_to(self, caller: Caller) -> bool:
        return (caller.kind, caller.uid) == ("person", self.opened_by.uid)


SPEC = {
    "schema": "loop.app/v1",
    "id": "desk",
    "name": "Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "permissions": {"computer": {"files": True, "shell": True}},
}


@pytest.fixture()
def held(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    agents._agentspecs["desk"] = {"app_spec": SPEC, "app_instance": {}}
    agents._agentspecs["shared-desk"] = {
        "app_spec": SPEC,
        "app_instance": {"deployment_uid": "dep-1", "app_uid": "app-1"},
    }
    agents._agentspecs["bare-desk"] = {
        "app_spec": {**SPEC, "permissions": {}},
        "app_instance": {},
    }
    yield
    for agent_id in ("desk", "shared-desk", "bare-desk"):
        agents._agentspecs.pop(agent_id, None)
    sessions.forget_sessions()


def _client(host: str) -> TestClient:
    from agent_runtimes.app import create_app

    return TestClient(create_app(), client=(host, 50000))


BASE = "/api/v1/apps/agents/desk/computer"


def test_the_machine_sees_takes_over_runs_and_hands_back(held: None) -> None:
    sandbox_of("desk").files.write("files/s1/report.csv", "a,b\n1,2\n")
    with _client("127.0.0.1") as local:
        described = local.get(BASE).json()
        assert described["parts"] == {"browse": False, "files": True, "shell": True}
        assert (described["browser"], described["started"], described["held"]) == (
            False,
            True,
            None,
        )
        top = local.get(f"{BASE}/files").json()["entries"]
        assert [entry["path"] for entry in top] == ["files"]
        inner = local.get(f"{BASE}/files", params={"path": "files/s1"}).json()
        assert [(e["name"], e["type"], e["size"]) for e in inner["entries"]] == [
            ("report.csv", "file", 8)
        ]
        saved = local.get(f"{BASE}/file", params={"path": "files/s1/report.csv"})
        assert saved.content == b"a,b\n1,2\n"
        assert 'filename="report.csv"' in saved.headers["content-disposition"]
        assert local.get(f"{BASE}/file", params={"path": "../x"}).status_code == 400
        refused = local.post(f"{BASE}/run", json={"code": "print(1)"})
        assert refused.status_code == 409
        taken = local.post(f"{BASE}/take-over").json()
        assert taken["held"]["kind"] == "local" and taken["interrupted"] is False
        now = local.get(BASE).json()
        assert (now["held"]["kind"], now["yours"]) == ("local", True)
        ran = local.post(f"{BASE}/run", json={"code": "print('mine')"}).json()
        assert ran["stdout"].strip() == "mine"
        assert local.post(f"{BASE}/hand-back").json() == {"held": None}
        assert local.get(BASE).json()["held"] is None


def test_a_file_of_its_computer_is_a_download_never_a_page(held: None) -> None:
    """STUDIO D-22: an uploaded page is saved, not drawn, whatever it holds."""
    page = '<script>alert(document.cookie)</script><img src=x onerror="alert(1)">'
    sandbox_of("desk").files.write("files/s1/page.html", page)
    sandbox_of("desk").files.write('files/s1/r"é;port.svg', "<svg onload=1/>")
    with _client("127.0.0.1") as local:
        saved = local.get(f"{BASE}/file", params={"path": "files/s1/page.html"})
        assert saved.status_code == 200
        assert saved.text == page
        assert saved.headers["content-type"] == "application/octet-stream"
        assert saved.headers["content-disposition"].startswith(
            'attachment; filename="page.html"'
        )
        assert saved.headers["x-content-type-options"] == "nosniff"
        assert saved.headers["content-security-policy"] == (
            "sandbox; default-src 'none'"
        )
        odd = local.get(f"{BASE}/file", params={"path": 'files/s1/r"é;port.svg'})
        assert odd.status_code == 200
        assert odd.headers["content-type"] == "application/octet-stream"
        assert odd.headers["content-disposition"] == (
            "attachment; filename=\"r___port.svg\"; filename*=UTF-8''r%22%C3%A9%3Bport.svg"
        )


def test_it_is_shown_only_to_whoever_talks_to_it(held: None) -> None:
    with _client("10.0.0.4") as remote:
        ada = {"Authorization": "Bearer ada"}
        bob = {"Authorization": "Bearer bob"}
        assert remote.get(BASE).status_code == 401
        assert remote.get(BASE, headers=ada).status_code == 404
        sessions._SESSIONS["s-1"] = Talking("desk", "ada")  # type: ignore[assignment]
        assert remote.get(BASE, headers=ada).status_code == 200
        assert remote.get(BASE, headers=bob).status_code == 404
        assert remote.post(f"{BASE}/take-over", headers=ada).status_code == 200
        assert remote.get(BASE, headers=ada).json()["yours"] is True
        sessions._SESSIONS["s-2"] = Talking("desk", "bob")  # type: ignore[assignment]
        assert remote.get(BASE, headers=bob).json()["yours"] is False
        assert remote.post(f"{BASE}/take-over", headers=bob).status_code == 409
        assert remote.post(f"{BASE}/hand-back", headers=bob).status_code == 409
        assert remote.post(f"{BASE}/hand-back", headers=ada).status_code == 200


def test_a_deployments_computer_is_shown_to_its_owner_and_editors_only(
    held: None,
) -> None:
    from agent_runtimes.loop.apps import opening

    asked: List[tuple] = []

    async def ai_agents(deployment_uid: str, bearer: str) -> tuple:
        asked.append((deployment_uid, bearer))
        if bearer in ("ada", "eve"):
            return 200, ""
        return 403, opening.COMPUTER_NOT_SHOWN

    opening.use_computer_asker(ai_agents)
    shared = "/api/v1/apps/agents/shared-desk/computer"
    try:
        with _client("10.0.0.4") as remote:
            # Its owner (ada) and an editor (eve), without a session on it.
            assert (
                remote.get(shared, headers={"Authorization": "Bearer ada"}).status_code
                == 200
            )
            assert (
                remote.get(shared, headers={"Authorization": "Bearer eve"}).status_code
                == 200
            )
            # Somebody it acts for, even talking to it, is refused in ai-agents' words.
            sessions._SESSIONS["s-3"] = Talking("shared-desk", "bob")  # type: ignore[assignment]
            refused = remote.get(shared, headers={"Authorization": "Bearer bob"})
            assert refused.status_code == 403
            assert refused.json()["detail"] == opening.COMPUTER_NOT_SHOWN
            # Remembered for a minute: asked once per caller.
            remote.get(shared, headers={"Authorization": "Bearer ada"})
            assert asked == [("dep-1", "ada"), ("dep-1", "eve"), ("dep-1", "bob")]
        with _client("127.0.0.1") as local:
            # The machine itself is not asked about.
            assert local.get(shared).status_code == 200
    finally:
        opening.use_computer_asker(None)


def test_an_embeds_visitor_never_sees_a_deployments_computer() -> None:
    from agent_runtimes.loop.apps import opening
    from agent_runtimes.loop.apps.callers import Caller

    async def never(deployment_uid: str, bearer: str) -> tuple:
        raise AssertionError("an embed is not asked about")

    opening.use_computer_asker(never)
    try:
        for caller in (
            Caller(kind="embed", uid="ada", app_uid="app-1"),
            Caller(kind="visitor"),
        ):
            with pytest.raises(opening.NotLetIn) as refused:
                asyncio.run(opening.ensure_may_see_computer("dep-1", caller, "token"))
            assert refused.value.status == 403
    finally:
        opening.use_computer_asker(None)


def test_none_is_none(held: None) -> None:
    with _client("127.0.0.1") as local:
        bare = "/api/v1/apps/agents/bare-desk/computer"
        assert local.get(bare).json()["parts"] == {
            "browse": False,
            "files": False,
            "shell": False,
        }
        refused = local.get(f"{bare}/files")
        assert refused.status_code == 409
        assert "browse, files and shell are all off" in refused.json()["detail"]
        assert local.post(f"{bare}/take-over").status_code == 409
        missing = local.get("/api/v1/apps/agents/nobody/computer")
        assert missing.status_code == 404
