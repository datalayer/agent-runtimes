# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Only the secrets its specs declare reach a runtime (R-19, decided 2026-10-07).

The account gives a runtime three sentinels: one its MCP server declares, one
its skill declares, and one nothing declares. The undeclared one never reaches
the runtime's environment, the kernel, an MCP server, a tool's result or the
model; the server's reaches the server and not the kernel; the skill's reaches
the kernel. A spec whose server or skill lacks its secret is refused in a
sentence, and nothing falls back to all the secrets.
"""

from __future__ import annotations

import asyncio
import os
import re
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.guardrails import declared_secrets as declared_module
from agent_runtimes.guardrails.credentials import credentials_withheld
from agent_runtimes.guardrails.declared_secrets import (
    CATALOGUE_MAY_DECLARE,
    PLATFORM_RUNTIME_SECRETS,
    DeclaredSecrets,
    ReservedSecretName,
    declared_secrets,
    env_for_server,
    env_name,
    is_reserved,
    note_given,
    refuse_reserved,
    refuse_server_names,
    sandbox_env_names,
    server_env_names,
)
from agent_runtimes.types import Agentspec, MCPServer, SkillSpec
from agent_runtimes.types.types import AppSpec

UNDECLARED = "r19-undeclared-" + uuid.uuid4().hex
SERVER_SECRET = "r19-server-" + uuid.uuid4().hex
SKILL_SECRET = "r19-skill-" + uuid.uuid4().hex

ACCOUNT = [
    {"name": "R19_UNDECLARED_TOKEN", "value": UNDECLARED},
    {"name": "R19_SERVER_TOKEN", "value": SERVER_SECRET},
    {"name": "R19_SKILL_TOKEN", "value": SKILL_SECRET},
]

PROBE_SERVER = MCPServer(
    id="r19-probe",
    name="R-19 probe",
    command="/nonexistent/r19-probe",
    args=["--header", "Authorization: Bearer ${R19_SERVER_TOKEN}"],
    required_env_vars=["R19_SERVER_TOKEN:0.0.1"],
)
OTHER_SERVER = MCPServer(
    id="r19-other",
    name="R-19 other",
    command="/nonexistent/r19-other",
    required_env_vars=["R19_OTHER_TOKEN"],
)
PROBE_SKILL = SkillSpec(
    id="r19-skill", name="R-19 skill", envvars=["R19_SKILL_TOKEN:0.0.1"]
)
PROBE_AGENT = Agentspec(
    id="r19-agent",
    name="R-19 agent",
    mcp_servers=[PROBE_SERVER],
    skills=["r19-skill:0.0.1"],
)
BARE_AGENT = Agentspec(id="r19-bare", name="R-19 bare")

NAMES = (
    "R19_UNDECLARED_TOKEN",
    "R19_SERVER_TOKEN",
    "R19_SKILL_TOKEN",
    "R19_OTHER_TOKEN",
)


@pytest.fixture(autouse=True)
def clean(monkeypatch: pytest.MonkeyPatch):
    """No real Datalayer credential, no sentinel left behind, a skill to declare.

    Yields
    ------
    None
        Control to the test.
    """
    for name in [n for n in os.environ if n.startswith("DATALAYER_")]:
        monkeypatch.delenv(name, raising=False)
    for name in NAMES:
        monkeypatch.delenv(name, raising=False)
    from agent_runtimes.specs import skills

    monkeypatch.setitem(skills.SKILLS_CATALOG, "r19-skill", PROBE_SKILL)
    declared_module._GIVEN.clear()
    yield
    declared_module._GIVEN.clear()
    for name in NAMES:
        os.environ.pop(name, None)


# --- what the specs declare ----------------------------------------------------


def test_the_platform_needs_none_of_the_account_s_secrets() -> None:
    assert PLATFORM_RUNTIME_SECRETS == frozenset()
    # DATALAYER_API_KEY only when a server or skill says so.
    assert "DATALAYER_API_KEY" not in declared_secrets(BARE_AGENT).runtime


def test_a_server_declares_its_envvars_and_the_placeholders_it_names() -> None:
    server = MCPServer(
        id="s",
        name="s",
        url="https://x.invalid/${R19_URL_TOKEN}",
        args=["${R19_ARG_TOKEN}"],
        env={"A": "${R19_ENV_TOKEN}", "B": "plain"},
        required_env_vars=["R19_SERVER_TOKEN:0.0.1"],
    )
    assert server_env_names(server) == {
        "R19_SERVER_TOKEN",
        "R19_URL_TOKEN",
        "R19_ARG_TOKEN",
        "R19_ENV_TOKEN",
    }


def test_servers_go_to_the_runtime_and_skills_also_to_the_kernel() -> None:
    declared = declared_secrets(PROBE_AGENT)
    assert declared.runtime == {"R19_SERVER_TOKEN", "R19_SKILL_TOKEN"}
    assert declared.kernel == {"R19_SKILL_TOKEN"}
    assert declared.servers["r19-probe"] == {"R19_SERVER_TOKEN"}
    assert "R19_UNDECLARED_TOKEN" not in declared.runtime


def test_the_library_s_crop_monitoring_declares_its_servers_and_skills() -> None:
    from agent_runtimes.routes.agents import get_library_agent_spec

    spec = get_library_agent_spec("worker-crop-monitoring")
    declared = declared_secrets(spec, resolve_agent=get_library_agent_spec)
    # earthdata's bearer, tavily's key, the crawl skill's key.
    assert declared.consumers["the MCP server earthdata"] == {"DATALAYER_API_KEY"}
    assert "TAVILY_API_KEY" in declared.kernel
    assert "DATALAYER_API_KEY" not in declared.kernel
    # The download's script reads the Earthdata login in the sandbox: offered
    # there when the account has it, never required (agentspecs 0.0.65).
    assert {"EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"} <= declared.kernel
    assert not any(
        "EARTHDATA" in name for names in declared.consumers.values() for name in names
    )


def test_an_application_s_connections_and_signed_user_are_declared() -> None:
    # As the Appspec says it — `host.user: signed` — read through the real model.
    app = AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "connections": [{"server": "tavily:0.0.1"}],
            "deployment": {"embedded": {"host": {"user": "signed"}}},
        }
    )
    for given in (app, app.model_dump(by_alias=True)):
        assert "DATALAYER_APP_USER_SECRET_DEP_1" in (
            declared_secrets(
                BARE_AGENT, app_spec=given, app_instance={"deployment_uid": "dep-1"}
            ).runtime
        )
    # A user the page claims declares none.
    claimed = app.model_copy(deep=True)
    claimed.deployment.embedded.host.user = "claimed"
    assert "DATALAYER_APP_USER_SECRET_DEP_1" not in (
        declared_secrets(
            BARE_AGENT, app_spec=claimed, app_instance={"deployment_uid": "dep-1"}
        ).runtime
    )
    declared = declared_secrets(
        BARE_AGENT, app_spec=app, app_instance={"deployment_uid": "dep-1"}
    )
    assert declared.consumers["the MCP server tavily"] == {"TAVILY_API_KEY"}
    # The user secret: held by the process for its checks, never in the kernel.
    assert "DATALAYER_APP_USER_SECRET_DEP_1" in declared.runtime
    assert "DATALAYER_APP_USER_SECRET_DEP_1" not in declared.kernel
    assert not declared.missing(
        lambda name: name != "DATALAYER_APP_USER_SECRET_DEP_1", "x"
    )


def test_a_subagent_by_reference_declares_what_its_agentspec_does() -> None:
    parent = Agentspec(
        id="r19-parent",
        name="parent",
        subagents={
            "subagents": [{"name": "s", "description": "d", "ref": "r19-agent:0.0.1"}]
        },
    )
    found = {"r19-agent": PROBE_AGENT}
    declared = declared_secrets(parent, resolve_agent=found.get)
    assert declared.runtime == {"R19_SERVER_TOKEN", "R19_SKILL_TOKEN"}


def test_an_agent_on_a_harness_declares_the_key_its_harness_requires(
    monkeypatch,
) -> None:
    # Off Datalayer, the harness spec's declared secrets reach the process, so
    # a runtime made for a Claude Code agent is given ANTHROPIC_API_KEY — and
    # refused when the account has none.
    monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", raising=False)
    coder = Agentspec(id="r19-coder", name="coder", harness="claude-code")
    declared = declared_secrets(coder)
    assert declared.consumers["the harness claude-code"] == {"ANTHROPIC_API_KEY"}
    assert "ANTHROPIC_API_KEY" in declared.runtime
    assert "ANTHROPIC_API_KEY" not in declared.kernel
    [sentence] = declared.missing(lambda name: False, "Coder")
    assert "the harness claude-code needs ANTHROPIC_API_KEY" in sentence
    assert declared_secrets(Agentspec(id="r19-plain", name="plain")).consumers == {}


def test_on_datalayer_no_harness_declares_a_key(monkeypatch) -> None:
    # On Datalayer, a harness's model calls go through ai-inference, to Bedrock
    # or Alibaba, or it is not offered: the runtime is never given a key.
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    for harness, key in (
        ("claude-code", "ANTHROPIC_API_KEY"),
        ("opencode", "ANTHROPIC_API_KEY"),
        ("pi", "ANTHROPIC_API_KEY"),
        ("codex", "OPENAI_API_KEY"),
        ("goose", "ANTHROPIC_API_KEY"),
    ):
        declared = declared_secrets(
            Agentspec(id=f"r19-{harness}-dl", name="coder", harness=harness)
        )
        assert key not in declared.runtime
        assert declared.missing(lambda name: False, "Coder") == []


def test_a_missing_secret_is_said_in_a_sentence() -> None:
    [sentence] = declared_secrets(BARE_AGENT, mcp_servers=[PROBE_SERVER]).missing(
        lambda name: False, "Crop Monitoring"
    )
    assert sentence.startswith(
        "Crop Monitoring is not set up: the MCP server r19-probe needs R19_SERVER_TOKEN"
    )


def test_a_server_is_started_without_the_secrets_given_for_others() -> None:
    note_given(["R19_SERVER_TOKEN", "R19_OTHER_TOKEN"])
    env = {
        "PATH": "/bin",
        "R19_SERVER_TOKEN": SERVER_SECRET,
        "R19_OTHER_TOKEN": "other-value",
    }
    assert env_for_server(env, PROBE_SERVER) == {
        "PATH": "/bin",
        "R19_SERVER_TOKEN": SERVER_SECRET,
    }


# --- configure-from-spec keeps to them --------------------------------------------


class FakeSandboxManager:
    """Where the kernel's environment would be set: what it was given, kept."""

    def __init__(self) -> None:
        self.kernel: Dict[str, str] = {}
        self.unset: List[str] = []
        self.variant = "jupyter-server"
        self.config = SimpleNamespace(
            mcp_proxy_url="http://127.0.0.1:8765/api/v1/mcp/proxy",
            env_vars=self.kernel,
        )

    def withdraw_env_vars(self, names: Any) -> List[str]:
        self.unset.extend(names)
        for name in names:
            self.kernel.pop(name, None)
        return list(names)

    def configure_from_url(
        self, url: str, mcp_proxy_url: Any = None, env_vars: Any = None
    ) -> None:
        self.kernel.update(env_vars or {})

    def get_agent_sandbox(self, agent_id: str) -> Any:
        return object()

    def _inject_env_vars_into(
        self, sandbox: Any, variant: str, env_vars: Dict[str, str]
    ) -> None:
        self.kernel.update(env_vars)


