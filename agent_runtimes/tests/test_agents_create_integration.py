# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Integration-style tests for dynamic agent creation route."""

from types import SimpleNamespace

import pytest

from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.specs.models import DEFAULT_MODEL


class _DummyToolset:
    pass


class _DummyMcpManager:
    def __init__(self) -> None:
        self._servers: dict[str, object] = {}

    def get_servers(self) -> list[object]:
        return list(self._servers.values())

    def get_server(self, _server_id: str) -> object | None:
        return self._servers.get(_server_id)

    def add_server(self, server: object) -> None:
        server_id = getattr(server, "id", None)
        if isinstance(server_id, str):
            self._servers[server_id] = server

    def load_servers(self, _servers: list[object]) -> None:
        return None


class _DummyRequest:
    def __init__(self) -> None:
        self.base_url = "http://localhost:8765/"
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                codemode_workspace_path="/tmp/workspace",
                codemode_generated_path="/tmp/generated",
                codemode_skills_path="/tmp/skills",
                durable_lifecycle=None,
            ),
            mount=lambda *args, **kwargs: None,
        )


@pytest.fixture
def creation_spy(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    """Patch heavy dependencies and return a spy dict with captured inputs."""
    captured: dict[str, object] = {
        "pydantic_model": None,
        "pydantic_kwargs": None,
        "tool_ids": None,
        "adapter_kwargs": None,
    }

    class _DummyPydanticAgent:
        def __init__(self, model: str, **kwargs: object) -> None:
            captured["pydantic_model"] = model
            captured["pydantic_kwargs"] = kwargs
            self.model = model
            self._function_tools: dict[str, object] = {}

    class _DummyAdapter:
        def __init__(self, **kwargs: object) -> None:
            captured["adapter_kwargs"] = kwargs
            self.agent = kwargs.get("agent")

    async def _noop_async(*_args: object, **_kwargs: object) -> object:
        return []

    monkeypatch.setattr(agents_route, "PydanticAgent", _DummyPydanticAgent)
    monkeypatch.setattr(agents_route, "PydanticAIAdapter", _DummyAdapter)
    monkeypatch.setattr(
        agents_route,
        "register_agent_tools",
        lambda _agent, tool_ids, **_kwargs: captured.__setitem__("tool_ids", tool_ids),
    )
    monkeypatch.setattr(agents_route, "register_agent", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        agents_route,
        "register_agent_for_context",
        lambda *_args, **_kwargs: None,
        raising=False,
    )
    monkeypatch.setattr(
        agents_route, "register_agui_agent", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        agents_route, "register_vercel_agent", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        agents_route, "register_a2a_agent", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        agents_route, "register_mcp_ui_agent", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(agents_route, "get_agui_app", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        agents_route, "create_skills_toolset", lambda **_kwargs: _DummyToolset()
    )
    monkeypatch.setattr(
        agents_route, "wire_skills_into_codemode", lambda *_args, **_kwargs: ""
    )
    monkeypatch.setattr(
        agents_route,
        "_build_codemode_toolset",
        lambda *_args, **_kwargs: _DummyToolset(),
    )
    monkeypatch.setattr(agents_route, "initialize_codemode_toolset", _noop_async)
    monkeypatch.setattr(agents_route, "initialize_config_mcp_servers", _noop_async)
    monkeypatch.setattr(agents_route, "get_mcp_manager", lambda: _DummyMcpManager())

    return captured


@pytest.mark.asyncio
async def test_create_agent_from_library_spec_applies_full_defaults(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],
) -> None:
    spec = SimpleNamespace(
        system_prompt="Spec system prompt",
        goal="Spec goal",
        system_prompt_codemode_addons="Use codemode tools.",
        skills=["python-analyzer"],
        tools=["fetch_webpage", "run_in_terminal"],
        description="Spec description",
        model="openai:gpt-4.1",
        sandbox_variant="jupyter",
        protocol="a2a",
        codemode={
            "enabled": True,
            "allowDirectToolCalls": True,
            "enableToolReranker": True,
        },
        mcp_servers=[SimpleNamespace(id="filesystem")],
    )
    monkeypatch.setattr(agents_route, "get_library_agent_spec", lambda _id: spec)
    monkeypatch.setattr(
        agents_route, "_test_jupyter_sandbox", lambda _url: (True, None)
    )

    class _DummySandbox:
        pass

    class _DummySandboxManager:
        variant = "jupyter"

        def configure_from_url(self, _url: str) -> None:
            pass

        def get_sandbox(self) -> object:
            return _DummySandbox()

        def get_managed_sandbox(self) -> object:
            return _DummySandbox()

    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _DummySandboxManager(),
    )
    monkeypatch.setattr(
        agents_route, "create_shared_sandbox", lambda _url: _DummySandbox()
    )

    request = CreateAgentRequest(
        name="Spec Agent",
        agent_spec_id="demo/spec",
        jupyter_sandbox="http://localhost:8888?token=test",
    )

    response = await create_agent(request, _DummyRequest())

    assert response.id == "spec-agent"
    assert response.transport == "a2a"
    assert creation_spy["pydantic_model"] == "openai:gpt-4.1"
    assert creation_spy["tool_ids"] == ["fetch_webpage", "run_in_terminal"]

    pydantic_kwargs = creation_spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    assert "Spec system prompt" in str(pydantic_kwargs.get("system_prompt"))
    assert "Use codemode tools." in str(pydantic_kwargs.get("system_prompt"))

    adapter_kwargs = creation_spy["adapter_kwargs"]
    assert isinstance(adapter_kwargs, dict)
    selected = adapter_kwargs.get("selected_mcp_servers")
    assert isinstance(selected, list)
    assert selected[0].id == "filesystem"


