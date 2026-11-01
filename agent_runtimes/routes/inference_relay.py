# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness's model calls, on the pod's loopback, on their way to ai-inference.

A harness's commands run as its user and read whatever it holds, so it holds no
token of the runtime's: it is given this address as its base URL, and in the place
of a token an opaque handle (`adapters.harness_inference.relay_handle`), which it
sends as it would the token. Here the handle is replaced by the token the runtime
holds now (`models.offered.inference_token`), read at each call, and the call goes
to ai-inference, under its v1 root, and nowhere else. A command that finds the
handle can call a model, metered as the harness is; it cannot read the token.

Answered on loopback alone, on a runtime that calls its models through
ai-inference; `apps.visitors.OwnRoutesOnly` lets it by on a deployment's.
"""

import hmac
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response

from agent_runtimes.adapters import harness_inference
from agent_runtimes.apps.callers import bearer_of, is_loopback
from agent_runtimes.routes.mcp_lent import passed_on

router = APIRouter(prefix="/inference/relay", tags=["inference-relay"])

#: What of the call does not go on: what is the connection's, and a cookie.
_NOT_PASSED_ON = frozenset(
    {
        "accept-encoding",
        "connection",
        "content-length",
        "cookie",
        "host",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)

#: What of ai-inference's answer comes back.
_ANSWERED = ("cache-control", "content-type", "retry-after", "x-request-id")

#: A path under ai-inference's v1 root: nothing that climbs out of it.
_PATH = re.compile(r"^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$")


def _is_the_handle(said: Optional[str]) -> bool:
    return hmac.compare_digest(
        (said or "").encode("utf-8"),
        harness_inference.relay_handle().encode("utf-8"),
    )


@router.api_route("/{path:path}", methods=["GET", "POST"])
async def relayed(path: str, request: Request) -> Response:
    """
    Pass a harness's model call on to ai-inference, with the runtime's token.

    Parameters
    ----------
    path : str
        Where it goes, under ai-inference's v1 root.
    request : Request
        What the harness sends.

    Returns
    -------
    Response
        What ai-inference answers, as it comes.
    """
    from agent_runtimes.models.models import _normalize_ai_inference_base_url
    from agent_runtimes.models.offered import inference_token, inference_token_refusal

    if (
        not is_loopback(request.client.host if request.client else None)
        or not harness_inference.on_datalayer()
        or not _PATH.match(path)
    ):
        raise HTTPException(status_code=404, detail="Nothing is relayed here.")
    bearer = bearer_of(request.headers.get("authorization"))
    key = request.headers.get("x-api-key")
    if not _is_the_handle(bearer) and not _is_the_handle(key):
        raise HTTPException(status_code=401, detail="That is not this harness's handle.")
    refusal = inference_token_refusal()
    token = inference_token()
    if refusal or not token:
        raise HTTPException(status_code=503, detail=refusal)
    headers = {
        name: value
        for name, value in request.headers.items()
        if name.lower() not in _NOT_PASSED_ON
    }
    headers["authorization"] = f"Bearer {token}"
    if key is not None:
        headers["x-api-key"] = token
    root = _normalize_ai_inference_base_url(
        harness_inference.inference_url()
    )
    query = request.url.query
    return await passed_on(
        request, f"{root}/{path}{'?' + query if query else ''}", headers, _ANSWERED
    )
