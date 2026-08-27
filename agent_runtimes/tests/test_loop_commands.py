# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the LOOP slash command registry, discovery and entry points."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from agent_runtimes.loop import (
    CommandArgSpec,
    CommandCollisionError,
    LoopSession,
    SlashCommandRegistry,
    SlashCommandSpec,
    discover_slash_commands,
    invoked_name,
    opens_workspace,
    spec_from_module,
)


def _spec(name: str, **kwargs: object) -> SlashCommandSpec:
    return SlashCommandSpec(name=name, **kwargs)  # type: ignore[arg-type]


class TestRegistry:
    def test_resolves_by_name_and_alias_with_or_without_slash(self) -> None:
        registry = SlashCommandRegistry()
        registry.register(_spec("mcp-servers", aliases=("mcp",)))

        assert registry.resolve("mcp-servers") is registry.resolve("mcp")
        assert registry.resolve("/mcp") is registry.resolve("mcp")
        assert registry.resolve("/MCP ") is registry.resolve("mcp")
        assert registry.resolve("nope") is None
        assert "mcp" in registry
        assert "nope" not in registry

    def test_refuses_to_shadow_an_existing_name(self) -> None:
        registry = SlashCommandRegistry()
        registry.register(_spec("help", source="builtin"))

        with pytest.raises(CommandCollisionError, match="builtin"):
            registry.register(_spec("help", source="plugin:evil"))

        # An alias may not shadow another command's primary name either.
        with pytest.raises(CommandCollisionError):
            registry.register(_spec("assist", aliases=("help",)))

    def test_try_register_skips_a_collision_instead_of_raising(self) -> None:
        registry = SlashCommandRegistry()
        registry.register(_spec("help"))

        assert registry.try_register(_spec("help", source="plugin:evil")) is False
        assert registry.try_register(_spec("deploy", source="plugin:ok")) is True
        assert registry.names() == ("deploy", "help")
        # The original owner kept the name.
        assert registry.resolve("help").source == "builtin"

    def test_iterates_primary_commands_only(self) -> None:
        registry = SlashCommandRegistry()
        registry.register(_spec("beta", aliases=("b",)))
        registry.register(_spec("alpha", aliases=("a",)))

        assert [spec.name for spec in registry] == ["alpha", "beta"]
        assert len(registry) == 2
        # The mapping keeps aliases: that is what the terminal UI consumes.
        assert set(registry.as_mapping()) == {"alpha", "a", "beta", "b"}

    def test_groups_commands_for_help(self) -> None:
        registry = SlashCommandRegistry()
        registry.register(_spec("status", group="Session"))
        registry.register(_spec("clear", group="Session"))
        registry.register(_spec("mcp", group="Capabilities"))
        registry.register(_spec("stray"))

        grouped = registry.by_group()
        assert list(grouped) == ["Capabilities", "General", "Session"]
        assert [spec.name for spec in grouped["Session"]] == ["clear", "status"]
        assert [spec.name for spec in grouped["General"]] == ["stray"]


class TestArgSpec:
    def test_static_and_callable_choices(self) -> None:
        assert CommandArgSpec(name="server", choices=("a", "b")).resolve_choices() == (
            "a",
            "b",
        )
        assert CommandArgSpec(
            name="model", choices=lambda: ["openai:gpt-4o"]
        ).resolve_choices() == ("openai:gpt-4o",)

    def test_failing_choices_do_not_break_the_prompt(self) -> None:
        def explode() -> list[str]:
            raise RuntimeError("the server is down")

        # Completion runs on every keystroke: a live lookup that fails must
        # produce no completions, not an exception in the terminal.
        assert CommandArgSpec(name="server", choices=explode).resolve_choices() == ()


class TestModuleAdapter:
    def test_adapts_the_one_file_per_command_contract(self) -> None:
        async def execute(_tux: object) -> None:
            return None

        module = SimpleNamespace(
            NAME="skills",
            ALIASES=["sk"],
            DESCRIPTION="List available skills",
            SHORTCUT="escape k",
            execute=execute,
        )

        async def handler() -> None:
            return None

        spec = spec_from_module(module, handler)
        assert spec.name == "skills"
        assert spec.aliases == ("sk",)
        assert spec.shortcut == "escape k"
        assert spec.group == "General"
        assert spec.args == ()


