# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the skills catalog endpoint and the /skills command."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from agent_runtimes.chat.commands import skills as skills_cmd


class _Console:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def print(self, *args, **kwargs) -> None:
        self.lines.append(" ".join(str(a) for a in args))

    def text(self) -> str:
        return "\n".join(self.lines)


class TestCatalogEndpoint:
    def test_lists_the_catalog_without_a_sandbox(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.routes import configure

        async def no_sandbox(**kwargs):
            raise RuntimeError("no sandbox is running")

        monkeypatch.setattr(configure, "get_codemode_status", no_sandbox)
        payload = asyncio.run(configure.list_catalog_skills())

        # Seeing what a skill is should not require paying for compute.
        assert payload["skills"], "the catalogue should answer without a sandbox"
        assert payload["active"] == []
        assert all(skill["active"] is False for skill in payload["skills"])

    def test_reports_env_var_readiness(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from agent_runtimes.routes import configure

        async def no_sandbox(**kwargs):
            return {}

        monkeypatch.setattr(configure, "get_codemode_status", no_sandbox)
        monkeypatch.delenv("GITHUB_TOKEN", raising=False)

        payload = asyncio.run(configure.list_catalog_skills())
        github = next(s for s in payload["skills"] if s["id"] == "github")

        assert github["required_env_vars"] == ["GITHUB_TOKEN"]
        assert github["missing_env_vars"] == ["GITHUB_TOKEN"]
        assert github["ready"] is False

    def test_marks_what_the_sandbox_has_loaded(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.routes import configure

        async def status(**kwargs):
            return {
                "sandbox": {"variant": "jupyter-server", "sandbox_running": True},
                "skills": [{"name": "events"}],
            }

        monkeypatch.setattr(configure, "get_codemode_status", status)
        payload = asyncio.run(configure.list_catalog_skills())

        assert payload["active"] == ["events"]
        assert next(s for s in payload["skills"] if s["id"] == "events")["active"]
        assert payload["sandbox"]["sandbox_running"] is True


class TestVersionedRefs:
    def test_a_versioned_ref_names_the_same_skill(self) -> None:
        assert skills_cmd._base_id("events:0.0.1") == "events"
        assert skills_cmd._base_id("events") == "events"
        # A colon that is not a version is part of the id, not a version.
        assert skills_cmd._base_id("scoped:thing") == "scoped:thing"


class TestToggle:
    def _run(
        self,
        monkeypatch: pytest.MonkeyPatch,
        argv: str,
        spec_skills: list[str],
    ) -> tuple[list[dict], _Console]:
        posted: list[dict] = []
        console = _Console()
        tux = SimpleNamespace(
            console=console, server_url="http://server", agent_id="loop-base"
        )

        async def read_spec(_tux):
            return {"id": "loop-base", "skills": list(spec_skills)}

        class FakeResponse:
            def raise_for_status(self) -> None:
                pass

            def json(self) -> dict:
                return {}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return None

            async def post(self, url: str, json: dict, timeout: float = 0):
                posted.append(json)
                return FakeResponse()

        monkeypatch.setattr(skills_cmd, "_read_spec", read_spec)
        monkeypatch.setattr("httpx.AsyncClient", FakeClient)
        asyncio.run(skills_cmd.execute(tux, argv))
        return posted, console

    def test_enabling_adds_a_versioned_ref_to_the_spec(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        posted, _ = self._run(monkeypatch, "enable github", [])

        assert posted, "the agent was never reconfigured"
        assert posted[0]["agent_spec"]["skills"] == ["github:0.0.1"]

    def test_disabling_removes_it_whatever_version_was_pinned(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        posted, _ = self._run(monkeypatch, "disable events", ["events:9.9.9", "pdf:0.0.1"])

        assert posted[0]["agent_spec"]["skills"] == ["pdf:0.0.1"]

    def test_enabling_something_already_on_changes_nothing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        posted, console = self._run(monkeypatch, "enable events", ["events:0.0.1"])

        assert posted == []
        assert "already enabled" in console.text()

    def test_an_unknown_skill_reconfigures_nothing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        posted, console = self._run(monkeypatch, "enable not-a-skill", [])

        assert posted == []
        assert "Unknown skill" in console.text()

    def test_an_unrecognised_action_prints_usage(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        posted, console = self._run(monkeypatch, "frobnicate events", [])

        assert posted == []
        assert "/skills enable" in console.text()
