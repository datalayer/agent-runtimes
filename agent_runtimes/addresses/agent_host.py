# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The agent host: ``https://{name}.agent.<domain>`` on the runtime's main server.

For people, the hosted chat at ``/``; for agents:

- ``/.well-known/poppy.json`` — its ``poppy.json`` (:mod:`.poppy`), anybody;
- ``/.well-known/agent-card.json`` — its A2A Agent Card, its ``url`` this host's
  ``/a2a/``, anybody;
- ``/a2a/…`` — A2A, the agent's route on this runtime
  (``/api/v1/a2a/agents/{agent_id}/…``);
- for a company, PAP sign-in, Sessions, conversations and operations: the SDK's
  company (``company_app``), assembled by :class:`PapCompanyCapability` at this
  host; its device link (``/pap/device``) sends the person on to Studio's page;
- ``/.datalayer/…`` — a person's browser signs in with Datalayer for a private
  agent's chat (:mod:`.browser_sign_in`); a page asked for without, there first.

Everything else of this host is the main server's, for a caller its access
check admits — the runtime's own guards (a runtime launched for a deployment
answers only its application's routes) still apply. A request to another host
is the main server's, untouched.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from agent_runtimes.addresses import browser_sign_in
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.asgi import answer_json, headers_of, peer_of
from agent_runtimes.addresses.operations import OperationError
from agent_runtimes.addresses.poppy import poppy_document

#: The paths the SDK's company answers at a company's agent host.
COMPANY_PREFIXES = ("/poppy/", "/oauth/", "/.well-known/oauth-")

CARD = "/.well-known/agent-card.json"

#: The company's Device Sign-In link (``verification_uri``), on its agent host: a
#: personal agent shows a link only on the issuer's host (PAP §4.6).
DEVICE_PATH = "/pap/device"


def studio_url() -> str:
    """Where a person approves a personal agent: Datalayer's own pages."""
    return (
        os.environ.get("DATALAYER_PAP_STUDIO_URL") or "https://datalayer.ai"
    ).rstrip("/")


def device_redirect(addressed: AddressedAgent, scope: dict) -> str:
    """Studio's device page for this company, with the code from the link and nothing
    else of its query; the name is the host's, never the request's."""
    from urllib.parse import parse_qsl, urlencode

    query = (scope.get("query_string") or b"").decode("latin-1")
    code = next((value for key, value in parse_qsl(query) if key == "code"), "")
    assert addressed.hosts is not None
    said = {"slug": addressed.hosts.name, **({"code": code} if code else {})}
    return f"{studio_url()}/pap/device?{urlencode(said)}"


def _host_of(scope: dict) -> str:
    host = headers_of(scope).get("host", "")
    return host.split(":")[0].strip().lower()


class AgentHost:
    """ASGI, in front of the main server: the agent host of one agent."""

    def __init__(
        self,
        app: Any,
        addressed: AddressedAgent,
        agent_id: str,
        company: Optional[Any] = None,
    ) -> None:
        if addressed.hosts is None:
            raise ValueError(
                "An agent host is served at an address: the agent has none."
            )
        if addressed.role == "company" and company is None:
            raise ValueError("A company's agent host serves its PAP company: give it.")
        self.app = app
        self.addressed = addressed
        self.agent_id = agent_id
        self.company = company
        self.host = addressed.hosts.host("agent")

    async def _card(self) -> dict[str, Any]:
        """The agent's A2A card, as its A2A application serves it, its ``url`` this host's."""
        import httpx

        from agent_runtimes.routes.a2a import _a2a_agents

        registration = _a2a_agents.get(self.agent_id)
        if registration is None or registration.app is None:
            raise OperationError(
                503, f"{self.addressed.app.name} is not answering over A2A yet."
            )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=registration.app), base_url="http://a2a"
        ) as client:
            answered = await client.get("/.well-known/agent-card.json")
        if answered.status_code != 200:
            raise OperationError(
                503, f"{self.addressed.app.name}'s A2A card is not served yet."
            )
        card = answered.json()
        card["url"] = f"{self.addressed.hosts.agent}/a2a/"
        return card

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or _host_of(scope) != self.host:
            await self.app(scope, receive, send)
            return
        path = str(scope.get("path") or "/")
        if await browser_sign_in.answer(
            scope, receive, send, host=self.host, name=self.addressed.app.name
        ):
            return
        if self.company is not None and path == DEVICE_PATH:
            # The company's device link, opened by the person (PAP §4.6): on to Studio,
            # where they approve signed in to Datalayer; the code the SDK put in it alone.
            await browser_sign_in.redirect(send, device_redirect(self.addressed, scope))
            return
        try:
            if path == "/.well-known/poppy.json":
                await answer_json(send, 200, poppy_document(self.addressed))
                return
            if path == CARD:
                await answer_json(send, 200, await self._card())
                return
            if self.company is not None and path.startswith(COMPANY_PREFIXES):
                # Its sign-in and Sessions are the protocol's: the SDK checks each request.
                await self.company.asgi()(scope, receive, send)
                return
            caller = await self.addressed.access.identify(
                headers_of(scope), peer_of(scope)
            )
            if path == "/a2a" or path.startswith("/a2a/"):
                self.addressed.access.count(caller)
                rest = path[len("/a2a") :].lstrip("/")
                routed = f"/api/v1/a2a/agents/{self.agent_id}/{rest}"
                await self.app(
                    {**scope, "path": routed, "raw_path": routed.encode()},
                    receive,
                    send,
                )
                return
            if path == "/" and scope.get("method") in ("GET", "HEAD"):
                location = f"/static/agent.html?agentId={self.agent_id}"
                await send(
                    {
                        "type": "http.response.start",
                        "status": 303,
                        "headers": [
                            (b"location", location.encode()),
                            (b"cache-control", b"no-store"),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": b""})
                return
        except OperationError as error:
            if error.status == 401 and browser_sign_in.wants_page(scope):
                await browser_sign_in.redirect(
                    send, browser_sign_in.sign_in_location(path)
                )
                return
            await answer_json(send, error.status, error.as_dict())
            return
        await self.app(scope, receive, send)


__all__ = ["AgentHost", "COMPANY_PREFIXES"]