class TestDiscovery:
    def test_a_plugin_registers_its_commands(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class Plugin:
            def provide_slash_commands(self, registry: SlashCommandRegistry) -> None:
                registry.try_register(
                    SlashCommandSpec(name="deploy", source="plugin:acme")
                )

        entry_point = SimpleNamespace(
            name="acme", load=lambda: (object(), Plugin())
        )
        monkeypatch.setattr(
            "agent_runtimes.loop.discovery._iter_entry_points",
            lambda group: (entry_point,),
        )

        registry = SlashCommandRegistry()
        contributed = discover_slash_commands(registry)

        assert contributed == ("acme",)
        assert registry.resolve("deploy").source == "plugin:acme"

    def test_a_broken_plugin_is_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def explode() -> object:
            raise ImportError("no module named 'nope'")

        working = SimpleNamespace(
            name="fine",
            load=lambda: SimpleNamespace(
                provide_slash_commands=lambda registry: registry.try_register(
                    SlashCommandSpec(name="fine", source="plugin:fine")
                )
            ),
        )
        broken = SimpleNamespace(name="broken", load=explode)
        monkeypatch.setattr(
            "agent_runtimes.loop.discovery._iter_entry_points",
            lambda group: (broken, working),
        )

        registry = SlashCommandRegistry()
        contributed = discover_slash_commands(registry)

        # One bad plugin costs a warning, not a prompt that refuses to open.
        assert contributed == ("fine",)
        assert "fine" in registry

    def test_a_plugin_without_the_hook_is_ignored(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        entry_point = SimpleNamespace(name="cli-only", load=lambda: object())
        monkeypatch.setattr(
            "agent_runtimes.loop.discovery._iter_entry_points",
            lambda group: (entry_point,),
        )

        assert discover_slash_commands(SlashCommandRegistry()) == ()


class TestEntryPointDispatch:
    @pytest.mark.parametrize(
        ("argv0", "expected"),
        [
            ("/usr/local/bin/loop", True),
            ("loop", True),
            ("l", True),
            ("LOOP.EXE", True),
            ("agent-runtimes", False),
            ("/usr/local/bin/datalayer-agents", False),
            ("/src/agent_runtimes/__main__.py", False),
            ("", False),
        ],
    )
    def test_only_loop_and_l_open_the_workspace(
        self, argv0: str, expected: bool
    ) -> None:
        assert opens_workspace(argv0) is expected

    def test_invoked_name_strips_path_and_suffixes(self) -> None:
        assert invoked_name("/usr/bin/loop") == "loop"
        assert invoked_name("C:\\tools\\loop.exe").endswith("loop")
        assert invoked_name("/src/agent_runtimes/__main__.py") == "__main__"


class TestBuiltins:
    def test_builtin_commands_register_without_collisions(self) -> None:
        from agent_runtimes.chat.commands import build_registry

        registry = build_registry(SimpleNamespace(), eggs=True, discover=False)

        names = registry.names()
        for expected in ("help", "status", "agents", "mcp", "skills", "browser"):
            assert expected in names
        # Aliases resolve to their command.
        assert registry.resolve("mcp-servers").name == "mcp"
        assert registry.resolve("sandbox").name == "code-sandbox"
        assert registry.resolve("chat").name == "browser"

    def test_help_groups_are_populated(self) -> None:
        from agent_runtimes.chat.commands import build_registry

        grouped = build_registry(SimpleNamespace(), discover=False).by_group()
        assert "Session" in grouped
        assert "Capabilities" in grouped
        assert all(specs for specs in grouped.values())
        # Nothing should be left ungrouped now that groups are declared centrally.
        assert "General" not in grouped

    def test_handlers_are_bound_to_the_session_ui(self) -> None:
        from agent_runtimes.chat.commands import build_registry

        seen: list[object] = []

        async def fake_execute(tux: object) -> str:
            seen.append(tux)
            return "done"

        tux = SimpleNamespace()
        registry = build_registry(tux, discover=False)
        spec = registry.resolve("help")
        assert spec is not None and spec.handler is not None

        # Swap in a probe to prove the closure carries the right instance.
        probe = spec_from_module(
            SimpleNamespace(NAME="probe", execute=fake_execute),
            lambda: fake_execute(tux),  # type: ignore[arg-type,return-value]
        )
        assert asyncio.run(probe.handler()) == "done"
        assert seen == [tux]

    def test_build_commands_still_returns_the_name_and_alias_mapping(self) -> None:
        from agent_runtimes.chat.commands import build_commands

        mapping = build_commands(SimpleNamespace())
        assert mapping["mcp-servers"].name == "mcp"
        assert mapping["mcp-servers"] is mapping["mcp"]


class TestLoopSession:
    def test_api_base_is_versioned(self) -> None:
        assert (
            LoopSession(server_url="http://127.0.0.1:8765/").api_base
            == "http://127.0.0.1:8765/api/v1"
        )

    def test_jupyter_sandbox_counts_as_running_when_connected(self) -> None:
        session = LoopSession(
            server_url="http://x",
            sandbox={"variant": "jupyter-server", "jupyter_connected": True},
        )
        assert session.sandbox_running is True
        assert session.sandbox_variant == "jupyter-server"

    def test_no_sandbox_is_not_running(self) -> None:
        assert LoopSession(server_url="http://x").sandbox_running is False
