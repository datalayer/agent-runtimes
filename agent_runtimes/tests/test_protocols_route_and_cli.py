# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a runtime says it speaks: the route and `loop apps protocols` (PR-50, EX-08)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from agent_runtimes.commands.apps import app as apps_cli
from agent_runtimes.commands.apps import protocols_used
from agent_runtimes.routes.protocols import router

IDS = {"a2a", "agentic_commerce", "mcp", "pact", "pap", "ucp", "web_bot_auth"}


def test_the_route_lists_what_the_plugins_contributed():
    api = FastAPI()
    api.include_router(router, prefix="/api/v1")
    body = TestClient(api).get("/api/v1/protocols").json()
    assert {p["id"] for p in body["protocols"]} == IDS
    wba = next(p for p in body["protocols"] if p["id"] == "web_bot_auth")
    assert wba["version"] == "draft-ietf-webbotauth-httpsig-protocol-00"
    assert "web_bot_auth.signer" in wba["points"]
    assert wba["catalogue"] == "web-bot-auth"


def test_what_an_application_uses():
    spec = {
        "connections": [{"server": "gmail"}],
        "pap": {
            "connections": [{"company": "manzanita.example"}],
            "company": {"enabled": True},
        },
    }
    used = protocols_used(spec)
    assert used["mcp"] == "reaches 1 connection(s): gmail"
    assert (
        used["pap"].startswith("works with manzanita.example")
        and "is a company" in used["pap"]
    )
    assert protocols_used({}) == {}


def test_what_an_application_uses_of_pact_and_a2a():
    used = protocols_used(
        {
            "pact": {"connections": [{"id": "air", "brand": "air.example"}]},
            "a2a": {"extensions": [{"uri": "https://shop.example/ext/gift/v1"}]},
        }
    )
    assert used == {
        "pact": "is a personal agent at air.example for the people it serves",
        "a2a": "publishes 1 card extension(s): https://shop.example/ext/gift/v1",
    }


def test_the_command_says_pap_with_its_plugin(tmp_path: Path):
    spec = tmp_path / "app.yaml"
    spec.write_text(
        "id: x\nname: X\nkind: chat\npap:\n  connections:\n"
        "    - company: manzanita.example\n"
    )
    result = CliRunner().invoke(apps_cli, ["protocols", str(spec)])
    assert result.exit_code == 0, result.output
    assert "Personal Agent Protocol (pap) 0.3" in result.output
    assert "works with manzanita.example" in result.output
    assert "its own SDK's plugins" not in result.output


def test_the_command(tmp_path: Path):
    spec = tmp_path / "app.yaml"
    spec.write_text("id: x\nname: X\nkind: chat\nconnections:\n  - server: gmail\n")
    result = CliRunner().invoke(apps_cli, ["protocols", str(spec), "--json"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert {p["id"] for p in data["protocols"]} == IDS
    assert data["uses"] == {"mcp": "reaches 1 connection(s): gmail"}