class FakeLifecycle:
    """Starts nothing: what each server would be started with, kept."""

    def __init__(self) -> None:
        self.started: Dict[str, Dict[str, str]] = {}

    def is_server_running(self, server_id: str, is_config: bool = False) -> bool:
        return False

    async def start_server(
        self, server_id: str, config: Any, extra_env: Any = None
    ) -> Any:
        self.started[server_id] = dict(extra_env or {})
        return object()


@pytest.fixture()
def runtime(monkeypatch: pytest.MonkeyPatch) -> Any:
    from agent_runtimes.app import create_app
    from agent_runtimes.routes import agents
    from agent_runtimes.routes.acp import _agents
    from agent_runtimes.services import code_sandbox_manager

    sandbox = FakeSandboxManager()
    lifecycle = FakeLifecycle()
    specs = {"r19-agent": PROBE_AGENT, "r19-bare": BARE_AGENT}

    async def create_agent(request: Any, http_request: Any) -> dict:
        adapter = SimpleNamespace(
            _selected_mcp_servers=[
                SimpleNamespace(id="r19-probe", origin="catalog"),
                SimpleNamespace(id="r19-other", origin="catalog"),
            ]
        )
        _agents[request.name] = (adapter, SimpleNamespace())  # type: ignore[assignment]
        agents._agentspecs[request.name] = request.model_dump()
        return {"id": request.name}

    async def delete_agent(
        name: str, stop_runtime: bool = False, runtime_id: Any = None
    ) -> None:
        _agents.pop(name, None)

    monkeypatch.setattr(agents, "get_library_agent_spec", specs.get)
    monkeypatch.setattr(agents, "create_agent", create_agent)
    monkeypatch.setattr(agents, "delete_agent", delete_agent)
    monkeypatch.setattr(agents, "_emit_agent_assigned_event", lambda **kwargs: None)
    monkeypatch.setattr(agents, "get_mcp_lifecycle_manager", lambda: lifecycle)
    monkeypatch.setattr(
        agents,
        "MCP_SERVER_CATALOG",
        {"r19-probe": PROBE_SERVER, "r19-other": OTHER_SERVER},
    )
    monkeypatch.setattr(
        code_sandbox_manager, "get_code_sandbox_manager", lambda: sandbox
    )
    monkeypatch.setitem(agents._agentspecs, "default", None)
    agents._SET_UP_REFUSED.clear()
    saved = _agents.pop("default", None)
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as client:
        client.sandbox = sandbox
        client.lifecycle = lifecycle
        yield client
    agents._SET_UP_REFUSED.clear()
    _agents.pop("default", None)
    if saved is not None:
        _agents["default"] = saved


