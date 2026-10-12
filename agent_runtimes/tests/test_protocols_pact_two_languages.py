# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The TypeScript personal agent at the Python Provider (AGENT_PROTOCOLS EX-06).

Example Air is served on localhost by ``examples/protocols/pact/provider_server.py``
and the TypeScript personal agent of ``src/protocols/pact`` talks to it over
HTTP (``pactProvider.integration.test.ts``): one Brand, both languages'
personal agents (the Python one is ``test_protocols_pact.py`` and the example).
It needs the package's node modules; without them it is skipped, said so.
"""

from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import threading
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).parents[2]
# The package's own vitest, or the workspace's it is hoisted to.
VITEST = next(
    (
        folder / "node_modules" / ".bin" / "vitest"
        for folder in (ROOT, *ROOT.parents)
        if (folder / "node_modules" / ".bin" / "vitest").exists()
    ),
    None,
)
SPEC = "src/protocols/pact/pactProvider.integration.test.ts"


def _example_module():  # type: ignore[no-untyped-def]
    path = ROOT / "examples" / "protocols" / "pact" / "provider_server.py"
    spec = importlib.util.spec_from_file_location("pact_provider_server", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
def provider_url():  # type: ignore[no-untyped-def]
    import uvicorn

    example = _example_module()
    port = _free_port()
    provider = example.provider_at("127.0.0.1", port)
    server = uvicorn.Server(
        uvicorn.Config(
            example.example_app(provider),
            host="127.0.0.1",
            port=port,
            log_level="warning",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("Example Air did not start")
        time.sleep(0.05)
    yield base, provider
    server.should_exit = True
    thread.join(timeout=10)


def test_the_example_routes_refuse_what_they_cannot_read(provider_url) -> None:  # type: ignore[no-untyped-def]
    base, _ = provider_url
    assert httpx.post(f"{base}/example/register", json={}).status_code == 400
    assert (
        httpx.post(
            f"{base}/example/approve", json={"user_code": "NOPE", "scopes": []}
        ).status_code
        == 404
    )
    card = httpx.get(f"{base}/a2a/example-air/.well-known/agent-card.json").json()
    assert card["supportedInterfaces"][0]["url"] == f"{base}/a2a/example-air"


@pytest.mark.skipif(
    VITEST is None, reason="the package's node modules are not installed"
)
def test_the_typescript_personal_agent_at_the_python_provider(provider_url) -> None:  # type: ignore[no-untyped-def]
    base, provider = provider_url
    done = subprocess.run(
        [str(VITEST), "run", "--project=integration", SPEC],
        cwd=ROOT,
        env={**os.environ, "PACT_PROVIDER": base, "CI": "true"},
        capture_output=True,
        text=True,
        timeout=300,
    )
    output = done.stdout + done.stderr
    assert done.returncode == 0, output[-4000:]
    # The file ran its test: it was not skipped for want of a Provider.
    assert "1 passed" in output, output[-4000:]
    # The Provider registered the TypeScript agent and approved both sign-ins.
    assert "https://pa-ts.example" in provider.agents
    assert sorted(
        scope for grant in provider.grants.values() for scope in grant.approved
    ) == ["bookings:change", "bookings:read"]
