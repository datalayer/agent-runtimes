# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Traveller's demo reaches Google Maps with the demo account's own key (the user, 19 November 2026).

``demo-traveller`` connects to ``google-maps`` read only, in its owner's account, and
optional. On the visitors' runtime its key is read from one place alone: the secrets of the
account that keeps the demo books (the runtime holds that account's own key,
``DATALAYER_BATTLE_BOOKS_API_KEY``), for a public deployment of that very account
(``battle_books``, as the Accountant's demo reaches the demo Odoo). The server is then
started with the secret, and only that demo's runs reach it. No secret there, another
account's deployment, or a key in the runtime's own environment: no server, and nothing
said about Maps.

The application is read from the agentspecs checkout beside this package, so the test
follows the spec the next release ships.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional

import pytest
import yaml

from agent_runtimes.agentcore.secrets import use_secrets_reader
from agent_runtimes.apps import battle_books
from agent_runtimes.apps.battle_books import BOOKS_KEY_ENV
from agent_runtimes.guardrails.credentials import release
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)
from agent_runtimes.tests.test_apps_deployment_spec_pinned import _NoSandbox

DEMO_TRAVELLER = (
    Path(__file__).resolve().parents[2]
    / "agentspecs"
    / "agentspecs"
    / "apps"
    / "demo-traveller.yaml"
)
BOOKS = "books-key-of-the-demo-account"
DEMO_ACCOUNT = "u-datalayer-demo"
MAPS = "maps-secret-of-the-demo-account"


def _demo_traveller() -> dict:
    if not DEMO_TRAVELLER.exists():
        pytest.skip("the agentspecs checkout is not beside agent-runtimes")
    app = yaml.safe_load(DEMO_TRAVELLER.read_text())
    # Its UI plugins are the page's, not what this decides, and an installed agentspecs
    # older than the checkout may not list them yet.
    app.pop("ui", None)
    return app


class _Lifecycle:
    """The MCP servers started, with what: nothing reached over the network."""

    def __init__(self) -> None:
        self.started: dict[str, Optional[dict[str, str]]] = {}

    def is_server_running(self, server_id: str, is_config: Any = None) -> bool:
        return server_id in self.started

    def get_server_config_from_file(self, server_id: str) -> None:
        return None

    async def start_server(
        self, server_id: str, config: Any = None, extra_env: Any = None, **_: Any
    ) -> Any:
        self.started[server_id] = dict(extra_env) if extra_env else None
        return SimpleNamespace(is_running=True)

    def get_failed_servers(self) -> dict[str, str]:
        return {}


@pytest.fixture
def visitors(monkeypatch: pytest.MonkeyPatch):
    battle_books.forget_books_key()
    monkeypatch.setenv(BOOKS_KEY_ENV, BOOKS)
    monkeypatch.setenv("AGENT_RUNTIMES_VISITORS", "demo-traveller")
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    async def whoami(key: str) -> str:
        return DEMO_ACCOUNT if key == BOOKS else ""

    monkeypatch.setattr(battle_books, "_whoami", whoami)
    held: dict[str, str] = {}
    read_with: list[str] = []

    async def reader(bearer: str) -> dict[str, str]:
        read_with.append(bearer)
        return dict(held) if bearer == BOOKS else {}

    use_secrets_reader(reader)
    lifecycle = _Lifecycle()
    monkeypatch.setattr(agents_route, "get_mcp_lifecycle_manager", lambda: lifecycle)
    # The worker's spec asks for a jupyter-server sandbox: the real manager started
    # a Jupyter server and a kernel connection that nothing stopped, and the kernel
    # client's thread kept the test process alive after its last test.
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _NoSandbox(),
    )
    yield SimpleNamespace(held=held, read_with=read_with, lifecycle=lifecycle)
    use_secrets_reader(None)
    battle_books.forget_books_key()
    release(BOOKS)
    release(MAPS)


def _instance(owner: str = DEMO_ACCOUNT) -> dict[str, Any]:
    return {
        "app_uid": "01TRAVELLER",
        "deployment_uid": "dep-traveller",
        "version": 3,
        "visitor_app": "at:demo-traveller",
        "owner_uid": owner,
    }


async def _make(spy: dict, instance: dict[str, Any]) -> tuple[list[str], str]:
    request = CreateAgentRequest(
        name="at-demo-traveller",
        agent_spec_id="worker-traveller",
        app_spec=_demo_traveller(),
        app_instance=instance,
    )
    await create_agent(request, _DummyRequest())
    adapter_kwargs = spy["adapter_kwargs"]
    assert isinstance(adapter_kwargs, dict)
    selected = [s.id for s in adapter_kwargs["selected_mcp_servers"] or []]
    pydantic_kwargs = spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    instructions = " ".join(str(part) for part in pydantic_kwargs["instructions"])
    return selected, instructions