def _configure(client: Any, spec_id: str, env_vars: List[Dict[str, str]]) -> Any:
    return client.post(
        "/api/v1/agents/configure-from-spec",
        json={
            "agent_spec_id": spec_id,
            "env_vars": env_vars,
            "jupyter_sandbox": "http://127.0.0.1:2300?token=t",
            "mcp_proxy_url": "http://127.0.0.1:8765/api/v1/mcp/proxy",
        },
    )


def _settle() -> None:
    # The MCP start and the kernel's injection run in a background task.
    import time

    time.sleep(0.3)


def test_the_undeclared_secret_reaches_nothing_and_each_declared_one_its_consumer(
    runtime: Any,
) -> None:
    response = _configure(runtime, "r19-agent", ACCOUNT)
    assert response.status_code == 200, response.text
    _settle()
    # The runtime's environment: the declared ones only.
    assert "R19_UNDECLARED_TOKEN" not in os.environ
    assert os.environ["R19_SERVER_TOKEN"] == SERVER_SECRET
    assert os.environ["R19_SKILL_TOKEN"] == SKILL_SECRET
    # The kernel: the skill's alone.
    assert runtime.sandbox.kernel == {"R19_SKILL_TOKEN": SKILL_SECRET}
    # Each MCP server: its own alone, the other nothing.
    assert runtime.lifecycle.started["r19-probe"] == {"R19_SERVER_TOKEN": SERVER_SECRET}
    assert runtime.lifecycle.started["r19-other"] == {}
    for given in runtime.lifecycle.started.values():
        assert UNDECLARED not in given.values()


def test_a_spec_whose_secret_is_not_given_is_refused_and_a_launch_is_told(
    runtime: Any,
) -> None:
    response = _configure(runtime, "r19-agent", [ACCOUNT[0]])
    assert response.status_code == 422, response.text
    problems = response.json()["detail"]["problems"]
    assert any("the MCP server r19-probe needs R19_SERVER_TOKEN" in p for p in problems)
    assert any("the skill r19-skill needs R19_SKILL_TOKEN" in p for p in problems)
    assert "R19_UNDECLARED_TOKEN" not in os.environ
    assert runtime.sandbox.kernel == {}
    from agent_runtimes.routes.agents import _agentspecs

    _agentspecs["default"] = {"name": "default"}
    spec = runtime.get("/api/v1/configure/agents/default/spec").json()
    assert "needs R19_SERVER_TOKEN" in spec["set_up_refused"]
    # Configured once given, the refusal is gone.
    assert _configure(runtime, "r19-agent", ACCOUNT).status_code == 200
    assert (
        "set_up_refused"
        not in runtime.get("/api/v1/configure/agents/default/spec").json()
    )


def test_a_secret_no_longer_declared_is_taken_back(runtime: Any) -> None:
    assert _configure(runtime, "r19-agent", ACCOUNT).status_code == 200
    assert os.environ.get("R19_SERVER_TOKEN") == SERVER_SECRET
    # Configured again from a spec that declares nothing.
    assert _configure(runtime, "r19-bare", ACCOUNT).status_code == 200
    for name in ("R19_UNDECLARED_TOKEN", "R19_SERVER_TOKEN", "R19_SKILL_TOKEN"):
        assert name not in os.environ


def test_the_companion_is_answered_names_only(runtime: Any) -> None:
    answer = runtime.post(
        "/api/v1/agents/declared-secrets", json={"agent_spec_id": "r19-agent"}
    ).json()
    assert answer["runtime"] == ["R19_SERVER_TOKEN", "R19_SKILL_TOKEN"]
    assert answer["kernel"] == ["R19_SKILL_TOKEN"]
    assert (
        runtime.post(
            "/api/v1/agents/declared-secrets", json={"agent_spec_id": "nope"}
        ).status_code
        == 404
    )


