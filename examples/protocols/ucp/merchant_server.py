# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example Store served on localhost, for a shopping client in another language (EX-04).

The test merchant of ``shopping.py`` (``agent_runtimes.protocols.ucp.merchant``)
over real HTTP — its profile at ``/.well-known/ucp``, the ``2026-08-25`` REST
binding, every answer validated by ``ucp-sdk`` — so the TypeScript client
(``src/protocols/ucp``) shops at the same store the Python one does.

    python examples/protocols/ucp/merchant_server.py --port 8812
    UCP_MERCHANT=http://127.0.0.1:8812 npx vitest run --project=integration \\
        src/protocols/ucp/ucpMerchant.integration.test.ts

``agent_runtimes/tests/test_protocols_ucp_two_languages.py`` runs both.
"""

from __future__ import annotations

import argparse

from agent_runtimes.protocols.ucp.merchant import ExampleStore


def store_at(host: str, port: int) -> ExampleStore:
    """Example Store answering at ``http://host:port`` (its profile says so)."""
    return ExampleStore(base=f"http://{host}:{port}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8812)
    args = parser.parse_args()

    import uvicorn

    store = store_at(args.host, args.port)
    print(f"Example Store: {store.base}/.well-known/ucp")
    uvicorn.run(store.app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
