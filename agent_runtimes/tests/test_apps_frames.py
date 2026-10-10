# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's agent keeps to its organization's contexts (LOOP U-31, U-32).

The organization's version of a catalogue Frame replaces the catalogue's,
its own Frames are given beside them, both read from IAM with the caller's
token; what cannot be read refuses the application, in a sentence.
"""

from typing import Any

import httpx
import pytest
from fastapi import HTTPException

from agent_runtimes.loop.apps.agent import local_agent
from agent_runtimes.loop.apps.frames import (
    NO_ORGANIZATION,
    FramesUnread,
    OrganizationFrames,
    frames_instructions,
    read_organization_frames,
)
from agent_runtimes.loop.apps.loading import AppNotRunnable, load_app
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

pytest.importorskip("agentspecs.frames")

VERSION = {
    "rules": ["Say the quarter of every figure."],
    "terminology": {"ARR": "What recurs in a year."},
    "style": ["Three sentences at most."],
    "updated_by": "01OWNER",
    "updated_at": "2026-10-05T08:00:00+00:00",
}
OWN = {
    **VERSION,
    "name": "House style",
    "description": "How Acme writes to its customers.",
    "rules": ["Sign every answer Acme."],
}
ACME = OrganizationFrames("01ORG", {"board-reporting": VERSION, "org-house-style": OWN})

APP = {
    "schema": "loop.app/v1",
    "id": "board-pack",
    "name": "Board pack",
    "kind": "chat",
    "agent": "example-a2a-writer",
    "instructions": "Write short.",
    "context": ["board-reporting", "org-house-style"],
}


def _iam(monkeypatch: pytest.MonkeyPatch, answer: Any) -> list:
    asked: list = []

    def get(url: str, headers: dict, timeout: float) -> httpx.Response:
        asked.append((url, headers))
        if isinstance(answer, Exception):
            raise answer
        status, body = answer
        return httpx.Response(status, json=body)

    monkeypatch.setattr(httpx, "get", get)
    return asked


class TestReading:
    def test_no_organization_reads_nothing(self, monkeypatch):
        asked = _iam(monkeypatch, (500, {}))
        assert read_organization_frames(None, iam_url="x", token="t") is NO_ORGANIZATION
        assert asked == []

    def test_its_contexts_are_read_with_the_callers_token(self, monkeypatch):
        asked = _iam(monkeypatch, (200, {"success": True, "frames": ACME.versions}))
        read = read_organization_frames("01ORG", iam_url="https://iam/", token="t")
        assert read == ACME
        assert read.own == ["org-house-style"]
        assert asked == [
            (
                "https://iam/api/iam/v1/organizations/01ORG/frames",
                {"Authorization": "Bearer t"},
            )
        ]

    @pytest.mark.parametrize(
        "answer, said",
        [
            ((403, {"detail": "no"}), "IAM answered 403"),
            ((200, {"success": True}), "IAM answered no contexts"),
            (httpx.ConnectError("down"), r"could not be reached \(ConnectError\)"),
        ],
    )
    def test_what_cannot_be_read_is_said(self, monkeypatch, answer, said):
        _iam(monkeypatch, answer)
        with pytest.raises(FramesUnread, match=said):
            read_organization_frames("01ORG", iam_url="https://iam", token="t")

    def test_nobody_signed_in_reads_nothing(self, monkeypatch):
        asked = _iam(monkeypatch, (200, {"frames": {}}))
        with pytest.raises(FramesUnread, match="nobody signed in"):
            read_organization_frames("01ORG", iam_url="https://iam", token=None)
        assert asked == []


class TestWhatTheAgentIsTold:
    def test_nothing_for_no_context(self):
        assert frames_instructions([], ACME) == ""

    def test_the_catalogue_s_for_nobody_s_organization(self):
        told = frames_instructions(["board-reporting"], NO_ORGANIZATION)
        assert "State a risk as plainly as a result" in told

    def test_the_organization_s_version_in_place_of_the_catalogue_s(self):
        told = frames_instructions(["board-reporting"], ACME)
        assert "Say the quarter of every figure." in told
        assert "**ARR**: What recurs in a year." in told
        assert "Three sentences at most." in told
        assert "State a risk as plainly as a result" not in told
        # The rest is the catalogue's.
        assert "summary-first" in told

    def test_its_own_beside_them(self):
        told = frames_instructions(["board-reporting", "org-house-style"], ACME)
        assert "House style — owned by your organization" in told
        assert "Sign every answer Acme." in told

    def test_an_own_context_its_organization_does_not_have_is_refused(self):
        with pytest.raises(AppNotRunnable, match="no context named 'org-gone'"):
            frames_instructions(["org-gone"], ACME)

    def test_an_own_context_with_no_organization_is_refused(self):
        with pytest.raises(AppNotRunnable, match="belongs to no organization"):
            frames_instructions(["org-house-style"], NO_ORGANIZATION)


def test_the_loader_leaves_an_own_context_to_where_its_organization_is_known():
    assert load_app(APP).context == ["board-reporting", "org-house-style"]
    with pytest.raises(AppNotRunnable, match="no Frame named 'gone'"):
        load_app({**APP, "context": ["gone"]})


def test_the_local_agent_is_told_its_contexts_between_its_prompt_and_the_application_s():
    app = load_app(APP)
    agent = local_agent(app, ACME)
    written = "".join(part.instruction for part in agent._instructions)
    assert written.startswith("You are a concise writing specialist")
    assert "## Frames" in written and "Sign every answer Acme." in written
    assert written.endswith("\n\nWrite short.")
    with pytest.raises(AppNotRunnable, match="belongs to no organization"):
        local_agent(app)


@pytest.mark.asyncio
async def test_the_runtime_gives_its_agent_the_organization_s_contexts(
    creation_spy: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = _iam(monkeypatch, (200, {"success": True, "frames": ACME.versions}))
    http = _DummyRequest()
    http.headers = {"authorization": "Bearer the-caller"}
    request = CreateAgentRequest(
        name="board-pack",
        agent_spec_id="example-a2a-writer",
        app_spec=APP,
        app_instance={"app_uid": "app-1", "organization_uid": "01ORG"},
    )
    await create_agent(request, http)
    told = str(creation_spy["pydantic_kwargs"]["instructions"])
    assert "Say the quarter of every figure." in told
    assert "Sign every answer Acme." in told
    assert told.index("## Frames") < told.index("Write short.")
    assert asked[0][1] == {"Authorization": "Bearer the-caller"}


@pytest.mark.asyncio
async def test_the_runtime_refuses_it_when_its_organization_s_contexts_cannot_be_read(
    creation_spy: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    _iam(monkeypatch, httpx.ConnectError("down"))
    http = _DummyRequest()
    http.headers = {"authorization": "Bearer the-caller"}
    request = CreateAgentRequest(
        name="board-pack",
        agent_spec_id="example-a2a-writer",
        app_spec={**APP, "context": ["board-reporting"]},
        app_instance={"app_uid": "app-1", "organization_uid": "01ORG"},
    )
    with pytest.raises(HTTPException) as refused:
        await create_agent(request, http)
    assert refused.value.status_code == 422
    assert "contexts of organization 01ORG were not read" in str(refused.value.detail)
    assert creation_spy["pydantic_kwargs"] is None


class TestLoopAppsValidate:
    """`loop apps validate --organization` checks an organization's own context."""

    @staticmethod
    def _write(tmp_path) -> Any:
        import yaml

        path = tmp_path / "app.yaml"
        path.write_text(yaml.safe_dump({**APP, "agent": "cog-crawler:0.0.1"}))
        return path

    @staticmethod
    def _signed_in(monkeypatch, frames: Any) -> None:
        from types import SimpleNamespace

        from agent_runtimes.loop import launch

        client = SimpleNamespace(urls=SimpleNamespace(iam_url="https://iam.test"))
        monkeypatch.setattr(launch, "make_client", lambda: (client, "t"))

        def get(url: str, headers: dict, timeout: float) -> httpx.Response:
            if url.endswith("/frames"):
                return httpx.Response(200, json={"success": True, "frames": frames})
            return httpx.Response(200, json={"success": True, "plugins_off": []})

        monkeypatch.setattr(httpx, "get", get)

    def test_with_no_organization_an_own_context_is_not_ready(self, tmp_path):
        from typer.testing import CliRunner

        from agent_runtimes.commands.apps import app

        result = CliRunner().invoke(app, ["validate", str(self._write(tmp_path))])
        assert result.exit_code == 1
        assert "is a context of an organization's own" in result.output

    def test_it_is_checked_against_the_organization_s(self, tmp_path, monkeypatch):
        from typer.testing import CliRunner

        from agent_runtimes.commands.apps import app

        path = str(self._write(tmp_path))
        self._signed_in(monkeypatch, ACME.versions)
        result = CliRunner().invoke(app, ["validate", "--organization", "01ORG", path])
        assert result.exit_code == 0, result.output
        self._signed_in(monkeypatch, {"board-reporting": VERSION})
        result = CliRunner().invoke(app, ["validate", "--organization", "01ORG", path])
        assert result.exit_code == 1
        assert (
            "Its organization has no context named 'org-house-style'." in result.output
        )

    def test_signed_out_its_contexts_are_not_read_and_it_is_not_ready(
        self, tmp_path, monkeypatch
    ):
        from typer.testing import CliRunner

        from agent_runtimes.commands.apps import app
        from agent_runtimes.loop import launch

        def signed_out():
            raise launch.NotSignedIn("No Datalayer credentials were found.")

        monkeypatch.setattr(launch, "make_client", signed_out)
        result = CliRunner().invoke(
            app, ["validate", "--organization", "01ORG", str(self._write(tmp_path))]
        )
        assert result.exit_code == 1
        assert "The contexts of organization 01ORG were not read" in result.output
