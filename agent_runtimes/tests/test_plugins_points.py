# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session's contribution points and `loop plugins` (MH-F01).

The five points of the `agent-runtimes` reactor extension, the built-in
plugin contributing today's implementations, a malformed or duplicate
contribution refused at the seam naming the plugin while the host runs
with the rest, and `loop plugins [<name>]` listing every extension, its
contributions and what was refused — one name given, that one alone, a
failed entry point with its entry point and error.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Iterator

import pytest
from reactor import PluginManifest, PluginPlatform, hookimpl
from typer.testing import CliRunner

from agent_runtimes.plugins import host, points
from agent_runtimes.plugins.extension import extension
from agent_runtimes.plugins.points import (
    HARNESSES,
    POINTS,
    SESSION_CARRY,
    SESSION_FORMATS,
    SESSION_HOOKS,
    SESSION_STORES,
    HarnessContribution,
)
from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

TEST_GROUP = "agent-runtimes.tests.extensions"


@pytest.fixture()
def platform() -> PluginPlatform:
    made = PluginPlatform(extension_group=TEST_GROUP)
    host.session_platform(made, discover_installed=False)
    return made


class Contributing:
    """A test plugin contributing what it is told."""

    def __init__(self, *entries: tuple[Any, Any, str]) -> None:
        self.entries = entries

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        for point, value, cid in self.entries:
            contributions.contribute(point, value, contribution_id=cid, order=50)


def _register(
    platform: PluginPlatform, name: str, *entries: tuple[Any, Any, str]
) -> None:
    platform.register_plugin(
        PluginManifest(name=name, version="0.0.1", description="a test plugin"),
        Contributing(*entries),
    )


def test_the_points_are_registered_at_start(platform: PluginPlatform) -> None:
    assert [point.id for point in POINTS] == [
        "harness",
        "session.store",
        "session.format",
        "session.carry",
        "session.hook",
    ]
    [held] = [e for e in platform.list_extensions() if e["name"] == host.EXTENSION]
    assert held["plugins"] == [host.BUILTIN_PLUGIN]
    [manifest] = [
        p for p in platform.list_plugins() if p["name"] == host.BUILTIN_PLUGIN
    ]
    assert manifest["contribution_points"] == [point.id for point in POINTS]
    # The catalogue contributes itself, each harness under its id (MH-F02).
    harnesses = host.accepted(platform, HARNESSES)
    assert {c.id for c in harnesses} == set(HARNESS_CATALOGUE)
    assert all(
        isinstance(c.value, HarnessContribution) and c.plugin == host.BUILTIN_PLUGIN
        for c in harnesses
    )
    # Registered twice: once.
    assert host.session_platform(platform, discover_installed=False) is platform
    assert (
        len([e for e in platform.list_extensions() if e["name"] == host.EXTENSION]) == 1
    )


def test_a_malformed_contribution_is_refused_naming_the_plugin_and_the_host_runs(
    platform: PluginPlatform,
) -> None:
    good = HarnessContribution(
        spec=HARNESS_CATALOGUE["codex"], adapter=lambda *a, **k: None
    )
    _register(
        platform,
        "broken-one",
        (HARNESSES, "not a harness", "aider"),
        (
            HARNESSES,
            HarnessContribution(
                spec=HARNESS_CATALOGUE["goose"], adapter=lambda *a, **k: None
            ),
            "aider",
        ),
        (HARNESSES, good, "codex"),
        (SESSION_STORES, object(), "memory"),
        (SESSION_FORMATS, object(), "omnigent-jsonl/1"),
        (SESSION_CARRY, object(), "stricter"),
        (SESSION_HOOKS, object(), "silent"),
    )
    refused = {(r.point, r.contribution_id): r.reason for r in host.refusals(platform)}
    assert refused[("harness", "aider")].startswith(
        "broken-one contributes harness 'aider'"
    )
    assert (
        "a harness is contributed under its own id" in refused[("harness", "aider")]
        or "not a HarnessContribution" in refused[("harness", "aider")]
    )
    assert refused[("harness", "codex")] == (
        "broken-one contributes harness 'codex', which agent-runtimes.sessions contributed first: one harness per id."
    )
    assert "not a SessionStore" in refused[("session.store", "memory")]
    assert "not a SessionFormat" in refused[("session.format", "omnigent-jsonl/1")]
    assert "not a SessionCarry" in refused[("session.carry", "stricter")]
    assert refused[("session.hook", "silent")].endswith(
        "that hooks nothing: one of on_open, on_resume, on_swap, on_clone, on_export, on_import, on_end."
    )
    # The host runs with the rest: the catalogue's codex is the one read.
    [codex] = [c for c in host.accepted(platform, HARNESSES) if c.id == "codex"]
    assert codex.plugin == host.BUILTIN_PLUGIN
    assert "aider" not in {c.id for c in host.accepted(platform, HARNESSES)}


