# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Reactor extensibility, first class in a Python application (LOOP P-35).

An `Application` is a Reactor plugin: its manifest, its extension, registered
on a host's `PluginPlatform` with Reactor's public API. Its author extends with
Reactor's own vocabulary — contributing to any point, declaring points of its
own that other plugins extend, using other plugins and their agent tools,
registering commands and routes — and what it contributes, the host honours.
"""

from __future__ import annotations

from typing import Any, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from reactor import (
    ExtensionManifest,
    PluginManifest,
    PluginPlatform,
    ReactorExtension,
    define_contribution_point,
    hookimpl,
)

from agent_runtimes.loop.apps import AppHost, Application, MemoryChannel, Session
from agent_runtimes.loop.apps.own import CommandTool
from agent_runtimes.loop.apps.plugins import AppPlugin, find_app
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.tests.test_apps_guards import scripted

#: A point of another plugin, which the application contributes to.
SOURCES = define_contribution_point("crm.sources")

#: The agent tools the CRM plugin offers, as Reactor's ``AgentTools`` says them.
CRM_TOOLS = [
    {
        "id": "crm.tools",
        "name": "CRM",
        "commands": [
            {
                "name": "lookup_customer",
                "command": "crm.lookup",
                "description": "Find a customer by their email.",
                "parameters": {
                    "type": "object",
                    "properties": {"email": {"type": "string"}},
                    "required": ["email"],
                },
            },
            {
                "name": "delete_customer",
                "command": "crm.delete",
                "description": "Delete a customer.",
            },
        ],
    }
]


class Crm:
    """A third-party Reactor plugin: a command, its agent tools, a point."""

    started = 0

    def provide_slash_commands(self, commands: Any) -> None:
        commands.add(
            "crm.lookup",
            "Look a customer up",
            lambda argument: {"customer": argument},
        )

    def provide_agent_tools(self) -> List[dict]:
        return CRM_TOOLS

    @hookimpl
    def on_reactor_start(self, tenant_id: Any = None) -> None:
        Crm.started += 1


def crm() -> ReactorExtension:
    return ReactorExtension(
        manifest=ExtensionManifest(name="crm", display_name="CRM"),
        plugins=[
            (
                PluginManifest(
                    name="crm", version="1.0.0", contribution_points=[SOURCES.id]
                ),
                Crm(),
            )
        ],
    )


def greeter() -> Application:
    app = Application(id="greeter", kind="chat", agent="example-simple")
    app.contribute(SOURCES, {"name": "greetings"}, id="greetings")
    return app


def host_of(app: Application, platform: Any = None) -> tuple[AppHost, MemoryChannel]:
    channel = MemoryChannel()
    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(scripted("Done.")),
        recorder=AppRecorder(app=app.spec),
        platform=platform,
    )
    return host, channel


def test_an_application_is_a_reactor_plugin_and_an_extension() -> None:
    app = greeter()
    app.uses(crm())
    points = app.contribution_point("greeter.greetings")
    manifest = app.manifest
    assert manifest.name == manifest.extension == "loop-app-greeter"
    assert manifest.dependencies == ["crm"]
    assert manifest.contribution_points == [points.id]
    extension = app.extension()
    assert extension.name == "loop-app-greeter" and extension.frontend is None
    ((own, plugin),) = extension.plugins
    assert own == manifest and isinstance(plugin, AppPlugin)
    with pytest.raises(ValueError, match="already declares"):
        app.contribution_point("greeter.greetings")
    with pytest.raises(ValueError, match="already uses crm"):
        app.uses(crm())


async def test_what_it_contributes_is_on_the_hosts_platform_and_goes_with_it() -> None:
    app = greeter()
    app.extend(SOURCES, "greetings", {"label": "Greetings"}, id="label")
    platform = PluginPlatform()
    platform.register_extension_object(crm())
    host, _ = host_of(app, platform)

    held = platform.get_contributions(SOURCES)
    assert [(c.plugin, c.id, c.value) for c in held] == [
        ("loop-app-greeter", "greetings", {"name": "greetings"})
    ]
    extended = platform.get_contribution_extensions(SOURCES, "greetings")
    assert [c.value for c in extended] == [{"label": "Greetings"}]
    assert find_app("greeter", platform) == app.spec
    assert [e["name"] for e in platform.list_extensions()] == [
        "crm",
        "loop-app-greeter",
    ]

    host.dispose()
    assert platform.get_contributions(SOURCES) == []
    assert not platform.has_plugin("loop-app-greeter")
    # What it used, installed on its own, stays: it was not the application's.
    assert platform.has_plugin("crm")


async def test_its_own_point_is_extended_by_another_plugin_and_read_by_its_code() -> (
    None
):
    app = Application(id="greeter", kind="chat", agent="example-simple")
    greetings = app.contribution_point("greeter.greetings")

    @app.start
    async def opening(session: Session) -> None:
        said = [c.value for c in session.contributions(greetings)]
        await session.send(" ".join(said) or "Nobody greets.")

    class Polite:
        def provide_contributions(self, contributions: Any) -> None:
            contributions.contribute(greetings, "Good morning.", contribution_id="am")

    # The plugin that extends it is composed with it: delivered in its
    # extension, activated first, gone with it.
    app.uses((PluginManifest(name="polite", version="1.0.0"), Polite()))
    host, channel = host_of(app)
    await host.open()
    assert [m.text for m in channel.messages] == ["Good morning."]
    assert host.platform.list_plugins()[0]["extension"] == "loop-app-greeter"
    host.dispose()
    assert not host.platform.has_plugin("polite")


async def test_a_used_extension_is_registered_with_it_and_started() -> None:
    Crm.started = 0
    app = greeter()
    app.uses(crm())
    host, _ = host_of(app)
    assert [p["name"] for p in host.platform.list_plugins()] == [
        "crm",
        "loop-app-greeter",
    ]
    # The host's own platform is started: its plugins were told.
    assert Crm.started == 1


async def test_its_commands_are_reactors_listed_and_run_from_the_composer() -> None:
    app = greeter()
    app.uses(crm())

    @app.reactor_command("greeter.greet", "Greet somebody")
    def greet(who: str) -> str:
        """Say hello to somebody."""
        return f"Hello, {who}."

    app.command("greet", "Greet somebody", run="greeter.greet")
    app.command("lookup", "Look a customer up", run="crm.lookup")
    host, channel = host_of(app)

    listed = {c.id: c for c in host.platform.list_commands()}
    assert set(listed) == {"greeter.greet", "crm.lookup"}
    assert listed["greeter.greet"].description == "Say hello to somebody."
    assert [d["plugin"] for d in host.platform.describe_commands()] == [
        "crm",
        "loop-app-greeter",
    ]
    session = await host.open()
    await host.message(session, "/greet Ada")
    await host.message(session, "/lookup ada@example.com")
    assert [m.text for m in channel.messages] == [
        "Hello, Ada.",
        "{'customer': 'ada@example.com'}",
    ]
    # Declared as its composer's, as any command (LOOP P-19).
    assert [c.name for c in app.spec.interface.commands] == ["greet", "lookup"]
    with pytest.raises(ValueError, match="not both"):
        app.command("both", "Both", prompt="Say hi.", run="greeter.greet")
    with pytest.raises(ValueError, match="already has the command"):
        app.reactor_command("greeter.greet", "Again")


async def test_a_used_plugins_agent_tools_reach_its_agent_as_its_rules_decide() -> None:
    app = greeter()
    app.uses(crm(), tools={"lookup_customer": "read"})
    (tool,) = app.spec.tools
    assert (tool.name, tool.does) == ("lookup_customer", ["read"])
    assert tool.description == "Find a customer by their email."
    assert tool.parameters["required"] == ["email"]
    assert app.tools["lookup_customer"] == CommandTool("crm.lookup")

    host, _ = host_of(app)
    session = await host.open()
    (toolset,) = session._own_toolsets
    given = toolset.tools["lookup_customer"]
    assert given.function_schema.json_schema["required"] == ["email"]
    assert await given.function(email="ada@example.com") == {
        "customer": {"email": "ada@example.com"}
    }

    other = greeter()
    with pytest.raises(ValueError, match="no agent tool 'nothing'"):
        other.uses(crm(), tools={"nothing": "read"})
    with pytest.raises(TypeError, match="Say what the tool"):
        greeter().uses(crm(), tools={"lookup_customer": []})


def test_its_routes_are_mounted_by_the_host_that_serves_it() -> None:
    app = greeter()

    @app.route("/status")
    def status() -> dict:
        return {"ok": True, "app": app.id}

    @app.route("/echo", methods=["POST"])
    async def echo(body: dict) -> dict:
        return body

    with pytest.raises(ValueError, match="starts with '/'"):
        app.route("status")
    api = FastAPI()
    app.mount(api, "/assistant")
    client = TestClient(api)
    assert client.get("/assistant/status").json() == {"ok": True, "app": "greeter"}
    assert client.post("/assistant/echo", json={"a": 1}).json() == {"a": 1}


def test_its_plugin_routes_say_their_plugin() -> None:
    app = greeter()

    @app.route("/status")
    def status() -> dict:
        return {}

    platform = PluginPlatform()
    host, _ = host_of(app, platform)
    assert platform.describe_routes() == [
        {"path": "/status", "method": "GET", "plugin": "loop-app-greeter"}
    ]
    host.dispose()
    assert platform.describe_routes() == []


async def test_the_example_extends_with_reactor() -> None:
    """``examples/reactor-extensible``: each thing it contributes, honoured."""
    from pathlib import Path

    from agent_runtimes.loop.apps import load_application

    example = (
        Path(__file__).resolve().parents[2]
        / "examples"
        / "reactor-extensible"
        / "app.py"
    )
    app = load_application(example)
    assert app.manifest.dependencies == ["support-crm"]
    assert app.manifest.contribution_points == ["support-desk-plus.greetings"]
    host, channel = host_of(app)
    session = await host.open()
    await host.message(session, "/hours")
    await host.message(session, "/lookup ada@example.com")
    assert [m.text for m in channel.messages] == [
        "Welcome to the support desk. The CRM is connected: ask about any "
        "customer by their email.",
        "We are open Monday to Friday, 9:00 to 17:00 CET.",
        "{'email': 'ada@example.com', 'name': 'Ada Lovelace', 'plan': 'Team', "
        "'seats': 12}",
    ]
    sources = host.platform.get_contributions(define_contribution_point("crm.sources"))
    assert [(c.plugin, c.id) for c in sources] == [
        ("loop-app-support-desk-plus", "tickets")
    ]
    (toolset,) = session._own_toolsets
    assert (await toolset.tools["lookup_customer"].function(email="alan@example.com"))[
        "plan"
    ] == "Free"
    api = FastAPI()
    app.mount(api, "/app")
    assert TestClient(api).get("/app/health").json() == {
        "ok": True,
        "app": "support-desk-plus",
    }


def test_loop_apps_build_marks_what_a_reactor_command_answers() -> None:
    from agent_runtimes.loop.apps.build import code_marks

    app = greeter()
    app.uses(crm(), tools={"lookup_customer": "read"})
    app.command("lookup", "Look a customer up", run="crm.lookup")
    marks = {mark.moment: mark.handler for mark in code_marks(app)}
    assert marks["command lookup"] == "the Reactor command crm.lookup"
    assert marks["tool lookup_customer"] == "the Reactor command crm.lookup"