def test_mcp_servers_start_without_a_spec_keeps_to_the_running_agents(
    runtime: Any,
) -> None:
    assert _configure(runtime, "r19-agent", ACCOUNT).status_code == 200
    _settle()
    os.environ.pop("R19_SERVER_TOKEN", None)
    response = runtime.post(
        "/api/v1/agents/mcp-servers/start", json={"env_vars": ACCOUNT}
    )
    assert response.status_code == 200, response.text
    assert "R19_UNDECLARED_TOKEN" not in os.environ
    assert os.environ["R19_SERVER_TOKEN"] == SERVER_SECRET


def test_a_tool_and_the_model_never_see_the_undeclared_secret(runtime: Any) -> None:
    assert _configure(runtime, "r19-agent", ACCOUNT).status_code == 200
    seen: List[str] = []

    def model(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        seen.append(repr(messages))
        if len(messages) == 1:
            return ModelResponse(parts=[ToolCallPart(tool_name="environment", args={})])
        return ModelResponse(parts=[TextPart("done")])

    agent = Agent(FunctionModel(model), capabilities=credentials_withheld([]))

    @agent.tool_plain
    def environment() -> str:
        """What the runtime's environment holds of the account's secrets."""
        return " ".join(f"{n}={os.environ.get(n, '')}" for n in NAMES)

    result = asyncio.run(agent.run("go"))
    said = "\n".join(seen) + repr(result.all_messages())
    assert UNDECLARED not in said
    # The declared one the tool could read is withheld, as every held secret is.
    assert SERVER_SECRET not in said


def test_a_launch_waiting_for_its_set_up_says_why_it_was_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import httpx

    from agent_runtimes.loop import launch

    said = "Crop Monitoring is not set up: the MCP server earthdata needs DATALAYER_API_KEY."
    monkeypatch.setattr(
        httpx,
        "get",
        lambda url, timeout=None: SimpleNamespace(
            status_code=200, json=lambda: {"id": "default", "set_up_refused": said}
        ),
    )
    with pytest.raises(launch.CloudRefused, match="needs DATALAYER_API_KEY"):
        launch.wait_until_set_up("http://relay.invalid", timeout=5)


# --- an MCP server's scripts, run in the sandbox (sandbox_envvars) --------------


def test_what_a_server_s_scripts_read_is_offered_to_the_kernel_never_required() -> None:
    download = MCPServer(
        id="r19-download",
        name="R-19 download",
        command="/nonexistent/r19-download",
        required_env_vars=["R19_SERVER_TOKEN:0.0.1"],
        sandbox_env_vars=["R19_LOGIN_USERNAME:0.0.1", "R19_LOGIN_PASSWORD:0.0.1"],
    )
    declared = declared_secrets(BARE_AGENT, mcp_servers=[download])
    assert declared.kernel == {"R19_LOGIN_USERNAME", "R19_LOGIN_PASSWORD"}
    assert {"R19_LOGIN_USERNAME", "R19_LOGIN_PASSWORD"} <= declared.runtime
    # Never required: an account without them is not refused.
    assert not declared.missing(lambda name: name == "R19_SERVER_TOKEN", "x")
    # Never the server's: started without them.
    note_given(["R19_SERVER_TOKEN", "R19_LOGIN_USERNAME", "R19_LOGIN_PASSWORD"])
    env = {"R19_SERVER_TOKEN": SERVER_SECRET, "R19_LOGIN_PASSWORD": "pw-sentinel"}
    assert env_for_server(env, download) == {"R19_SERVER_TOKEN": SERVER_SECRET}


# --- the application the runtime was launched for ------------------------------

WEB_APP = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web Research",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "connections": [{"server": "tavily:0.0.1"}],
}
TAVILY = "r19-tavily-" + uuid.uuid4().hex


@pytest.fixture()
def launch_clean(monkeypatch: pytest.MonkeyPatch):
    """No application launched for, no Tavily key on this machine.

    Yields
    ------
    None
        Control to the test.
    """
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    declared_module.note_launched(None)
    yield
    declared_module.note_launched(None)
    os.environ.pop("TAVILY_API_KEY", None)


def _launch_configure(client: Any, spec_id: str, env_vars: List[Dict[str, str]]) -> Any:
    return client.post(
        "/api/v1/agents/configure-from-spec",
        json={
            "agent_spec_id": spec_id,
            "env_vars": env_vars,
            "jupyter_sandbox": "http://127.0.0.1:2300?token=t",
            "launch_app_spec": WEB_APP,
            "launch_app_instance": {"app_uid": "app-1", "deployment_uid": "dep-1"},
        },
    )


def test_the_companion_is_told_what_the_launched_application_declares(
    runtime: Any, launch_clean: None
) -> None:
    answer = runtime.post(
        "/api/v1/agents/declared-secrets",
        json={"agent_spec_id": "r19-agent", "app_spec": WEB_APP},
    ).json()
    assert answer["runtime"] == [
        "R19_SERVER_TOKEN",
        "R19_SKILL_TOKEN",
        "TAVILY_API_KEY",
    ]
    # A connection's credential stays out of the kernel.
    assert answer["kernel"] == ["R19_SKILL_TOKEN"]
    # Launched with no agentspec (a deployment kept on its runtime).
    alone = runtime.post(
        "/api/v1/agents/declared-secrets", json={"app_spec": WEB_APP}
    ).json()
    assert "TAVILY_API_KEY" in alone["runtime"]
    assert "TAVILY_API_KEY" not in alone["kernel"]
    refused = runtime.post(
        "/api/v1/agents/declared-secrets", json={"app_spec": {"id": "x"}}
    )
    assert refused.status_code == 422


def test_a_runtime_launched_for_an_application_keeps_its_connection_s_secret(
    runtime: Any, launch_clean: None
) -> None:
    account = [*ACCOUNT, {"name": "TAVILY_API_KEY", "value": TAVILY}]
    response = _launch_configure(runtime, "r19-bare", account)
    assert response.status_code == 200, response.text
    _settle()
    assert os.environ["TAVILY_API_KEY"] == TAVILY
    assert "R19_UNDECLARED_TOKEN" not in os.environ
    assert "TAVILY_API_KEY" not in runtime.sandbox.kernel
    # The application's own configure, later, finds it and takes nothing back.
    assert _configure(runtime, "r19-bare", []).status_code == 200
    assert os.environ["TAVILY_API_KEY"] == TAVILY


