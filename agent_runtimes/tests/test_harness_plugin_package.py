# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness plugin package, installed and discovered (MH-F10).

The worked example as a test: ``examples/plugins/aider-harness`` installed
with pip into a folder of its own (no dependencies: agent-runtimes is the
one running), put on the path, discovered by its entry point under the
reactor's group, listed by `loop harnesses`, resolved by `harness_agent`,
and refused — naming the plugin — when its yaml lacks `terms`; the second
package's format reached through `format_named`.
"""

from __future__ import annotations

import importlib
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Iterator

import pytest
from reactor import PluginPlatform

from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import HARNESSES, SESSION_FORMATS

PACKAGES = Path(__file__).resolve().parents[2] / "examples" / "plugins"


_FIELD = re.compile(r'^(name|version)\s*=\s*"([^"]+)"', re.MULTILINE)
_SECTION = re.compile(
    r'^\[project\.entry-points\."([^"]+)"\]\n((?:[^\[\n][^\n]*\n?)*)', re.MULTILINE
)
_ENTRY = re.compile(r'^\s*([\w.-]+)\s*=\s*"([^"]+)"', re.MULTILINE)


def _install(package: Path, target: Path) -> None:
    """The package placed on the path as `pip install --target` would place it
    — its modules, and a `dist-info` with the entry points its pyproject
    declares, which is what the reactor discovers it by. Without pip (CI's
    virtual environment has none) and without a TOML parser (3.10 has none
    built in): the two fields and the entry-point sections are read as lines.
    """
    pyproject = (package / "pyproject.toml").read_text(encoding="utf-8")
    fields = dict(_FIELD.findall(pyproject))
    name, version = fields["name"], fields["version"]
    for module in package.iterdir():
        if module.is_dir() and (module / "__init__.py").is_file():
            shutil.copytree(module, target / module.name, dirs_exist_ok=True)
    info = target / f"{name.replace('-', '_')}-{version}.dist-info"
    info.mkdir(parents=True, exist_ok=True)
    (info / "METADATA").write_text(
        f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n", encoding="utf-8"
    )
    lines = []
    for group, body in _SECTION.findall(pyproject):
        lines.append(f"[{group}]")
        lines.extend(f"{key} = {value}" for key, value in _ENTRY.findall(body))
        lines.append("")
    (info / "entry_points.txt").write_text("\n".join(lines), encoding="utf-8")


@pytest.fixture(scope="module")
def installed(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    """Both packages installed into a folder of their own, on the path."""
    target = tmp_path_factory.mktemp("site")
    for package in ("aider-harness", "omnigent-format"):
        _install(PACKAGES / package, target)
    sys.path.insert(0, str(target))
    importlib.invalidate_caches()
    try:
        yield target
    finally:
        sys.path.remove(str(target))
        for name in ("aider_harness", "omnigent_session_format"):
            sys.modules.pop(name, None)
        importlib.invalidate_caches()


def _platform() -> PluginPlatform:
    platform = PluginPlatform()
    host.session_platform(platform, discover_installed=False)
    host.discover(platform, "datalayer.reactor.extensions")
    return platform


def test_the_package_is_discovered_listed_and_resolved(
    installed: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from agent_runtimes.adapters.acp_agent import harness_agent
    from agent_runtimes.chat.cli import harnesses
    from agent_runtimes.loop.apps import plugins as runtime_plugins

    monkeypatch.delenv("AIDER_HARNESS_YAML", raising=False)
    platform = _platform()
    assert {e["name"] for e in platform.list_extensions()} >= {
        "aider-harness",
        "omnigent-session-format",
        host.EXTENSION,
    }
    [aider] = [c for c in host.accepted(platform, HARNESSES) if c.id == "aider"]
    assert (
        aider.plugin == "aider-harness"
        and aider.value.spec.capabilities.resume == "load"
    )
    assert "omnigent-jsonl/1" in {
        c.id for c in host.accepted(platform, SESSION_FORMATS)
    }
    monkeypatch.setattr(runtime_plugins, "PLATFORM", platform)
    harnesses()
    out = re.sub(r"\x1b\[[0-9;]*m", "", capsys.readouterr().out)
    assert (
        "Aider" in out
        and "loop --harness aider" in out
        and "Contributed by: aider-harness" in out
    )
    agent = harness_agent(
        "a1",
        "aider",
        workspace=installed,
        environment={**os.environ, "AGENT_RUNTIMES_WORKSPACE_ROOT": str(installed)},
    )
    assert (
        agent.harness.id == "aider"
        and agent.harness.instructions_file == "CONVENTIONS.md"
    )
    from agent_runtimes.loop.apps.session_files import format_named

    assert format_named("omnigent-jsonl/1", platform).id == "omnigent-jsonl/1"


def test_a_yaml_without_terms_is_refused_naming_the_plugin(
    installed: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    text = (PACKAGES / "aider-harness" / "aider_harness" / "aider.yaml").read_text(
        encoding="utf-8"
    )
    without = tmp_path / "aider.yaml"
    without.write_text(
        text.replace(
            "terms:\n  served_to_third_parties: permitted\n  licence: Apache-2.0 (adapter and agent)\n",
            "",
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("AIDER_HARNESS_YAML", str(without))
    platform = _platform()
    assert "aider" not in {c.id for c in host.accepted(platform, HARNESSES)}
    [refusal] = [r for r in host.refusals(platform) if r.contribution_id == "aider"]
    assert refusal.line() == (
        "aider-harness: harness 'aider' refused — aider-harness contributes harness 'aider' without terms: "
        "a harness whose terms are unknown is not served."
    )
    described: Any = host.describe_plugins(platform, "aider-harness")
    assert described["refused"][0]["plugin"] == "aider-harness"
