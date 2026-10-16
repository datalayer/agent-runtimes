# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The TypeScript shopping client at the Python merchant (EX-04).

Example Store is served on localhost by ``examples/protocols/ucp/merchant_server.py``
and the TypeScript client of ``src/protocols/ucp`` shops there over HTTP
(``ucpMerchant.integration.test.ts``): one store, both languages' clients (the
Python one is ``test_protocols_ucp.py`` and ``shopping.py``). It needs the
package's node modules; without them it is skipped, said so.
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
VITEST = next(
    (
        folder / "node_modules" / ".bin" / "vitest"
        for folder in (ROOT, *ROOT.parents)
        if (folder / "node_modules" / ".bin" / "vitest").exists()
    ),
    None,
)
SPEC = "src/protocols/ucp/ucpMerchant.integration.test.ts"


def _example_module():
    path = ROOT / "examples" / "protocols" / "ucp" / "merchant_server.py"
    spec = importlib.util.spec_from_file_location("ucp_merchant_server", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
def merchant():
    import uvicorn

    port = _free_port()
    store = _example_module().store_at("127.0.0.1", port)
    server = uvicorn.Server(
        uvicorn.Config(store.app(), host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("Example Store did not start")
        time.sleep(0.05)
    yield store
    server.should_exit = True
    thread.join(timeout=10)


def test_the_store_answers_its_profile_at_its_own_address(merchant) -> None:
    profile = httpx.get(f"{merchant.base}/.well-known/ucp").json()
    assert merchant.base in json_text(profile)


def json_text(value: object) -> str:
    import json

    return json.dumps(value)


@pytest.mark.skipif(
    VITEST is None, reason="the package's node modules are not installed"
)
def test_the_typescript_client_at_the_python_store(merchant) -> None:
    done = subprocess.run(
        [str(VITEST), "run", "--project=integration", SPEC],
        cwd=ROOT,
        env={**os.environ, "UCP_MERCHANT": merchant.base, "CI": "true"},
        capture_output=True,
        text=True,
        timeout=300,
    )
    output = done.stdout + done.stderr
    assert done.returncode == 0, output[-4000:]
    assert "1 passed" in output, output[-4000:]
    # Bought once, at the Python store.
    assert len(merchant.orders) == 1