def test_a_duplicate_harness_from_a_second_plugin_is_refused_by_name(
    platform: PluginPlatform,
) -> None:
    aider = HarnessContribution(
        spec=HARNESS_CATALOGUE["goose"].model_copy(update={"id": "aider"}),
        adapter=lambda *a, **k: None,
    )
    _register(platform, "aider-harness", (HARNESSES, aider, "aider"))
    _register(platform, "aider-again", (HARNESSES, aider, "aider"))
    assert [
        c.plugin for c in host.accepted(platform, HARNESSES) if c.id == "aider"
    ] == ["aider-harness"]
    [refusal] = host.refusals(platform)
    assert refusal.line() == (
        "aider-again: harness 'aider' refused — aider-again contributes harness 'aider', "
        "which aider-harness contributed first: one harness per id."
    )


def _broken_distribution(where: Path) -> None:
    """A distribution whose entry point names a module that does not import."""
    info = where / "broken_one-0.0.1.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(
        "Metadata-Version: 2.1\nName: broken-one\nVersion: 0.0.1\n"
    )
    (info / "entry_points.txt").write_text(
        f"[{TEST_GROUP}]\nbroken-one = broken_one:extension\n"
    )
    (where / "broken_one.py").write_text(
        "raise ImportError('aider is not installed')\n"
    )


@pytest.fixture()
def broken(tmp_path: Path) -> Iterator[Path]:
    _broken_distribution(tmp_path)
    sys.path.insert(0, str(tmp_path))
    import importlib

    importlib.invalidate_caches()
    try:
        yield tmp_path
    finally:
        sys.path.remove(str(tmp_path))
        sys.modules.pop("broken_one", None)
        importlib.invalidate_caches()


def test_loop_plugins_lists_extensions_contributions_and_what_was_refused(
    platform: PluginPlatform, broken: Path
) -> None:
    assert host.discover(platform, TEST_GROUP) == []
    described = host.describe_plugins(platform)
    assert [e["name"] for e in described["extensions"]] == [host.EXTENSION]
    [plugin] = described["extensions"][0]["plugins"]
    assert plugin["name"] == host.BUILTIN_PLUGIN and plugin["enabled"]
    assert {(c["point"], c["id"]) for c in plugin["contributions"]} >= {
        ("harness", "claude-code"),
        ("harness", "codex"),
    }
    assert described["failed"] == [
        {
            "name": "broken-one",
            "entry_point": "broken_one:extension",
            "error": "ImportError: aider is not installed",
        }
    ]
    lines = host.plugins_lines(described)
    assert lines[0].startswith(
        "agent-runtimes 1.0.0 — The session as the unit of agent-runtimes"
    )
    assert lines[1].startswith(f"  {host.BUILTIN_PLUGIN}: harness (claude-code)")
    assert lines[-2:] == [
        "Refused:",
        "  broken-one (entry point broken_one:extension): ImportError: aider is not installed",
    ]
    # One name: that one alone — the failed entry point with its entry point and error.
    one = host.plugins_lines(host.describe_plugins(platform, "broken-one"))
    assert one == [
        "Refused:",
        "  broken-one (entry point broken_one:extension): ImportError: aider is not installed",
    ]
    assert host.plugins_lines(host.describe_plugins(platform, "nope")) == [
        f"There is no extension named 'nope': one of {host.EXTENSION}."
    ]


def test_the_command_prints_the_entry_point_and_the_error(
    monkeypatch: pytest.MonkeyPatch, broken: Path
) -> None:
    from agent_runtimes.commands.plugins import app
    from agent_runtimes.loop.apps import plugins as runtime_plugins

    fresh = PluginPlatform(extension_group=TEST_GROUP)
    monkeypatch.setattr(runtime_plugins, "PLATFORM", fresh)
    result = CliRunner().invoke(app, ["broken-one"])
    assert result.exit_code == 0, result.output
    assert (
        "broken-one (entry point broken_one:extension): ImportError: aider is not installed"
        in result.output
    )
    missing = CliRunner().invoke(app, ["nope"])
    assert (
        missing.exit_code == 1
        and "There is no extension named 'nope'" in missing.output
    )
    everything = CliRunner().invoke(app, [])
    assert everything.exit_code == 0 and "agent-runtimes 1.0.0" in everything.output


def test_a_contribution_is_its_extension_s_when_registered_through_it() -> None:
    delivered = extension()
    assert delivered.name == host.EXTENSION
    assert [manifest.name for manifest, _ in delivered.plugins] == [host.BUILTIN_PLUGIN]
    assert points.HOOK_EVENTS == (
        "open",
        "resume",
        "swap",
        "clone",
        "export",
        "import",
        "end",
    )
