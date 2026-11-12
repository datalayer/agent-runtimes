# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A toolset lent to a harness, on the pod's loopback (SH-14).

The harness is given this address in place of the gateway's and of a credential
(`mcp.lent_stdio`): the bearer is added here, in the process that holds it, so it
is in no file, no argument, no header and no memory of anything a model's command
can read. What comes in is Streamable HTTP, passed on to the one URL the handle
holds, and no other: its headers but the ones that carry the protocol, its body,
and what the gateway answers, as it comes.

Answered on loopback alone, on any runtime; `apps.visitors.OwnRoutesOnly` lets it
by on a deployment's. The handle is the address: not known, it is a 404.
"""

from typing import Callable

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from agent_runtimes.apps.callers import is_loopback
from agent_runtimes.mcp.lent_stdio import held

router = APIRouter(prefix="/mcp/lent", tags=["mcp-lent"])

#: What of the harness's request goes on: the protocol's, never a credential of
#: its own, nor any header that would steer the call elsewhere.
_ASKED = (
    "accept",
    "content-type",
    "last-event-id",
    "mcp-protocol-version",
    "mcp-session-id",
)

#: What of the gateway's answer comes back.
_ANSWERED = ("cache-control", "content-type", "mcp-protocol-version", "mcp-session-id")


def _a_client() -> httpx.AsyncClient:
    """What reaches the gateway. Follows no redirect: the bearer goes to one URL.

    Its reads wait as long as the stream lasts: a server-sent stream is quiet
    until a tool answers.
    """
    return httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, read=None), follow_redirects=False
    )


#: Replaced by a test.
_client: dict[str, Callable[[], httpx.AsyncClient]] = {"make": _a_client}


def use_client(make: Callable[[], httpx.AsyncClient] | None) -> None:
    """What reaches the gateway: the real one, or a test's; ``None`` for the real one."""
    _client["make"] = make or _a_client


@router.api_route("/{handle}", methods=["GET", "POST", "DELETE"])
async def lent_toolset(handle: str, request: Request) -> Response:
    """
    The toolset a handle holds, reached with the credential held with it.

    Parameters
    ----------
    handle : str
        The handle, which is the address the harness was given.
    request : Request
        What the harness sends.

    Returns
    -------
    Response
        What the gateway answers, as it comes.
    """
    if not is_loopback(request.client.host if request.client else None):
        raise HTTPException(status_code=404, detail="Nothing is lent here.")
    try:
        lent = held(handle)
    except ValueError as nothing:
        raise HTTPException(status_code=404, detail=str(nothing)) from None
    headers = {
        name: request.headers[name] for name in _ASKED if name in request.headers
    }
    headers["Authorization"] = f"Bearer {lent['token']}"
    traceparent = lent.get("traceparent") or request.headers.get("traceparent")
    if traceparent:
        headers["traceparent"] = traceparent
    return await passed_on(request, lent["url"], headers, _ANSWERED)


async def passed_on(
    request: Request, url: str, headers: dict[str, str], answered: tuple[str, ...]
) -> Response:
    """
    Pass a request on to the one URL it is for, and its answer back as it comes.

    Parameters
    ----------
    request : Request
        What came in: its method and its body are passed on.
    url : str
        Where it goes.
    headers : dict[str, str]
        What goes with it, the bearer among them.
    answered : tuple[str, ...]
        What of the answer's headers comes back.

    Returns
    -------
    Response
        The answer, streamed.
    """
    client = _client["make"]()
    try:
        answer = await client.send(
            client.build_request(
                request.method,
                url,
                # Passed on raw: nothing here decodes what would be compressed.
                headers={**headers, "accept-encoding": "identity"},
                content=await request.body(),
            ),
            stream=True,
        )
    except httpx.HTTPError as error:
        await client.aclose()
        # Its name alone: what an error prints is nobody's to read.
        raise HTTPException(
            status_code=502,
            detail=f"It could not be reached ({type(error).__name__}).",
        ) from None

    async def closed() -> None:
        await answer.aclose()
        await client.aclose()

    return StreamingResponse(
        answer.aiter_raw(),
        status_code=answer.status_code,
        headers={
            name: answer.headers[name] for name in answered if name in answer.headers
        },
        background=BackgroundTask(closed),
    )
