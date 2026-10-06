# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Preview is held to its application's Space grants (LOOP R-25).

Decided 2026-10-06: a Preview, though it runs as the person trying it, reaches
only the Spaces its application is granted, as its deployments do. As its
session opens, and on each of its requests, the runtime asks ai-agents with
the person's token for a token of theirs narrowed to the Spaces the Appspec
it runs grants, keeps it, asks again before it runs out, and its runs carry
it in place of the person's; without one, nothing runs. The person's own
token stays for what reaches no Space — the application's documents.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator, Dict, Iterator, List, Mapping

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

import agent_runtimes.tests.test_app_sessions as sessions_api
from agent_runtimes.loop.apps import plugins, principal
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.principal import (
    PrincipalTokenMissing,
    ensure_preview_token,
    preview_key,
    preview_token,
)
from agent_runtimes.loop.apps.record import (
    AppRecorder,
    keep_agent_recorder,
    own_token_for,
    persons_own_token,
    token_for,
)
from agent_runtimes.routes import agents
from agent_runtimes.routes.agui import register_agui_agent

runtime = sessions_api.runtime
remote = sessions_api.remote
events_of = sessions_api.events_of
answer_of = sessions_api.answer_of
as_ = sessions_api.as_

DESK = {
    "schema": "loop.app/v1",
    "id": "support-desk",
    "name": "Support Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "permissions": {"spaces": [{"space": "support", "access": "write"}]},
}


class AiAgents:
    """The ai-agents service minting a Preview's token: the person's, narrowed to the Spaces asked for."""

    def __init__(self) -> None:
        self.asked: List[tuple[str, Dict[str, Any], str]] = []
        self.granted: Dict[str, List[str]] = {}
        self.refuse = ""

    async def __call__(
        self, app_uid: str, permissions: Mapping[str, Any], bearer: str
    ) -> Dict[str, Any]:
        self.asked.append((app_uid, dict(permissions), bearer))
        if self.refuse:
            raise PrincipalTokenMissing(self.refuse)
        token = f"narrowed-{len(self.asked)}-{bearer}"
        self.granted[token] = [
            str(grant["space"]) for grant in permissions.get("spaces") or []
        ]
        return {"access_token": token, "expires_in": 3600}

    def spacer(self, token: str, space: str) -> str:
        """Spacer, reading the token: a narrowed one reaches only the Spaces it names."""
        if token in self.granted and space not in self.granted[token]:
            return f"403: this token does not reach the Space {space}."
        return f"200: the Space {space}."


@pytest.fixture()
def ai_agents() -> Iterator[AiAgents]:
    fake = AiAgents()
    principal.use_preview_asker(fake)
    yield fake
    principal.use_preview_asker(None)


class ReachesSpaces:
    """A model that reaches each Space it is told of, through a tool, then says what Spacer said."""

    def __init__(self, spaces: List[str]) -> None:
        self.spaces = spaces

    def _next(self, messages: List[ModelMessage]) -> Any:
        returned = [
            part
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, ToolReturnPart)
        ]
        if len(returned) < len(self.spaces):
            return self.spaces[len(returned)]
        return " | ".join(str(part.content) for part in returned)

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        step = self._next(messages)
        if step in self.spaces:
            return ModelResponse(
                parts=[ToolCallPart("reach_space", {"space": step}, tool_call_id=step)]
            )
        return ModelResponse(parts=[TextPart(step)])

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        step = self._next(messages)
        if step in self.spaces and not str(step).startswith(("200", "403")):
            yield {
                0: DeltaToolCall(
                    name="reach_space",
                    json_args=json.dumps({"space": step}),
                    tool_call_id=f"call-{step}",
                )
            }
            return
        yield step


def _make(
    agent_id: str, spec: Dict[str, Any], instance: Dict[str, Any], ai_agents: AiAgents
) -> List[str]:
    """The application's agent, as the create route makes it, with one tool
    that reaches a Space with the token of the run. Answers what each call carried.
    """
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.context.identities import get_request_user_jwt
    from agent_runtimes.transports import AGUITransport

    app = load_app(spec)
    plugins.register_app(app)
    recorder = AppRecorder(
        app=app,
        app_uid=str(instance.get("app_uid") or ""),
        deployment_uid="",
        version=int(instance.get("version") or 0),
        send=_kept,
    )
    model = ReachesSpaces(["support", "finance"])
    # Without its rules: the tool is the test's, and what it reaches is
    # Spacer's to say, by the token it carries.
    agent = Agent(FunctionModel(model, stream_function=model.stream))
    carried: List[str] = []

    @agent.tool_plain
    def reach_space(space: str) -> str:
        """Read a Space."""
        token = str(get_request_user_jwt() or "")
        carried.append(token)
        # What `save_to_space` and every tool writing to Spacer use.
        assert token_for("")[0] == token
        return ai_agents.spacer(token, space)

    register_agui_agent(
        agent_id,
        AGUITransport(PydanticAIAdapter(agent, agent_id=agent_id), agent_id=agent_id),
    )
    agents._agentspecs[agent_id] = {"app_spec": spec, "app_instance": instance}
    keep_agent_recorder(agent_id, recorder)
    return carried


