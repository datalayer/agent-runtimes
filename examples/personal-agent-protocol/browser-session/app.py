# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate a PAP personal agent joining its own browser to a Session.

The browser loads the company's `browser_session_endpoint`: a form holding a
one-time `code`, tied to that browser by a `SameSite=Strict` cookie. The host
reads the code from that page only, signs a DPoP proof over it (the code is the
proof's `nonce`) with the Session Key, and the browser submits code and proof.
A replayed code, or a code submitted from another browser, is refused.
"""

from __future__ import annotations

import html
import re
from dataclasses import replace
from typing import Any

import httpx
import jwt
from personal_agent_protocol import (
    BROWSER_JOINS,
    BrowserSessionClient,
    BrowserSessionError,
    DiscoveryClient,
    DpopProofRequest,
    JoseDpopProofProvider,
    SessionClient,
    jwk_thumbprint,
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
        self.proofs: list[SecretStr] = []
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

    async def submit_join_form(self, proof: SecretStr) -> None:
        if self.form is None:
            raise BrowserSessionError("invalid_join_form", "No join form was loaded")
        endpoint, code = self.form
        self.form = None
        await self.post(endpoint, code, proof)

    async def post(self, endpoint: str, code: str, proof: SecretStr) -> httpx.Response:
        """Submit the form: the code and the proof in the body, the cookie alongside."""

        self.proofs.append(proof)
        answer = await self.http.post(
            endpoint, data={"code": code, "proof": proof.get_secret_value()}
        )
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
    description="Join the agent's own browser to an existing PAP Session with a one-time code.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_browser_session. Never request or expose a join code, proof, "
        "Session Key, company cookie, or token."
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
    # A signed-out Session: a new Session Key names it. A signed-in one joins the same way.
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE,
        issuer=metadata.issuer,
        token_endpoint=metadata.token_endpoint,
        tenant_id=TENANT,
    )

    # 1. The join: load the form in the agent's browser, sign the code with the Session
    #    Key, submit code and proof from that browser.
    joined = await BrowserSessionClient(reactor=reactor).join(
        browser_session_endpoint=endpoint,
        tenant_id=TENANT,
        issuer=metadata.issuer,
        session_key=session.session_key,
    )
    form_page = browser.page
    answer = browser.answers[-1]
    used_code = browser.codes[-1]
    # What the company checks: the proof's key is the Session Key, its nonce the code.
    join_proof = browser.proofs[-1].get_secret_value()
    proof_key = jwk_thumbprint(jwt.get_unverified_header(join_proof)["jwk"])
    proof_claims = jwt.decode(join_proof, options={"verify_signature": False})

    # The host's own proof provider, over the same Session Keys, for the attempts below.
    proofs = JoseDpopProofProvider(host.session_keys, now=clock.now)

    async def proof_over(code: str) -> SecretStr:
        return await proofs.create(
            DpopProofRequest(
                method="POST",
                url=endpoint,
                tenant_id=TENANT,
                issuer=metadata.issuer,
                session_key=session.session_key,
                nonce=code,
            )
        )

    # 2. A replayed code: the same browser, the same code, a fresh valid proof over it.
    replayed = await browser.post(endpoint, used_code, await proof_over(used_code))

    # 3. A code from another browser: the agent's browser loads a fresh form, and
    #    someone else's browser, without the cookie that ties the code, submits it.
    fresh_code = await browser.open_join_form(endpoint)
    async with network.client() as other_browser:
        stolen = await other_browser.post(
            endpoint,
            data={
                "code": fresh_code,
                "proof": (await proof_over(fresh_code)).get_secret_value(),
            },
        )
        stolen_cookie = SESSION_COOKIE in stolen.headers.get("set-cookie", "")
    # The code was used up by that attempt, whatever its result: the agent's browser
    # can't use it either.
    after_theft = await browser.post(endpoint, fresh_code, await proof_over(fresh_code))

    await browser.http.aclose()
    await http.aclose()
    if form_page is None:
        raise RuntimeError("the example world is incomplete")
    join_cookie = form_page.headers.get("set-cookie", "")
    return {
        "join_form": {
            "status": form_page.status_code,
            "has_a_one_time_code_and_an_empty_proof_field": bool(
                _CODE.search(form_page.text)
            )
            and 'name="proof"' in form_page.text,
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
            "proof_signed_with_the_session_key": proof_key == session.session_key,
            "code_is_the_proof_nonce": proof_claims.get("nonce") == used_code,
            "proof_is_for_a_post_to_the_endpoint": proof_claims.get("htm") == "POST"
            and proof_claims.get("htu") == endpoint,
            "proof_has_no_token_hash": "ath" not in proof_claims,
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
        "codes_proofs_session_key_and_cookies_withheld": True,
    }
