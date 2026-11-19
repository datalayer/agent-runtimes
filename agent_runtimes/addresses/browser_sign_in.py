# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person signs in to a private agent's page in their browser, with Datalayer.

A browser carries no API key: the agent's web page (``{name}.web``) and its
chat (``{name}.agent``) send a person who is not signed in to Datalayer's
sign-in, as an OpenID Connect client of Datalayer's authorization server
(IAM's ``/oauth/authorize``, authorization code with PKCE, scope ``openid``),
identified by its own Client ID Metadata Document at
``https://<host>/.datalayer/client.json``. Back at ``/.datalayer/callback``,
the code is exchanged for an access token, kept in an HttpOnly cookie of that
host alone (:data:`COOKIE`); the access check reads it as a bearer token and
asks IAM whose it is (``/oauth/userinfo``). The agent's own access rule still
decides: its owner and the people they allowed.

- ``GET /.datalayer/client.json`` — the client's metadata document;
- ``GET /.datalayer/sign-in?next=/…`` — to Datalayer's sign-in;
- ``GET /.datalayer/callback`` — back from it;
- ``GET /.datalayer/sign-out`` — the cookie forgotten.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Mapping, Optional
from urllib.parse import parse_qsl, urlencode

#: The paths this answers, under one prefix no other server of the agent uses.
PREFIX = "/.datalayer/"
CLIENT_PATH = "/.datalayer/client.json"
SIGN_IN_PATH = "/.datalayer/sign-in"
CALLBACK_PATH = "/.datalayer/callback"
SIGN_OUT_PATH = "/.datalayer/sign-out"

#: The cookie the access token is kept in: this host's alone (``__Host-``), never script's.
COOKIE = "__Host-datalayer-address"
#: The cookie a sign-in under way is kept in, signed: its state, PKCE verifier and where to go.
PENDING_COOKIE = "__Host-datalayer-sign-in"
#: How long a sign-in under way may take.
PENDING_SECONDS = 600

#: Signs the pending cookie: this process's own, never sent.
_SECRET = secrets.token_bytes(32)


def iam_public_url() -> str:
    """Datalayer's authorization server, as a browser reaches it."""
    from datalayer_core.utils.urls import DatalayerURLs

    url = (os.environ.get("DATALAYER_IAM_PUBLIC_URL") or "").strip() or (
        getattr(DatalayerURLs.from_environment(), "iam_url", "") or ""
    )
    return url.rstrip("/")


def cookie_of(headers: Mapping[str, str], name: str = COOKIE) -> str:
    """One cookie of a request (lower-case header names), or ``""``."""
    from http.cookies import CookieError, SimpleCookie

    raw = headers.get("cookie", "")
    if not raw:
        return ""
    try:
        jar: SimpleCookie = SimpleCookie(raw)
    except CookieError:
        return ""
    return jar[name].value if name in jar else ""


def wants_page(scope: dict) -> bool:
    """Whether a request is a browser's for a page: a GET accepting HTML."""
    if scope.get("method") not in ("GET", "HEAD"):
        return False
    for key, value in scope.get("headers") or []:
        if key.lower() == b"accept":
            return b"text/html" in value
    return False


def safe_next(value: str) -> str:
    """Where to go after signing in: a path of this host, else ``/``."""
    value = str(value or "")
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value


def _sign(payload: dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    mac = hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{mac}"


def _unsign(value: str) -> Optional[dict[str, Any]]:
    body, _, mac = str(value or "").partition(".")
    if not body or not hmac.compare_digest(
        mac, hmac.new(_SECRET, body.encode(), hashlib.sha256).hexdigest()
    ):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except ValueError:
        return None
    if not isinstance(payload, dict) or float(payload.get("until") or 0) < time.time():
        return None
    return payload


def client_document(host: str, name: str) -> dict[str, Any]:
    """The Client ID Metadata Document of the agent's page at ``host``."""
    return {
        "client_id": f"https://{host}{CLIENT_PATH}",
        "client_name": name,
        "client_uri": f"https://{host}/",
        "redirect_uris": [f"https://{host}{CALLBACK_PATH}"],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": "openid",
    }


async def _respond(
    send: Any, status: int, headers: list[tuple[bytes, bytes]], body: bytes = b""
) -> None:
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


async def redirect(send: Any, location: str, cookies: list[str] = ()) -> None:
    await _respond(
        send,
        303,
        [
            (b"location", location.encode()),
            (b"cache-control", b"no-store"),
            (b"referrer-policy", b"no-referrer"),
            *[(b"set-cookie", cookie.encode()) for cookie in cookies],
        ],
    )


def sign_in_location(path: str) -> str:
    """Where a browser that is not signed in is sent: the sign-in, then back to ``path``."""
    return f"{SIGN_IN_PATH}?{urlencode({'next': safe_next(path)})}"


async def exchange(iam: str, host: str, code: str, verifier: str) -> dict[str, Any]:
    """The authorization code exchanged at IAM for an access token."""
    import httpx

    async with httpx.AsyncClient(timeout=20.0) as client:
        answer = await client.post(
            f"{iam}/api/iam/v1/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": f"https://{host}{CALLBACK_PATH}",
                "client_id": f"https://{host}{CLIENT_PATH}",
                "code_verifier": verifier,
            },
        )
    if answer.status_code != 200:
        raise PermissionError(f"Datalayer did not sign you in ({answer.status_code}).")
    said = answer.json()
    if not said.get("access_token"):
        raise PermissionError("Datalayer answered no access token.")
    return said


async def answer(scope: dict, receive: Any, send: Any, *, host: str, name: str) -> bool:
    """Answer a request under :data:`PREFIX` at ``host``; whether it was one."""
    path = str(scope.get("path") or "")
    if scope.get("type") != "http" or not path.startswith(PREFIX):
        return False
    from agent_runtimes.addresses.asgi import answer_json, headers_of

    query = dict(parse_qsl((scope.get("query_string") or b"").decode("latin-1")))
    if path == CLIENT_PATH:
        await answer_json(
            send,
            200,
            client_document(host, name),
            [(b"cache-control", b"public, max-age=3600")],
        )
        return True
    if path == SIGN_IN_PATH:
        iam = iam_public_url()
        if not iam:
            await answer_json(
                send, 503, {"detail": "No Datalayer sign-in is configured here."}
            )
            return True
        verifier = secrets.token_urlsafe(48)
        state = secrets.token_urlsafe(24)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )
        pending = _sign(
            {
                "state": state,
                "verifier": verifier,
                "next": safe_next(query.get("next", "/")),
                "until": time.time() + PENDING_SECONDS,
            }
        )
        location = f"{iam}/api/iam/v1/oauth/authorize?" + urlencode(
            {
                "response_type": "code",
                "client_id": f"https://{host}{CLIENT_PATH}",
                "redirect_uri": f"https://{host}{CALLBACK_PATH}",
                "scope": "openid",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
        await redirect(
            send,
            location,
            [
                f"{PENDING_COOKIE}={pending}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age={PENDING_SECONDS}"
            ],
        )
        return True
    if path == CALLBACK_PATH:
        pending = _unsign(cookie_of(headers_of(scope), PENDING_COOKIE))
        if (
            pending is None
            or not query.get("code")
            or not hmac.compare_digest(str(query.get("state") or ""), pending["state"])
        ):
            await answer_json(
                send,
                400,
                {"detail": "This sign-in is not the one under way: sign in again."},
            )
            return True
        try:
            said = await exchange(
                iam_public_url(), host, query["code"], pending["verifier"]
            )
        except PermissionError as error:
            await answer_json(send, 401, {"detail": str(error)})
            return True
        age = int(said.get("expires_in") or 3600)
        await redirect(
            send,
            pending["next"],
            [
                f"{COOKIE}={said['access_token']}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age={age}",
                f"{PENDING_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
            ],
        )
        return True
    if path == SIGN_OUT_PATH:
        await redirect(
            send, "/", [f"{COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"]
        )
        return True
    await answer_json(send, 404, {"detail": "Not found."})
    return True


def iam_userinfo_checker(iam_url: str) -> Any:
    """Whose an access token Datalayer's authorization server issued is
    (``/oauth/userinfo``, its ``sub``)."""

    async def check(token: str) -> Optional[str]:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{iam_url.rstrip('/')}/api/iam/v1/oauth/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            return None
        return str((response.json() or {}).get("sub") or "") or None

    return check


__all__ = [
    "CALLBACK_PATH",
    "CLIENT_PATH",
    "COOKIE",
    "PREFIX",
    "SIGN_IN_PATH",
    "answer",
    "client_document",
    "cookie_of",
    "iam_userinfo_checker",
    "safe_next",
    "sign_in_location",
    "wants_page",
]
