# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example Air served on localhost, for a personal agent in another language (AGENT_PROTOCOLS EX-06).

The Provider of ``personal_agent.py`` (``agent_runtimes.protocols.pact.provider``)
over real HTTP, so the TypeScript personal agent (``src/protocols/pact``) talks
to the same Brand the Python one does. Two routes stand in for what happens
away from the protocol, and exist only in this example:

- ``POST /example/register`` — the personal agent's registration with the
  Provider (PACT 1.0 §3.1: its issuer and public JWKS, once);
- ``POST /example/approve`` — the person signing in at the Brand's page and
  approving some of the scopes asked (``user_code``, ``scopes``).

    python examples/protocols/pact/provider_server.py --port 8811
    PACT_PROVIDER=http://127.0.0.1:8811 npx vitest run --project=integration \\
        src/protocols/pact/pactProvider.integration.test.ts

``agent_runtimes/tests/test_protocols_pact_two_languages.py`` runs both.
"""

from __future__ import annotations

import argparse

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route

from agent_runtimes.protocols.pact.provider import ExampleAir

#: The Brand user the person signs in as at Example Air.
BRAND_USER = "jane-4471"


def example_app(provider: ExampleAir) -> Starlette:
    """The Provider's own routes, and the example's registration and approval."""

    async def register(request: Request) -> Response:
        body = await request.json()
        issuer, jwks = body.get("issuer"), body.get("jwks")
        if not isinstance(issuer, str) or not isinstance(jwks, dict):
            return JSONResponse({"error": "issuer and jwks are required"}, 400)
        provider.register(issuer, jwks)
        return Response(status_code=204)

    async def approve(request: Request) -> Response:
        body = await request.json()
        user_code, scopes = body.get("user_code"), body.get("scopes")
        if not isinstance(user_code, str) or not isinstance(scopes, list):
            return JSONResponse({"error": "user_code and scopes are required"}, 400)
        try:
            provider.approve(user_code, BRAND_USER, [str(s) for s in scopes])
        except StopIteration:
            return JSONResponse({"error": "no sign-in under this code"}, 404)
        return Response(status_code=204)

    return Starlette(
        routes=[
            Route("/example/register", register, methods=["POST"]),
            Route("/example/approve", approve, methods=["POST"]),
            Mount("/", app=provider.app()),
        ]
    )


def provider_at(host: str, port: int) -> ExampleAir:
    """Example Air answering at ``http://host:port`` (its card's URLs say so)."""
    base = f"http://{host}:{port}"
    return ExampleAir(base=base, audience=f"{base}/a2a")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8811)
    args = parser.parse_args()

    import uvicorn

    provider = provider_at(args.host, args.port)
    print(f"Example Air: {provider.interface_url}/.well-known/agent-card.json")
    uvicorn.run(example_app(provider), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
