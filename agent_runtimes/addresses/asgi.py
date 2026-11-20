# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The access check in front of an agent's servers, as ASGI."""

from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any, Iterable, Optional

from agent_runtimes.addresses.access import Caller
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.browser_sign_in import (
    redirect,
    sign_in_location,
    wants_page,
)
from agent_runtimes.addresses.operations import OperationError


async def answer_json(
    send: Any, status: int, body: Any, headers: Iterable[tuple[bytes, bytes]] = ()
) -> None:
    """Answer ``body`` as JSON with ``status``."""
    payload = json.dumps(body, ensure_ascii=False).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
                *headers,
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


def headers_of(scope: dict) -> dict[str, str]:
    """A request's headers, lower-case names."""
    return {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers") or []
    }


def peer_of(scope: dict) -> str:
    client = scope.get("client") or ("", 0)
    return str(client[0] or "")


class _AccessEnded(Exception):
    """A streamed answer's caller is no longer admitted: the answer was ended."""


async def while_admitted(
    app: Any, scope: dict, receive: Any, send: Any, access: Any, uid: str
) -> None:
    """The answer of ``app``; a streamed one (a conversation's events) ends before its next
    chunk once ``access`` (an ``AddressAccess``) no longer admits ``uid`` — somebody
    removed from "People I invite", anybody nobody names once it turned private. The
    policy is asked as at every request (read again at most every
    ``POLICY_READ_SECONDS``): the stream closes, and asking again is refused.
    """

    async def checked(message: dict) -> None:
        if message.get("type") == "http.response.body" and message.get("more_body"):
            if not (await access.current_policy()).admits(uid):
                await send(
                    {"type": "http.response.body", "body": b"", "more_body": False}
                )
                raise _AccessEnded()
        await send(message)

    try:
        await app(scope, receive, checked)
    except* _AccessEnded:
        pass


def guarded(
    app: Any,
    addressed: AddressedAgent,
    caller: ContextVar[Optional[Caller]],
    *,
    open_paths: Iterable[str] = (),
) -> Any:
    """``app``, answered only for a caller the agent's access check admits (not counted:
    the handlers count each call). ``open_paths`` answer anybody; one ending in ``/``
    opens every path under it. A browser asking for a page it may not open yet, at an
    agent with addresses, is sent to sign in (`browser_sign_in`).
    """
    opened = frozenset(open_paths)

    async def guard(scope: dict, receive: Any, send: Any) -> None:
        path = str(scope.get("path") or "")
        if (
            scope["type"] != "http"
            or path in opened
            or any(path.startswith(prefix) for prefix in opened if prefix.endswith("/"))
        ):
            await app(scope, receive, send)
            return
        try:
            found = await addressed.access.identify(headers_of(scope), peer_of(scope))
        except OperationError as error:
            if (
                error.status == 401
                and addressed.hosts is not None
                and wants_page(scope)
            ):
                # A browser: to Datalayer's sign-in, and back here.
                await redirect(send, sign_in_location(path))
                return
            await answer_json(
                send,
                error.status,
                error.as_dict(),
                [(b"www-authenticate", b'Bearer realm="datalayer"')]
                if error.status == 401
                else (),
            )
            return
        token = caller.set(found)
        try:
            await while_admitted(app, scope, receive, send, addressed.access, found.uid)
        finally:
            caller.reset(token)

    return guard


__all__ = ["answer_json", "guarded", "headers_of", "peer_of", "while_admitted"]