def test_a_launched_application_whose_secret_is_missing_is_refused_in_a_sentence(
    runtime: Any, launch_clean: None
) -> None:
    response = _launch_configure(runtime, "r19-bare", ACCOUNT)
    assert response.status_code == 422, response.text
    [problem] = response.json()["detail"]["problems"]
    assert problem.startswith(
        "Web Research is not set up: the MCP server tavily needs TAVILY_API_KEY"
    )


def test_mcp_servers_start_sets_a_launched_application_s_secrets_before_its_agent(
    runtime: Any, launch_clean: None
) -> None:
    from agent_runtimes.routes import agents

    body = {
        "env_vars": [*ACCOUNT, {"name": "TAVILY_API_KEY", "value": TAVILY}],
        "jupyter_sandbox": "http://127.0.0.1:2300?token=t",
        "launch_app_spec": WEB_APP,
    }
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(agents, "_agents", {})
        response = runtime.post("/api/v1/agents/mcp-servers/start", json=body)
        assert response.status_code == 200, response.text
        assert os.environ["TAVILY_API_KEY"] == TAVILY
        assert "R19_UNDECLARED_TOKEN" not in os.environ
        assert "TAVILY_API_KEY" not in runtime.sandbox.kernel
        # Not given: refused, and its agent is refused in the same sentence.
        os.environ.pop("TAVILY_API_KEY", None)
        refused = runtime.post(
            "/api/v1/agents/mcp-servers/start",
            json={**body, "env_vars": ACCOUNT},
        )
        assert refused.status_code == 422, refused.text
        assert "needs TAVILY_API_KEY" in (agents.set_up_refused("web-research") or "")


# --- a running kernel gives back what a configure takes away -------------------


def test_a_configure_that_takes_a_name_away_unsets_it_in_the_live_kernel(
    runtime: Any,
) -> None:
    assert _configure(runtime, "r19-agent", ACCOUNT).status_code == 200
    _settle()
    assert runtime.sandbox.kernel == {"R19_SKILL_TOKEN": SKILL_SECRET}
    assert _configure(runtime, "r19-bare", ACCOUNT).status_code == 200
    assert "R19_SKILL_TOKEN" in runtime.sandbox.unset
    assert runtime.sandbox.kernel == {}


def test_the_sandbox_manager_unsets_names_in_every_live_kernel() -> None:
    from agent_runtimes.services.code_sandbox_manager import CodeSandboxManager

    manager = CodeSandboxManager()
    manager.configure(env_vars={"R19_SKILL_TOKEN": SKILL_SECRET, "R19_KEPT": "k"})
    ran: List[str] = []

    class Kernel:
        def run_code(self, code: str) -> Any:
            ran.append(code)
            return SimpleNamespace(execution_ok=True, execution_error=None)

    manager._sandbox = Kernel()  # type: ignore[assignment, unused-ignore]
    manager._agent_sandboxes["r19"] = Kernel()  # type: ignore[assignment, unused-ignore]
    assert manager.withdraw_env_vars(["R19_SKILL_TOKEN", "R19_NEVER_GIVEN"]) == [
        "R19_SKILL_TOKEN"
    ]
    # Not injected into a kernel started later.
    assert manager.config.env_vars == {"R19_KEPT": "k"}
    # Unset in both live kernels, by name: no value is sent.
    assert len(ran) == 2
    assert all(SKILL_SECRET not in code for code in ran)
    os.environ["R19_SKILL_TOKEN"] = SKILL_SECRET
    exec(ran[0], {})  # what the kernel runs
    assert "R19_SKILL_TOKEN" not in os.environ
    manager._sandbox = None
    manager._agent_sandboxes.clear()


# --- a secret never sets what the runtime reads of its own ------------------------

FOR_A_DEPLOYMENT = {"deployment_uid": "dep-1"}

#: Other people's services, read by name for their tools or their sandboxes:
#: their credentials, nothing of the runtime's.
NOT_THE_RUNTIMES = {
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_GATEWAY",
    "FAKE_TOKEN",
    "GITHUB_TOKEN",
    "KAGGLE_API_TOKEN",
    "KAGGLE_KEY",
    "KAGGLE_USERNAME",
    # What a test of datalayer_core reads, in a pod's image with no test.
    "TEST_DATALAYER_API_KEY",
}

_READS = re.compile(
    r"""(?:os\.environ(?:\.get|\.pop|\.setdefault)?[(\[]|os\.getenv\(|getenv\()\s*["']([A-Za-z_][A-Za-z0-9_]+)["']"""
)
_NAMED = re.compile(
    r"""^[A-Z_]*(?:ENV|VARIABLE|_VAR)[A-Z_]*\s*(?::[^=]+)?=\s*["']([A-Z][A-Z0-9_]+)["']""",
    re.MULTILINE,
)


def _read_by(package: Any) -> set[str]:
    """Every variable a package reads, by its name in its source."""
    names: set[str] = set()
    for file in Path(package.__file__).parent.rglob("*.py"):
        text = str(file)
        if "/tests/" in text or "/specs/agents/" in text:
            continue
        source = file.read_text(encoding="utf-8", errors="replace")
        names.update(_READS.findall(source), _NAMED.findall(source))
    return names


def test_every_variable_the_runtime_reads_is_reserved() -> None:
    """Whatever is added to read: the list is the code's, not somebody's memory."""
    import datalayer_core

    import agent_runtimes

    read = _read_by(agent_runtimes) | _read_by(datalayer_core)
    assert "DATALAYER_AI_INFERENCE_URL" in read
    assert len(read) > 150
    not_reserved = sorted(
        name for name in read - NOT_THE_RUNTIMES if not is_reserved(name)
    )
    assert not_reserved == []


