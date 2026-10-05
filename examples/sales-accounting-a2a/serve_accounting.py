# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Serve the Accounting application over A2A on a runtime that is already running.

The examples server's runtime (``agent-runtimes serve --port 8765``) or any
other: its agent becomes Accounting's, and Accounting answers at
``<url>/api/v1/a2a/agents/accounting/``. From this machine it needs no key.

    python examples/sales-accounting-a2a/serve_accounting.py --url http://127.0.0.1:8765
"""

from __future__ import annotations

import argparse

from agentspecs.apps import APP_CATALOGUE, dump_app

from agent_runtimes.commands.apps import configure_on


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--url", default="http://127.0.0.1:8765", help="The runtime's address."
    )
    args = parser.parse_args()
    url = args.url.rstrip("/")
    configured = configure_on(url, dump_app(APP_CATALOGUE["accounting"]), a2a_url=url)
    for note in configured.get("setup") or []:
        print(f"• {note}")
    served = configured["a2a"]
    print(f"Accounting is served over A2A at {served['url']}")
    print(f"Its card: {served['card']}")


if __name__ == "__main__":
    main()
