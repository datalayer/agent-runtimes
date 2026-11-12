# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The repository an application is lent, as its workspace holds it now.

``GET /api/v1/apps/agents/{agent}/computer/repository`` says the lent
repository's URL and pinned revision, the workspace's HEAD and the lines of
``git status --porcelain`` — never a file's contents — to whoever may see the
application's computer: a deployment's owner and its application's editors,
as ai-agents answers; nobody it acts for. What a nightly rehearsal reads to
know that the coding agent left the repository as it was lent.
"""

import subprocess
from pathlib import Path
from typing import Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps import opening, sessions
from agent_runtimes.apps.callers import Caller
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes

URL = "https://github.com/datalayer/jupyter-kernel-client"


class Verifier:
    """Each token is the person it names."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        return Caller(kind="person", uid=token)


def _git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture()
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "workspace"
    root.mkdir()
    _git(root, "init", "-q")
    _git(root, "config", "user.email", "test@example.com")
    _git(root, "config", "user.name", "Test")
    (root / "README.md").write_text("# Jupyter Kernel Client\n")
    _git(root, "add", "README.md")
    _git(root, "commit", "-q", "-m", "first")
    monkeypatch.setenv("AGENT_RUNTIMES_WORKSPACE_ROOT", str(root))
    return root


def _spec(revision: str, repository: bool = True) -> dict:
    computer: dict = {"files": True}
    if repository:
        computer["repository"] = {"url": URL, "revision": revision}
    return {
        "schema": "loop.app/v1",
        "id": "code-explainer",
        "name": "Code Explainer",
        "kind": "chat",
        "agent": "cog-crawler:0.0.1",
        "permissions": {"computer": computer},
    }


@pytest.fixture()
def lent(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    revision = _git(workspace, "rev-parse", "HEAD")
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    agents._agentspecs["code-explainer"] = {
        "app_spec": _spec(revision),
        "app_instance": {"deployment_uid": "dep-ce", "app_uid": "app-ce"},
    }
    agents._agentspecs["no-repository"] = {
        "app_spec": {**_spec(revision, repository=False), "id": "no-repository"},
        "app_instance": {},
    }
    yield revision
    for agent_id in ("code-explainer", "no-repository"):
        agents._agentspecs.pop(agent_id, None)
    sessions.forget_sessions()


def _client(host: str) -> TestClient:
    from agent_runtimes.app import create_app

    return TestClient(create_app(), client=(host, 50000))


ROUTE = "/api/v1/apps/agents/code-explainer/computer/repository"


def test_it_says_the_lent_repository_as_the_workspace_holds_it(
    lent: str, workspace: Path
) -> None:
    with _client("127.0.0.1") as local:
        said = local.get(ROUTE)
        assert said.status_code == 200, said.text
        assert said.json() == {
            "url": URL,
            "revision": lent,
            "head": lent,
            "atRevision": True,
            "changes": [],
        }
        # The runtime writes its own AGENTS.md beside it; an edit and a new file show too.
        (workspace / "AGENTS.md").write_text("instructions\n")
        (workspace / "README.md").write_text("# Jupyter Kernel Client\nAdded.\n")
        (workspace / "notes.txt").write_text("new\n")
        changed = local.get(ROUTE).json()
        assert changed["changes"] == [" M README.md", "?? AGENTS.md", "?? notes.txt"]
        # What a file holds is never said.
        assert "Added." not in said.text + str(changed)


def test_a_head_moved_away_from_the_pinned_revision_is_said(
    lent: str, workspace: Path
) -> None:
    (workspace / "README.md").write_text("changed\n")
    _git(workspace, "commit", "-q", "-am", "moved")
    with _client("127.0.0.1") as local:
        said = local.get(ROUTE).json()
    assert said["atRevision"] is False and said["head"] != lent
    assert said["changes"] == []


def test_an_application_lent_no_repository_says_so(lent: str) -> None:
    with _client("127.0.0.1") as local:
        refused = local.get("/api/v1/apps/agents/no-repository/computer/repository")
    assert refused.status_code == 404
    assert "lent no repository" in refused.json()["detail"]


def test_a_workspace_that_is_no_checkout_is_refused(
    lent: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("AGENT_RUNTIMES_WORKSPACE_ROOT", str(empty))
    with _client("127.0.0.1") as local:
        refused = local.get(ROUTE)
    assert refused.status_code == 409
    assert "not a checkout" in refused.json()["detail"]


def test_a_deployments_repository_is_said_to_its_owner_only(lent: str) -> None:
    asked: List[tuple] = []

    async def ai_agents(deployment_uid: str, bearer: str) -> tuple:
        asked.append((deployment_uid, bearer))
        return (200, "") if bearer == "demo" else (403, opening.COMPUTER_NOT_SHOWN)

    opening.use_computer_asker(ai_agents)
    try:
        with _client("10.0.0.4") as remote:
            assert remote.get(ROUTE).status_code == 401
            assert (
                remote.get(ROUTE, headers={"Authorization": "Bearer demo"}).status_code
                == 200
            )
            visitor = remote.get(ROUTE, headers={"Authorization": "Bearer visitor"})
            assert visitor.status_code == 403
            assert visitor.json()["detail"] == opening.COMPUTER_NOT_SHOWN
        assert ("dep-ce", "demo") in asked
    finally:
        opening.use_computer_asker(None)