@pytest.mark.parametrize(
    "name",
    [
        "DATALAYER_AI_INFERENCE_URL",
        "DATALAYER_IAM_URL",
        "datalayer_ai_agents_url",
        "AGENT_RUNTIMES_DISABLE_TOOL_APPROVALS",
        "AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE",
        "OPENAI_BASE_URL",
        "ANTHROPIC_BASE_URL",
        "MY_VENDOR_BASE_URL",
        "HTTPS_PROXY",
        "http_proxy",
        "SSL_CERT_FILE",
        "LD_PRELOAD",
        "PYTHONPATH",
        "NODE_OPTIONS",
        "PATH",
        "HOME",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
    ],
)
def test_what_redirects_or_steers_the_runtime_is_reserved(name: str) -> None:
    assert is_reserved(name)


@pytest.mark.parametrize(
    "name", ["GITHUB_TOKEN", "TAVILY_API_KEY", "ODOO_URL", "SLACK_BOT_TOKEN"]
)
def test_a_service_s_credential_is_not(name: str) -> None:
    assert not is_reserved(name)


def _catalogue_declares() -> dict[str, set[str]]:
    from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

    return {
        server: set(server_env_names(spec) | sandbox_env_names(spec))
        for server, spec in MCP_SERVER_CATALOG.items()
    }


def test_the_catalogue_declares_nothing_reserved_but_what_it_may() -> None:
    from agent_runtimes.specs.skills import SKILLS_CATALOG

    for server, names in _catalogue_declares().items():
        assert {n for n in names if is_reserved(n)} <= CATALOGUE_MAY_DECLARE, server
    for skill, spec in SKILLS_CATALOG.items():
        assert not any(is_reserved(env_name(n)) for n in spec.envvars), skill


@pytest.mark.parametrize(
    "server",
    [
        {"id": "x", "name": "x", "required_env_vars": ["DATALAYER_AI_INFERENCE_URL"]},
        {"id": "x", "name": "x", "url": "https://x.invalid/${DATALAYER_IAM_URL}"},
        {"id": "x", "name": "x", "args": ["${AGENT_RUNTIMES_MODEL}"]},
        {"id": "x", "name": "x", "env": {"A": "${HTTPS_PROXY}"}},
        {"id": "x", "name": "x", "sandbox_envvars": ["PYTHONPATH"]},
    ],
)
def test_a_server_that_declares_one_is_refused_however_it_says_so(
    server: dict[str, Any],
) -> None:
    with pytest.raises(ReservedSecretName, match="reads of its own"):
        declared_secrets(
            forwarded_spec={"id": "a", "mcp_servers": [server]},
            app_instance=FOR_A_DEPLOYMENT,
        )


def test_what_the_catalogue_may_declare_no_spec_may() -> None:
    """A server of a spec's own, and the person's key in a header of its choosing."""
    theirs = {
        "id": "datalayer",
        "name": "not the catalogue's",
        "url": "https://x.invalid",
        "required_env_vars": ["DATALAYER_API_KEY"],
    }
    with pytest.raises(ReservedSecretName):
        declared_secrets(
            forwarded_spec={"id": "a", "mcp_servers": [theirs]},
            app_instance=FOR_A_DEPLOYMENT,
        )
    declared = declared_secrets(
        forwarded_spec={"id": "a", "mcp_servers": ["datalayer"]},
        app_instance=FOR_A_DEPLOYMENT,
    )
    assert "DATALAYER_API_KEY" in declared.runtime
    assert declared.platform == {"DATALAYER_API_KEY"}


def test_a_skill_that_declares_one_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.specs import skills

    bad = SkillSpec(id="r19-bad", name="bad", envvars=["DATALAYER_IAM_URL:0.0.1"])
    monkeypatch.setitem(skills.SKILLS_CATALOG, "r19-bad", bad)
    with pytest.raises(ReservedSecretName, match="The skill r19-bad"):
        declared_secrets(skills=["r19-bad"], app_instance=FOR_A_DEPLOYMENT)


def test_nothing_reserved_is_set_whatever_brought_it() -> None:
    bare = DeclaredSecrets(for_a_deployment=True)
    refuse_reserved(["GITHUB_TOKEN"], bare)
    with pytest.raises(ReservedSecretName):
        refuse_reserved(["DATALAYER_AI_INFERENCE_URL"], bare)
    refuse_reserved(
        ["DATALAYER_API_KEY"],
        DeclaredSecrets(
            platform=frozenset({"DATALAYER_API_KEY"}), for_a_deployment=True
        ),
    )