def test_the_demo_names_google_maps_optional_and_read_only_in_its_owners_account() -> (
    None
):
    connections = {c["server"]: c for c in _demo_traveller()["connections"]}
    maps = connections["google-maps:0.0.1"]
    assert maps.get("optional") is True
    assert maps.get("access") == "read" and maps.get("as") == "owner"


@pytest.mark.asyncio
async def test_with_the_accounts_secret_the_server_starts_with_it(
    visitors: Any,
    creation_spy: dict,  # noqa: F811
) -> None:
    visitors.held["GOOGLE_MAPS_API_KEY"] = MAPS
    selected, _ = await _make(creation_spy, _instance())
    assert "google-maps" in selected and "kiwi" in selected
    # Started with the account's secret, read with the account's own key, and nothing else.
    assert visitors.lifecycle.started["google-maps"] == {"GOOGLE_MAPS_API_KEY": MAPS}
    assert visitors.read_with == [BOOKS]
    # The key never lands in the process's environment.
    import os

    assert "GOOGLE_MAPS_API_KEY" not in os.environ


@pytest.mark.asyncio
async def test_without_the_accounts_secret_no_server_and_nothing_said_of_maps(
    visitors: Any,
    creation_spy: dict,  # noqa: F811
) -> None:
    selected, instructions = await _make(creation_spy, _instance())
    assert "google-maps" not in selected and "kiwi" in selected
    assert "google-maps" not in visitors.lifecycle.started
    assert "google-maps" not in instructions
    assert "GOOGLE_MAPS_API_KEY" not in instructions


@pytest.mark.asyncio
async def test_a_key_in_the_runtimes_environment_is_never_the_source(
    visitors: Any,
    creation_spy: dict,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "a-key-in-the-environment")
    selected, _ = await _make(creation_spy, _instance())
    assert "google-maps" not in selected
    assert "google-maps" not in visitors.lifecycle.started


@pytest.mark.asyncio
async def test_anybody_elses_deployment_never_reaches_the_accounts_secret(
    visitors: Any,
    creation_spy: dict,  # noqa: F811
) -> None:
    visitors.held["GOOGLE_MAPS_API_KEY"] = MAPS
    selected, _ = await _make(creation_spy, _instance(owner="u-somebody-else"))
    assert "google-maps" not in selected
    assert "google-maps" not in visitors.lifecycle.started
    # The account's secrets are not even read for it.
    assert visitors.read_with == []


@pytest.mark.asyncio
async def test_only_the_demos_runs_reach_a_server_started_with_the_secret(
    visitors: Any,
) -> None:
    from agent_runtimes.apps.battle_books import (
        books_left_out,
        owners_secret_servers_of_the_run,
        owners_secrets_left_out,
    )

    connections = [
        SimpleNamespace(
            server="google-maps:0.0.1", access="read", acts_as="owner", optional=True
        ),
        SimpleNamespace(server="kiwi:0.0.1", access="read", acts_as="owner"),
    ]
    battle_books.remember_owners_servers("at-demo-traveller", connections)
    battle_books.note_started_with_owners_secrets("google-maps")
    toolsets = [SimpleNamespace(id="google-maps"), SimpleNamespace(id="kiwi")]

    def ids(found: list) -> list[str]:
        return [t.id for t in found]

    owners = await owner_servers(owners_secret_servers_of_the_run, _instance())
    assert owners == {"google-maps"}
    assert ids(owners_secrets_left_out(toolsets, owners)) == ["google-maps", "kiwi"]
    other = await owner_servers(
        owners_secret_servers_of_the_run, _instance(owner="u-somebody-else")
    )
    assert other == frozenset()
    assert ids(owners_secrets_left_out(toolsets, other)) == ["kiwi"]
    # A run of no deployment (an example kept warm) never reaches it either.
    assert ids(books_left_out(toolsets)) == ["kiwi"]


async def owner_servers(found: Any, instance: dict[str, Any]) -> frozenset[str]:
    return await found("at-demo-traveller", instance)


@pytest.mark.asyncio
async def test_the_page_lists_google_maps_only_when_it_runs_with_the_secret(
    visitors: Any,
    creation_spy: dict,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.apps import equipment as equipment_module

    monkeypatch.setattr(
        "agent_runtimes.mcp.get_config_mcp_toolsets_status",
        lambda: {"servers": [{"id": "google-maps", "status": "started"}]},
    )

    def rows() -> dict[str, dict]:
        found = equipment_module.equipment_of_agent("at-demo-traveller")
        assert found is not None
        return {row["id"]: row for row in found["mcp_servers"]}

    # Without the account's secret, the composer's MCP menu says nothing of Maps.
    await _make(creation_spy, _instance())
    assert "google-maps" not in rows()
    # With it, the server is listed as it runs, never as left out for a variable.
    visitors.held["GOOGLE_MAPS_API_KEY"] = MAPS
    await _make(creation_spy, _instance())
    assert rows()["google-maps"]["state"] == "started"
    assert rows()["google-maps"]["missing_env_vars"] == []
