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
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterator

import pytest
from reactor import PluginPlatform

from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import HARNESSES, SESSION_FORMATS

PACKAGES = Path(__file__).resolve().parents[2] / "examples" / "plugins"


@pytest.fixture(scope="module")
def installed(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    """Both packages installed into a folder of their own, on the path."""
    target = tmp_path_factory.mktemp("site")
    done = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "--no-deps",
            "--no-build-isolation",
            "--target",
            str(target),
            str(PACKAGES / "aider-harness"),
            str(PACKAGES / "omnigent-format"),
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert done.returncode == 0, done.stdout + done.stderr[-3000:]
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
