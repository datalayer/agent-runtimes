# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent whose requests are signed, and a shop that knows it (AGENT_PROTOCOLS EX-01, EX-02).

Runs in one process, with no network: the agent's origin serves its key
directory (signed, Appendix B of draft-ietf-webbotauth-httpsig-protocol-00),
the shop verifies every request with ``WebBotAuthMiddleware``, and the agent
signs through the signer its host contributed to ``web_bot_auth.signer`` —
the Web Bot Auth plugin's contribution point; the runtime never holds a key.

    python examples/protocols/web_bot_auth/signed_agent.py

It prints the three headers of a signed request, what the shop concluded
for a signed request, a replay, an unsigned request and a stranger's, and
then rotates the agent's key with both keys published.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx
from reactor import PluginManifest
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from agent_runtimes.protocols import build_protocols_reactor, list_protocols
from agent_runtimes.protocols.web_bot_auth import (
    DIRECTORY_PATH,
    DirectoryResolver,
    LocalSigner,
    WebBotAuth,
    WebBotAuthMiddleware,
    directory_body,
    sign_directory_response,
    sign_request,
)
from agent_runtimes.protocols.web_bot_auth.plugin import SIGNERS, signer_of

AGENT = "https://agent.example"
SHOP = "https://shop.example"


@dataclass
class Keys:
    """The keys the agent's host holds; in Datalayer, Vault transit holds them."""

    signers: list[LocalSigner]


def agent_origin(keys: Keys) -> Starlette:
    """The agent's origin: its key directory, signed by every key it lists."""

    async def directory(request):
        body = directory_body([signer.public_jwk for signer in keys.signers])
        signed = await sign_directory_response(
            body=body, authority_url=str(request.url), signers=keys.signers
        )
        return Response(signed.body, headers=signed.headers)

    return Starlette(routes=[Route(DIRECTORY_PATH, directory)])


def shop(resolver: DirectoryResolver) -> WebBotAuthMiddleware:
    """A shop that answers a verified agent with its agent prices."""

    async def products(request):
        result = request.scope["state"]["web_bot_auth"]
        prices = "agent prices" if result.verified else "public prices"
        return JSONResponse(
            {"outcome": result.outcome, "agent": result.agent, "prices": prices}
        )

    return WebBotAuthMiddleware(
        Starlette(routes=[Route("/products", products)]), resolver=resolver
    )


class HostSigner:
    """The host's plugin: contributes the signer, at a lower order than any default."""

    def __init__(self, signer: LocalSigner) -> None:
        self.signer = signer

    def provide_contributions(self, contributions) -> None:
        contributions.contribute(SIGNERS, self.signer, contribution_id="host", order=10)


async def main() -> None:
    keys = Keys(signers=[LocalSigner.generate()])
    platform = build_protocols_reactor(
        plugins=[
            (PluginManifest(name="host", version="1.0.0"), HostSigner(keys.signers[0]))
        ]
    )
    print(
        "Protocols:", ", ".join(f"{p.id} {p.version}" for p in list_protocols(platform))
    )

    origin = httpx.AsyncClient(transport=httpx.ASGITransport(app=agent_origin(keys)))

    async def fetch(url):
        answer = await origin.get(url)
        return answer.status_code, dict(answer.headers), answer.content

    store = shop(DirectoryResolver.with_fetch(fetch))
    signer = signer_of(platform)

    signed = await sign_request(
        method="GET", url=f"{SHOP}/products?q=tea", signer=signer, agent=AGENT
    )
    print("\nA signed request carries:")
    for name, value in signed.as_dict().items():
        print(f"  {name}: {value[:96]}{'…' if len(value) > 96 else ''}")
    print("\nIts signature base:\n  " + signed.base.decode().replace("\n", "\n  "))

    async def ask(label, auth=None, headers=None):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=store), base_url=SHOP, auth=auth
        ) as client:
            answer = await client.get("/products?q=tea", headers=headers)
            print(f"  {label:<28} {answer.status_code} {answer.json()}")

    print("\nThe shop sees:")
    await ask("the request above", headers=signed.as_dict())
    await ask("the same request, replayed", headers=signed.as_dict())
    await ask("signed by its httpx client", auth=WebBotAuth(signer, agent=AGENT))
    await ask("unsigned")
    await ask(
        "signed by a stranger", auth=WebBotAuth(LocalSigner.generate(), agent=AGENT)
    )

    print(
        "\nThe agent rotates its key (both published while requests in flight finish):"
    )
    keys.signers.append(LocalSigner.generate())
    store = shop(DirectoryResolver.with_fetch(fetch))
    await ask("signed with the new key", auth=WebBotAuth(keys.signers[1], agent=AGENT))
    await ask("signed with the old key", auth=WebBotAuth(keys.signers[0], agent=AGENT))


if __name__ == "__main__":
    asyncio.run(main())