async def _kept(body: Dict[str, Any]) -> None:
    return None


def test_a_previews_run_carries_the_narrowed_token_and_an_ungranted_space_is_refused(
    runtime: Any, remote: TestClient, ai_agents: AiAgents
) -> None:
    carried = _make("support-desk", DESK, {"app_uid": "app-1"}, ai_agents)
    started = events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={"agent": "support-desk", "app_uid": "app-1", "opener": "Look"},
        )
    )
    # Asked with the person's token, for the Spaces the Appspec it runs grants.
    assert ai_agents.asked == [
        (
            "app-1",
            {
                "spaces": [{"space": "support", "access": "write"}],
                "computer": {"browse": False, "files": False, "shell": False},
            },
            "ada",
        )
    ]
    # Each tool of the run carried it, never the person's own.
    assert carried == ["narrowed-1-ada", "narrowed-1-ada"]
    said = answer_of(started)
    assert "200: the Space support." in said
    assert "403: this token does not reach the Space finance." in said


def test_no_grant_reaches_no_space(
    runtime: Any, remote: TestClient, ai_agents: AiAgents
) -> None:
    plain = {key: value for key, value in DESK.items() if key != "permissions"}
    carried = _make("support-desk", plain, {"app_uid": "app-1"}, ai_agents)
    started = events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={"agent": "support-desk", "app_uid": "app-1", "opener": "Look"},
        )
    )
    assert ai_agents.asked[0][1]["spaces"] == []
    assert carried == ["narrowed-1-ada", "narrowed-1-ada"]
    assert answer_of(started).count("403") == 2


def test_without_its_token_a_preview_runs_nothing(
    runtime: Any, remote: TestClient, ai_agents: AiAgents
) -> None:
    carried = _make("support-desk", DESK, {"app_uid": "app-1"}, ai_agents)
    ai_agents.refuse = "ai-agents gave the Preview of app-1 no token (403): A Preview is tried by the owner and the editors of its application, with their own token."
    refused = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("bob"),
        json={"agent": "support-desk", "app_uid": "app-1", "opener": "Look"},
    )
    assert refused.status_code == 403
    assert "owner and the editors" in refused.json()["detail"]
    assert carried == []


def test_an_application_not_on_datalayer_is_not_previewed_with_a_persons_token(
    runtime: Any, remote: TestClient, ai_agents: AiAgents
) -> None:
    _make("support-desk", DESK, {}, ai_agents)
    refused = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("ada"),
        json={"agent": "support-desk", "opener": "Look"},
    )
    assert refused.status_code == 403
    assert "save it first" in refused.json()["detail"]
    assert ai_agents.asked == []


def test_it_is_kept_and_asked_again_before_it_runs_out(ai_agents: AiAgents) -> None:
    permissions = {"spaces": [{"space": "support", "access": "read"}]}
    first = asyncio.run(ensure_preview_token("app-1", "ada", permissions, "ada-1"))
    assert (
        asyncio.run(ensure_preview_token("app-1", "ada", permissions, "ada-2")) == first
    )
    assert len(ai_agents.asked) == 1
    principal._HELD[preview_key("app-1", "ada", permissions)]["expires_at"] = (
        time.time() + 60
    )
    renewed = asyncio.run(ensure_preview_token("app-1", "ada", permissions, "ada-3"))
    assert renewed != first and ai_agents.asked[-1][2] == "ada-3"
    # Nobody else's: held by person.
    assert preview_token("app-1", "bob", permissions) is None
    # A list changed is a token asked again, never the one narrowed to the list before.
    wider = {"spaces": [*permissions["spaces"], {"space": "finance", "access": "read"}]}
    assert asyncio.run(ensure_preview_token("app-1", "ada", wider, "ada-4")) != renewed
    assert ai_agents.asked[-1][1] == wider
    # Expired, with no token to ask again with: nothing.
    principal._HELD[preview_key("app-1", "ada", permissions)]["expires_at"] = (
        time.time() - 1
    )
    with pytest.raises(PrincipalTokenMissing, match="expired"):
        asyncio.run(ensure_preview_token("app-1", "ada", permissions, None))


def test_the_persons_own_token_reads_the_applications_documents_only() -> None:
    """Contents reads an application's documents with the person's own token,
    never the one narrowed to Spaces; a deployment's stays its principal's."""
    from agent_runtimes.context.identities import set_request_user_jwt

    set_request_user_jwt("narrowed-1-ada")
    try:
        with persons_own_token("ada"):
            assert own_token_for("") == ("ada", "")
            assert token_for("") == ("narrowed-1-ada", "")
        assert own_token_for("") == ("narrowed-1-ada", "")
    finally:
        set_request_user_jwt(None)