def test_the_routes_answer_it_in_a_sentence(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    from agent_runtimes.routes import agents

    with pytest.raises(HTTPException) as refused:
        agents.declared_secrets(
            forwarded_spec={
                "id": "a",
                "mcp_servers": [
                    {
                        "id": "x",
                        "name": "x",
                        "required_env_vars": ["DATALAYER_AI_INFERENCE_URL"],
                    }
                ],
            },
            app_instance=FOR_A_DEPLOYMENT,
        )
    assert refused.value.status_code == 422
    with pytest.raises(HTTPException) as said:
        agents._nothing_reserved(
            ["DATALAYER_IAM_URL"], DeclaredSecrets(for_a_deployment=True)
        )
    assert said.value.status_code == 422
    assert "DATALAYER_IAM_URL" in str(said.value.detail)


def test_the_running_agents_keep_what_the_platform_wrote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`mcp-servers/start` applies under what the agents declare: without what
    the catalogue may declare among it, a kept `datalayer` connection is refused."""
    from agent_runtimes.routes import agents

    monkeypatch.setitem(
        agents._agentspecs, "r19-held", {"agent_spec": {"mcp_servers": ["datalayer"]}}
    )
    declared = agents._declared_for_agents(["r19-held"])
    assert declared.platform == {"DATALAYER_API_KEY"}


REDIRECTED = "DATALAYER_AI_INFERENCE_URL"
REDIRECT_SERVER = MCPServer(
    id="r19-redirect",
    name="declares what the runtime reads",
    command="/nonexistent/r19-redirect",
    required_env_vars=[REDIRECTED],
)
REDIRECT_AGENT = Agentspec(id="r19-a", name="r19-a", mcp_servers=[REDIRECT_SERVER])
SENT = [{"name": REDIRECTED, "value": "https://elsewhere.invalid"}]


def _as_if_declared(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whatever brought the name to where it is applied: the read let it by."""
    from agent_runtimes.routes import agents

    declared = DeclaredSecrets(
        consumers={"something": frozenset({REDIRECTED})}, for_a_deployment=True
    )
    monkeypatch.setattr(agents, "declared_secrets", lambda *_, **__: declared)
    monkeypatch.setattr(agents, "_declared_for_agents", lambda _: declared)


def test_a_library_spec_that_declares_one_configures_nothing(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.apps import principal
    from agent_runtimes.routes import agents

    monkeypatch.delenv(REDIRECTED, raising=False)
    monkeypatch.setattr(agents, "get_library_agent_spec", lambda _: REDIRECT_AGENT)
    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    response = _configure(runtime, "r19-a", SENT)
    assert response.status_code == 422, response.text
    assert REDIRECTED in response.json()["detail"]["problems"][0]
    assert REDIRECTED not in os.environ
    # And the companion is told nothing, so it gives nothing.
    asked = runtime.post(
        "/api/v1/agents/declared-secrets", json={"agent_spec_id": "r19-a"}
    )
    assert asked.status_code == 422, asked.text


def test_configure_does_not_set_one_whatever_brought_it(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(REDIRECTED, raising=False)
    _as_if_declared(monkeypatch)
    response = _configure(runtime, "r19-agent", SENT)
    assert response.status_code == 422, response.text
    assert REDIRECTED not in os.environ


def test_starting_servers_does_not_set_one_whatever_brought_it(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(REDIRECTED, raising=False)
    assert _configure(runtime, "r19-bare", []).status_code == 200
    _as_if_declared(monkeypatch)
    response = runtime.post("/api/v1/agents/mcp-servers/start", json={"env_vars": SENT})
    assert response.status_code == 422, response.text
    assert REDIRECTED not in os.environ


@pytest.mark.asyncio
async def test_a_server_that_declares_one_is_not_started_with_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.apps import principal
    from agent_runtimes.routes import agents
    from agent_runtimes.routes.acp import _agents

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    started: List[str] = []

    class Lifecycle:
        def is_server_running(self, *_: Any, **__: Any) -> bool:
            return False

        async def start_server(self, server_id: str, *_: Any, **__: Any) -> Any:
            started.append(server_id)
            return object()

    adapter = SimpleNamespace(
        _selected_mcp_servers=[SimpleNamespace(id="r19-redirect", origin="catalog")]
    )
    monkeypatch.setitem(_agents, "r19-held", (adapter, SimpleNamespace()))
    monkeypatch.setattr(agents, "get_mcp_lifecycle_manager", lambda: Lifecycle())
    monkeypatch.setattr(
        agents, "MCP_SERVER_CATALOG", {"r19-redirect": REDIRECT_SERVER}
    )
    answer = await agents._start_mcp_servers_for_agent(
        "r19-held", [agents.EnvVar(name=SENT[0]["name"], value=SENT[0]["value"])]
    )
    assert started == []
    assert REDIRECTED in answer[2][0]["error"]


@pytest.mark.asyncio
async def test_no_agent_is_made_from_a_spec_that_declares_one() -> None:
    from fastapi import HTTPException

    from agent_runtimes.routes import agents

    forwarded = {
        "id": "r19-a",
        "mcp_servers": [REDIRECT_SERVER.model_dump(by_alias=True)],
    }
    with pytest.raises(HTTPException) as refused:
        await agents.create_agent(
            agents.CreateAgentRequest(
                name="r19-made", agent_spec=forwarded, app_instance=FOR_A_DEPLOYMENT
            ),
            SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        )
    assert refused.value.status_code == 422
    assert REDIRECTED in str(refused.value.detail)


def test_a_signed_users_secret_is_the_platforms_though_it_is_named_as_its_own() -> None:
    """D-21: declared by the deployment's own Appspec, set as any other."""
    from agent_runtimes.apps.host_user import secret_variable

    declared = declared_secrets(
        app_spec={
            "connections": [],
            "deployment": {"embedded": {"host": {"user": "signed"}}},
        },
        app_instance={"deployment_uid": "dep-1"},
    )
    name = secret_variable("dep-1")
    assert is_reserved(name) and name in declared.runtime
    refuse_reserved([name], declared)


# --- the reserved names hold deployments: a person's runtime is theirs ------------


AWS_SERVER = {"id": "x", "name": "x", "required_env_vars": ["AWS_PROFILE"]}


def test_a_persons_runtime_keeps_what_their_own_server_declares() -> None:
    """Nothing crosses a boundary there: their spec, their vault, their runtime."""
    declared = declared_secrets(
        forwarded_spec={"id": "a", "mcp_servers": [AWS_SERVER]},
        skills=[],
    )
    assert "AWS_PROFILE" in declared.runtime
    refuse_reserved(["AWS_PROFILE"], declared)


def test_a_spec_read_for_a_deployment_is_held_to_them_wherever_it_is_read() -> None:
    """On no deployment's runtime: ai-agents reads what a version declares."""
    with pytest.raises(ReservedSecretName):
        declared_secrets(
            forwarded_spec={"id": "a", "mcp_servers": [AWS_SERVER]},
            app_instance={"deployment_uid": "dep-1"},
        )
    with pytest.raises(ReservedSecretName):
        refuse_reserved(
            ["AWS_PROFILE"],
            DeclaredSecrets(for_a_deployment=True),
        )


def test_a_runtime_launched_for_a_deployment_is_held_to_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.apps import principal

    monkeypatch.setattr(principal, "launched_for", lambda: "dep-1")
    with pytest.raises(ReservedSecretName):
        declared_secrets(forwarded_spec={"id": "a", "mcp_servers": [AWS_SERVER]})
    with pytest.raises(ReservedSecretName):
        refuse_reserved(["AWS_PROFILE"], DeclaredSecrets())
    with pytest.raises(ReservedSecretName):
        refuse_server_names("x", ["AWS_PROFILE"], from_catalogue=False)


def test_a_runtime_serving_a_deployment_is_held_to_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.apps import principal

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    with pytest.raises(ReservedSecretName):
        refuse_reserved(["AWS_PROFILE"], DeclaredSecrets())


def test_a_persons_server_starts_with_what_it_declares() -> None:
    refuse_server_names("x", ["AWS_PROFILE"], from_catalogue=False)


# --- an owner's secrets stay out of a kernel they did not launch --------------------

KERNEL_SECRET = "the-owners-" + uuid.uuid4().hex


def _as_launched_by_a_visitor(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.apps import principal

    monkeypatch.setattr(principal, "launched_for", lambda: "dep-1")
    monkeypatch.setattr(principal, "kernel_holds_owner_secrets", lambda: False)


def test_a_skill_that_needs_one_in_the_kernel_is_refused_in_a_sentence() -> None:
    declared = DeclaredSecrets(
        consumers={"the skill github": frozenset({"GITHUB_TOKEN"})},
        kernel=frozenset({"GITHUB_TOKEN"}),
    )
    [said] = declared.kernel_refused(lambda _: False, who="Desk")
    assert "GITHUB_TOKEN" in said and "Desk" in said and "launched" in said


def test_sandbox_envvars_are_refused_only_when_the_owner_holds_them() -> None:
    """Offered, never required: with none to keep out, there is nothing to refuse."""
    declared = DeclaredSecrets(
        kernel=frozenset({"EARTHDATA_PASSWORD"}),
        offered=frozenset({"EARTHDATA_PASSWORD"}),
    )
    assert declared.kernel_refused(lambda _: False, who="Desk") == []
    assert len(declared.kernel_refused(lambda _: True, who="Desk")) == 1


def test_a_server_s_secret_is_nothing_to_the_kernel() -> None:
    declared = DeclaredSecrets(consumers={"the MCP server s": frozenset({"A_TOKEN"})})
    assert declared.kernel_refused(lambda _: True, who="Desk") == []


def test_the_companion_is_told_nothing_for_a_kernel_it_may_not_fill(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import agents

    _as_launched_by_a_visitor(monkeypatch)
    declared = DeclaredSecrets(
        consumers={"the skill x": frozenset({"R19_SKILL_TOKEN"})},
        kernel=frozenset({"R19_SKILL_TOKEN"}),
    )
    monkeypatch.setattr(agents, "_declared_for_agents", lambda _: declared)
    asked = runtime.post("/api/v1/agents/declared-secrets", json={})
    assert asked.status_code == 200, asked.text
    assert asked.json()["kernel"] == []
    assert asked.json()["runtime"] == ["R19_SKILL_TOKEN"]


def test_the_owners_stay_out_of_the_sandbox_it_is_given(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The process holds it: the sandbox shares none of it."""
    from agent_runtimes.routes import agents

    assert _configure(runtime, "r19-bare", []).status_code == 200
    _as_launched_by_a_visitor(monkeypatch)
    declared = DeclaredSecrets(
        consumers={"the MCP server s": frozenset({"R19_SKILL_TOKEN"})},
        kernel=frozenset({"R19_SKILL_TOKEN"}),
    )
    monkeypatch.setattr(agents, "_declared_for_agents", lambda _: declared)
    monkeypatch.setattr(
        agents, "_launch_of", lambda *_: (None, None)
    )
    answered = runtime.post(
        "/api/v1/agents/mcp-servers/start",
        json={
            "env_vars": [{"name": "R19_SKILL_TOKEN", "value": KERNEL_SECRET}],
            "jupyter_sandbox": "http://127.0.0.1:2300?token=t",
        },
    )
    assert answered.status_code == 200, answered.text
    assert os.environ["R19_SKILL_TOKEN"] == KERNEL_SECRET
    assert "R19_SKILL_TOKEN" not in runtime.sandbox.kernel


def test_a_launch_that_needs_one_in_the_kernel_is_refused_and_its_agent_with_it(
    runtime: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import agents

    _as_launched_by_a_visitor(monkeypatch)
    declared = DeclaredSecrets(
        consumers={"the skill x": frozenset({"R19_SKILL_TOKEN"})},
        kernel=frozenset({"R19_SKILL_TOKEN"}),
    )
    monkeypatch.setattr(
        agents,
        "_launch_of",
        lambda *_: ({"id": "desk", "name": "Desk"}, {"deployment_uid": "dep-1"}),
    )
    monkeypatch.setattr(agents, "_note_launched_app", lambda *_: declared)
    answered = runtime.post(
        "/api/v1/agents/mcp-servers/start",
        json={"env_vars": [{"name": "R19_SKILL_TOKEN", "value": KERNEL_SECRET}]},
    )
    assert answered.status_code == 422, answered.text
    assert "R19_SKILL_TOKEN" in str(answered.json()["detail"])
    assert "launched" in (agents.set_up_refused("desk") or "")
    assert "R19_SKILL_TOKEN" not in runtime.sandbox.kernel


@pytest.mark.asyncio
async def test_no_agent_is_made_for_a_visitor_from_what_needs_one_in_the_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi import HTTPException

    from agent_runtimes.apps import principal
    from agent_runtimes.routes import agents
    from agent_runtimes.specs import skills

    monkeypatch.setattr(principal, "kernel_holds_owner_secrets", lambda: False)
    monkeypatch.setitem(skills.SKILLS_CATALOG, "r19-skill", PROBE_SKILL)
    with pytest.raises(HTTPException) as refused:
        await agents.create_agent(
            agents.CreateAgentRequest(
                name="r19-visitors",
                agent_spec={"id": "r19-a", "skills": ["r19-skill:0.0.1"]},
            ),
            SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        )
    assert refused.value.status_code == 422
    assert "R19_SKILL_TOKEN" in str(refused.value.detail)


def test_a_persons_own_runtime_keeps_its_kernel(runtime: Any) -> None:
    from agent_runtimes.apps.principal import kernel_holds_owner_secrets

    assert kernel_holds_owner_secrets()
    response = _configure(runtime, "r19-agent", ACCOUNT)
    assert response.status_code == 200, response.text
    _settle()
    assert runtime.sandbox.kernel == {"R19_SKILL_TOKEN": SKILL_SECRET}
