# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Serve the Accounting application over A2A on a runtime that is already running.

The examples server's runtime (``agent-runtimes serve --port 8765``) or any
other: its agent becomes Accounting's, and Accounting answers at
``<url>/api/v1/a2a/agents/accounting/``. From this machine it needs no key.

    python examples/sales-accounting-a2a/serve_accounting.py --url http://127.0.0.1:8765

``npm run examples`` starts a server of its own for Accounting on 8767 and
runs this with ``--wait``: it waits for that server to answer, then serves
Accounting on it, so the examples' other agents on 8765 stay as they are.
"""

from __future__ import annotations

import argparse
import time

import httpx
from agentspecs.apps import APP_CATALOGUE, dump_app

from agent_runtimes.commands.apps import configure_on


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--url", default="http://127.0.0.1:8765", help="The runtime's address."
    )
    parser.add_argument(
        "--wait",
        type=float,
        default=0,
        help="Seconds to wait for the runtime to answer before serving.",
    )
    args = parser.parse_args()
    url = args.url.rstrip("/")
    deadline = time.monotonic() + args.wait
    while True:
        try:
            httpx.get(url, timeout=2.0)
            break
        except httpx.TransportError:
            if time.monotonic() >= deadline:
                raise SystemExit(f"No runtime answers at {url}.")
            time.sleep(1.0)
    configured = configure_on(url, dump_app(APP_CATALOGUE["accounting"]), a2a_url=url)
    for note in configured.get("setup") or []:
        print(f"• {note}")
    served = configured["a2a"]
    print(f"Accounting is served over A2A at {served['url']}")
    print(f"Its card: {served['card']}")


if __name__ == "__main__":
    main()
