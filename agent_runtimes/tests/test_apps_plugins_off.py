# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The plugins an organization has turned off, in the checks of an application (LOOP C-12)."""

import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import yaml
from typer.testing import CliRunner

from agent_runtimes.commands.apps import app, validate_file
from agent_runtimes.loop.apps import plugins_off as module
from agent_runtimes.loop.apps.plugins_off import (
    PluginsOff,
    components_used_by,
    plugins_off_setup_notes,
    read_plugins_off,
    unknown_plugins_off,
)

pytest.importorskip("agentspecs.apps")

runner = CliRunner()

ORG = "01ORGANIZATION"
IAM = "https://iam.test"

APP = {
    "schema": "loop.app/v1",
    "id": "desk",
    "name": "Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "connections": [{"server": "tavily:0.0.1"}],
    "interface": {"components": ["Table"]},
}

TABLE_OFF = (
    "The UI plugin “A2UI” is not enabled, and its page uses its block Table: "
    "it is off the Canvas until it is."
)


def write(tmp_path: Path) -> Path:
    path = tmp_path / "app.yaml"
    path.write_text(yaml.safe_dump(APP, sort_keys=False))
    return path


def interface(components, placed=()):
    nodes = [{"id": f"block-{at}", "component": name} for at, name in enumerate(placed)]
    return SimpleNamespace(
        components=list(components),
        surface=SimpleNamespace(components=nodes) if placed else None,
    )


class TestReadingThemFromIam:
    def test_with_no_organization_none_is_off_and_it_says_so(self) -> None:
        read = read_plugins_off(None, iam_url=IAM, token="t")
        assert read.plugins == []
        assert "No organization was named" in read.says

    def test_signed_out_none_is_off_and_it_says_so(self) -> None:
        read = read_plugins_off(ORG, iam_url=IAM, token=None)
        assert read.plugins == []
        assert read.says.startswith("Not signed in")

    def test_offline_none_is_off_and_it_says_so(self, monkeypatch) -> None:
        def unreachable(*args, **kwargs):
            raise httpx.ConnectError("no route")

        monkeypatch.setattr(httpx, "get", unreachable)
        read = read_plugins_off(ORG, iam_url=IAM, token="t")
        assert read.plugins == []
        assert read.says.startswith("IAM could not be reached (ConnectError)")

    def test_a_refusal_is_said_with_its_status(self, monkeypatch) -> None:
        monkeypatch.setattr(
            httpx, "get", lambda *args, **kwargs: httpx.Response(403, json={})
        )
        read = read_plugins_off(ORG, iam_url=IAM, token="t")
        assert read.plugins == []
        assert read.says.startswith("IAM answered 403")

    def test_the_list_is_read_with_the_callers_token(self, monkeypatch) -> None:
        calls = []

        def get(url, headers, timeout):
            calls.append((url, headers))
            return httpx.Response(200, json={"success": True, "plugins_off": ["a2ui"]})

        monkeypatch.setattr(httpx, "get", get)
        read = read_plugins_off(ORG, iam_url=IAM + "/", token="t")
        assert read == PluginsOff(["a2ui"], f"Organization {ORG} has turned off: a2ui.")
        assert calls == [
            (
                f"{IAM}/api/iam/v1/organizations/{ORG}/plugins-off",
                {"Authorization": "Bearer t"},
            )
        ]


class TestTheSetupNotes:
    def test_the_components_its_page_names_once_each(self) -> None:
        assert components_used_by(interface(["Table", "Chart"], ["Table", "Text"])) == [
            "Table",
            "Chart",
            "Text",
        ]

    def test_nothing_is_said_while_none_is_off(self) -> None:
        assert plugins_off_setup_notes(interface(["Table"]), []) == []

    def test_the_plugin_and_its_blocks_are_named(self) -> None:
        assert plugins_off_setup_notes(interface(["Table"]), ["a2ui"]) == [TABLE_OFF]
        assert plugins_off_setup_notes(interface(["Table"], ["Chart"]), ["a2ui"]) == [
            "The UI plugin “A2UI” is not enabled, and its page uses its blocks Table, Chart: "
            "they are off the Canvas until it is."
        ]

    def test_a_plugin_with_no_blocks_or_unknown_takes_nothing_off(self) -> None:
        assert plugins_off_setup_notes(interface(["Table"]), ["mcp-ui", "nope"]) == []
        assert unknown_plugins_off(["a2ui", "mcp-ui", "nope"]) == ["nope"]


class TestLoopAppsValidate:
    def test_a_block_of_a_plugin_off_is_a_setup_note(self, tmp_path: Path) -> None:
        path = write(tmp_path)
        assert TABLE_OFF not in validate_file(path).setup
        report = validate_file(
            path, PluginsOff(["a2ui"], "Organization O has turned off: a2ui.")
        )
        assert TABLE_OFF in report.setup
        assert report.plugins_off_says == "Organization O has turned off: a2ui."

    def test_with_no_organization_the_run_says_none_is_off(
        self, tmp_path: Path
    ) -> None:
        result = runner.invoke(app, ["validate", str(write(tmp_path))])
        assert result.exit_code == 0
        assert "· Plugins: No organization was named" in result.output
        assert TABLE_OFF not in result.output

    def test_the_organizations_list_is_read_from_iam(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        from agent_runtimes.loop import launch

        client = SimpleNamespace(urls=SimpleNamespace(iam_url=IAM))
        monkeypatch.setattr(launch, "make_client", lambda: (client, "t"))
        monkeypatch.setattr(
            httpx,
            "get",
            lambda *args, **kwargs: httpx.Response(
                200, json={"success": True, "plugins_off": ["a2ui"]}
            ),
        )
        result = runner.invoke(
            app, ["validate", "--json", "--organization", ORG, str(write(tmp_path))]
        )
        assert result.exit_code == 0
        [report] = json.loads(result.output)
        assert TABLE_OFF in report["setup"]
        assert report["plugins_off_says"] == f"Organization {ORG} has turned off: a2ui."

    def test_signed_out_the_run_says_none_is_off(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        from agent_runtimes.loop import launch

        def signed_out():
            raise launch.NotSignedIn("No Datalayer credentials were found.")

        monkeypatch.setattr(launch, "make_client", signed_out)
        result = runner.invoke(
            app, ["validate", "--organization", ORG, str(write(tmp_path))]
        )
        assert result.exit_code == 0
        assert "· Plugins: Not signed in" in result.output
        assert TABLE_OFF not in result.output


def test_the_module_reads_the_catalogue_of_this_package() -> None:
    assert module.list_ui_plugins()[0].id == "a2ui"
