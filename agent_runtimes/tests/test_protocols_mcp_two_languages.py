# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The TypeScript MCP client at the Python server (AGENT_PROTOCOLS PR-51, EX-09).

``examples/protocols/mcp/fixture_server.py`` serves the conformance fixture's
answers on localhost over Streamable HTTP with the ``mcp`` SDK, and the
TypeScript ``McpClient`` of ``src/protocols/mcp`` (on
``@modelcontextprotocol/sdk``) reads them (``mcpServer.integration.test.ts``):
one server, both languages' clients, the same readings, across the two SDKs'
protocol versions. It needs the package's node modules; without them it is
skipped, said so.
"""

from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import threading
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[2]
VITEST = next(
    (
        folder / "node_modules" / ".bin" / "vitest"
        for folder in (ROOT, *ROOT.parents)
        if (folder / "node_modules" / ".bin" / "vitest").exists()
    ),
    None,
)
SPEC = "src/protocols/mcp/mcpServer.integration.test.ts"


def _example_module():  # type: ignore[no-untyped-def]
    path = ROOT / "examples" / "protocols" / "mcp" / "fixture_server.py"
    spec = importlib.util.spec_from_file_location("mcp_fixture_server", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
def server_url():  # type: ignore[no-untyped-def]
    import uvicorn

    example = _example_module()
    port = _free_port()
    app = example.fixture_server(example.load_fixture()).streamable_http_app(
        host="127.0.0.1"
    )
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("The MCP conformance server did not start")
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}/mcp"
    server.should_exit = True
    thread.join(timeout=10)


@pytest.mark.skipif(
    VITEST is None, reason="the package's node modules are not installed"
)
def test_the_typescript_client_at_the_python_server(server_url: str) -> None:
    done = subprocess.run(
        [str(VITEST), "run", "--project=integration", SPEC],
        cwd=ROOT,
        env={**os.environ, "MCP_FIXTURE_SERVER": server_url, "CI": "true"},
        capture_output=True,
        text=True,
        timeout=300,
    )
    output = done.stdout + done.stderr
    assert done.returncode == 0, output[-4000:]
    assert "1 passed" in output, output[-4000:]