@pytest.mark.asyncio
async def test_create_agent_from_forwarded_agent_spec_payload(
    creation_spy: dict[str, object],
) -> None:
    request = CreateAgentRequest(
        name="Forwarded Spec Agent",
        agent_spec={
            "description": "Forwarded description",
            "model": "openai:gpt-4o-mini",
            "systemPrompt": "Forwarded prompt",
            "tools": ["fetch_webpage"],
            "protocol": "vercel-ai",
            "mcpServers": [{"id": "github", "origin": "catalog"}],
        },
    )

    response = await create_agent(request, _DummyRequest())

    assert response.id == "forwarded-spec-agent"
    assert response.transport == "vercel-ai"
    assert creation_spy["pydantic_model"] == "openai:gpt-4o-mini"
    assert creation_spy["tool_ids"] == ["fetch_webpage"]

    pydantic_kwargs = creation_spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    assert pydantic_kwargs.get("system_prompt") == "Forwarded prompt"

    # Ensure model actually changed from request default.
    assert creation_spy["pydantic_model"] != DEFAULT_MODEL.value


@pytest.mark.asyncio
async def test_create_agent_retries_without_usage_limits_when_unsupported(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],
) -> None:
    calls: list[dict[str, object]] = []

    class _StrictPydanticAgent:
        def __init__(self, model: str, **kwargs: object) -> None:
            calls.append(kwargs)
            if "usage_limits" in kwargs:
                raise RuntimeError("Unknown keyword arguments: `usage_limits`")
            creation_spy["pydantic_model"] = model
            creation_spy["pydantic_kwargs"] = kwargs
            self.model = model
            self._function_tools: dict[str, object] = {}

    monkeypatch.setattr(agents_route, "PydanticAgent", _StrictPydanticAgent)
    monkeypatch.setattr(
        agents_route,
        "build_usage_limits_from_agent_spec",
        lambda _spec: object(),
    )
    monkeypatch.setattr(
        agents_route,
        "get_library_agent_spec",
        lambda _spec_id: SimpleNamespace(
            description="Strict usage limits compatibility",
            goal=None,
            model="openai:gpt-4o-mini",
            system_prompt="Strict prompt",
            system_prompt_codemode_addons=None,
            skills=[],
            tools=["fetch_webpage"],
            sandbox_variant="eval",
            protocol="vercel-ai",
            codemode=None,
            mcp_servers=[],
            guardrails=[{"token_limits": {"per_run": "10K"}}],
            frontend_tools=[],
            trigger=None,
            advanced=None,
        ),
    )

    request = CreateAgentRequest(
        name="Strict UsageLimits Agent",
        agent_spec_id="demo/spec",
        model="openai:gpt-4o-mini",
        system_prompt="Strict prompt",
        tools=["fetch_webpage"],
        transport="vercel-ai",
    )

    response = await create_agent(request, _DummyRequest())

    assert response.id == "strict-usagelimits-agent"
    assert len(calls) >= 2
    assert "usage_limits" in calls[0]
    assert "usage_limits" not in calls[-1]
