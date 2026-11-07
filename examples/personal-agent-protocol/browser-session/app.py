# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that joins its own browser to a PAP Session (§5).

Atlas, Ada's personal agent, has a browser of its own. To let it browse
Manzanita's website as the same Session, the browser loads Manzanita's
`browser_session_endpoint`: a form holding a one-time `code`, tied to that browser
by a `SameSite=Strict` cookie. The host reads the code from that page only and
authorizes it in a request of its own, with the Session header; the browser then
submits the code alone. Manzanita checks the cookie and the code, and answers with
its own cookie for the Session.

A code works once, and only from the browser that loaded it: replaying it is
refused, and so is a code submitted from another browser, which is how a code an
attacker obtained could otherwise sign a victim's browser into the attacker's
Session (§10.6). The tool hands the model statuses and booleans; the codes, the
Session JWTs, and the cookies stay in the host.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import replace
from typing import Any
from urllib.parse import parse_qs

import httpx
from personal_agent_protocol import (
    BROWSER_JOINS,
    BrowserSessionClient,
    BrowserSessionError,
    DiscoveryClient,
    SessionClient,
    SessionHttpClient,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import CONFIG, DOMAIN, manzanita
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_manzanita_000000"
SESSION_COOKIE = "__Host-poppy_session"
_CODE = re.compile(r'<input type="hidden" name="code" value="([^"]*)">')


class AgentBrowser:
    """The personal agent's own browser (`pap.browserJoin`), never the user's.

    It has its own cookie jar. It reads the join form's code from the page it
    loaded and from nowhere else, and keeps what it saw host-side, so this example
    can try to misuse it afterwards.
    """

    def __init__(self, http: httpx.AsyncClient) -> None:
        self.http = http
        self.page: httpx.Response | None = None
        self.form: tuple[str, str] | None = None
        self.codes: list[str] = []
        self.answers: list[httpx.Response] = []

    async def open_join_form(self, endpoint: str) -> str:
        """GET the join page as a top-level navigation; the code is in its form."""

        self.page = await self.http.get(endpoint)
        found = _CODE.search(self.page.text) if self.page.status_code == 200 else None
        if found is None:
            raise BrowserSessionError(
                "invalid_join_form", "The join page holds no code"
            )
        code = html.unescape(found.group(1))
        self.form = (endpoint, code)
        self.codes.append(code)
        return code

    async def load_join_form(self, endpoint: str) -> SecretStr:
        return SecretStr(await self.open_join_form(endpoint))

    async def submit_join_form(self) -> None:
        if self.form is None:
            raise BrowserSessionError("invalid_join_form", "No join form was loaded")
        endpoint, code = self.form
        self.form = None
        await self.post(endpoint, code)

    async def post(self, endpoint: str, code: str) -> httpx.Response:
        """Submit the form: the code alone in the body, the cookie alongside."""

        answer = await self.http.post(endpoint, data={"code": code})
        self.answers.append(answer)
        return answer


class OwnBrowserPlugin:
    def __init__(self, browser: AgentBrowser) -> None:
        self.browser = browser

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            BROWSER_JOINS, self.browser, contribution_id="own-browser"
        )


app = Application(
    id="pap-browser-session",
    name="PAP Browser Session",
    description="Join the agent's own browser to a PAP Session with a one-time code.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_browser_session to explain how a personal agent joins its own "
        "browser to a PAP Session. Never request or expose a join code, Session JWT, "
        "cookie, or token."
    ),
)


@app.tool(does="read")
async def explain_browser_session() -> dict[str, Any]:
    """Join the agent's browser to a Session, then replay and steal codes; safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    # Manzanita with its website on: poppy.json lists `web.browser_session_endpoint`.
    manzanita(network, clock, config=replace(CONFIG, web=True))
    http = network.client()
    host = PersonalAgentHost(atlas, clock)
    browser = AgentBrowser(network.client())  # its own client: its own cookie jar
    reactor = personal_agent_reactor(
        host,
        network=network,
        http_client=http,
        plugins=[
            (
                PluginManifest(name="atlas-own-browser", version="1"),
                OwnBrowserPlugin(browser),
            )
        ],
    )

    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(DOMAIN)
    metadata = company.oauth_metadata
    web = company.document.web
    if not (metadata is not None and web is not None and web.browser_session_endpoint):
        raise RuntimeError("the example world is incomplete")
    endpoint = web.browser_session_endpoint
    # A signed-out Session. A signed-in one joins the same way, with its access token.
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE,
        issuer=metadata.issuer,
        tenant_id=TENANT,
    )

    # 1. The join: load the form in the agent's browser, authorize its code with the
    #    Session header, submit the code from that browser.
    transport = SessionHttpClient(reactor=reactor, http_client=http)
    joined = await BrowserSessionClient(reactor=reactor, transport=transport).join(
        browser_session_endpoint=endpoint, session=session
    )
    form_page = browser.page
    answer = browser.answers[-1]
    used_code = browser.codes[-1]
    # What the browser sent: the code alone, never the Session header or a token.
    submitted = answer.request

    # 2. A replayed code: the same browser, the same code.
    replayed = await browser.post(endpoint, used_code)

    # 3. A code from another browser: the agent's browser loads a fresh form, the agent
    #    authorizes it, and someone else's browser, without the cookie that ties the
    #    code, submits it.
    fresh_code = await browser.open_join_form(endpoint)
    await transport.request(
        "POST",
        f"{endpoint}/authorize",
        session=session,
        headers={"Content-Type": "application/json"},
        content=json.dumps({"code": fresh_code}).encode(),
    )
    async with network.client() as other_browser:
        stolen = await other_browser.post(endpoint, data={"code": fresh_code})
        stolen_cookie = SESSION_COOKIE in stolen.headers.get("set-cookie", "")
    # The code was used up by that attempt, whatever its result: the agent's browser
    # can't use it either.
    after_theft = await browser.post(endpoint, fresh_code)

    await browser.http.aclose()
    await http.aclose()
    if form_page is None:
        raise RuntimeError("the example world is incomplete")
    join_cookie = form_page.headers.get("set-cookie", "")
    return {
        "join_form": {
            "status": form_page.status_code,
            "has_a_one_time_code": bool(_CODE.search(form_page.text)),
            "cookie_ties_the_code_to_this_browser": "SameSite=Strict" in join_cookie
            and "HttpOnly" in join_cookie
            and "Secure" in join_cookie,
            "never_cached": form_page.headers.get("cache-control") == "no-store",
            "never_framed": form_page.headers.get("content-security-policy")
            == "frame-ancestors 'none'",
        },
        "join": {
            "status": answer.status_code,
            "browser_has_the_session_cookie": browser.http.cookies.get(SESSION_COOKIE)
            is not None,
            "joined_at": joined.joined_at.isoformat(),
            "form_carried_the_code_alone": set(parse_qs(submitted.content.decode()))
            == {"code"},
            "nothing_of_the_session_went_through_the_browser": not {
                "authorization",
                "poppy-session",
            }
            & set(submitted.headers),
        },
        "replayed_code": {
            "status": replayed.status_code,
            "refused": replayed.status_code == 400,
        },
        "code_from_another_browser": {
            "status": stolen.status_code,
            "refused": stolen.status_code == 400 and not stolen_cookie,
            "code_used_up_anyway": after_theft.status_code == 400,
        },
        "codes_session_jwts_and_cookies_withheld": True,
    }
