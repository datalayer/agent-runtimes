# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example Outfitters served on localhost, for a buyer in another language (AGENT_PROTOCOLS EX-05).

The test seller of ``checkout.py`` (``agent_runtimes.protocols.agentic_commerce.merchant``)
over real HTTP — its discovery at ``/.well-known/acp.json``, the
``2026-04-17`` checkout sessions, every session validated by the generated
models — so the TypeScript client (``src/protocols/agentic-commerce``) buys
at the same seller the Python one does.

    python examples/protocols/agentic_commerce/seller_server.py --port 8813
    ACP_SELLER=http://127.0.0.1:8813 npx vitest run --project=integration \\
        src/protocols/agentic-commerce/acpSeller.integration.test.ts

``agent_runtimes/tests/test_protocols_agentic_commerce_two_languages.py`` runs both.
"""

from __future__ import annotations

import argparse

from agent_runtimes.protocols.agentic_commerce.merchant import ExampleOutfitters


def seller_at(host: str, port: int) -> ExampleOutfitters:
    """Example Outfitters answering at ``http://host:port`` (its discovery says so)."""
    return ExampleOutfitters(base=f"http://{host}:{port}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8813)
    args = parser.parse_args()

    import uvicorn

    seller = seller_at(args.host, args.port)
    print(f"Example Outfitters: {seller.base}/.well-known/acp.json")
    uvicorn.run(seller.app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
