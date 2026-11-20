# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's REST API, on FastAPI.

One route per operation of the agent's ``openapi``, at its path and method:
its JSON body and its path and query parameters are its inputs, checked
against the operation's schema, and the agent's answer is the response
(:func:`call_operation`). ``/openapi.json`` is the agent's own document (not
FastAPI's), ``/docs`` its reference. Every route is behind the agent's access
check: who may call it, and its rate cap.

An operation a person approves (``x-pap``) is never answered by a call alone, for
anybody, a key of its owner's included. A personal agent calling it in its Session
(the ``Poppy-Session`` header) at a company is handed to the company's own service
(the PAP SDK's ``pap.company.api``), which answers as the Operations extension says:
``403 approval_required`` with the operation to approve, then the same request with
the person's approval performed once, and a repeat answered with what it came to.
Any other caller has nobody to ask and is refused ``403 approval_required`` with a
sentence: nothing is done.
"""

from __future__ import annotations

import json
from typing import Any, Dict

from agentspecs.openapi import OpenApiOperation
from fastapi import FastAPI, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse, Response

from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.asgi import headers_of, peer_of
from agent_runtimes.addresses.operations import OperationError, approval_required

#: The header a personal agent's requests carry (PAP §5.3): its Session at the company.
SESSION_HEADER = "poppy-session"


def called_url(addressed: AddressedAgent, request: Request) -> str:
    """The URL a caller requested, as the caller wrote it: the agent's public API
    address (``https://{name}.api.<domain>``), then the request's path and query.

    A personal agent signs its Session JWT for the method and URL it called (PAP
    §5.3). Behind the ingress the server sees its own side of the connection —
    plain ``http``, since TLS ends at the ingress — so the URL the request carries
    here is not the one that was signed, and the company refused every such call
    ``invalid_session`` (found on r1, 18 November 2026). An agent with no public
    address (served locally) was called at the URL the request carries.
    """
    if addressed.hosts is None:
        return str(request.url)
    query = request.url.query
    return f"{addressed.hosts.api}{request.url.path}" + (f"?{query}" if query else "")


async def approved_through_the_company(
    addressed: AddressedAgent, request: Request
) -> Response:
    """A personal agent's call of an operation a person approves, answered by the
    company's own service (``PapCompanyCapability.api_call``): the request as it came,
    its answer as it is — the operation to approve, what the approved action came to,
    or the SDK's refusal with its challenge.
    """
    from agent_runtimes.addresses.access import client_address

    assert addressed.company is not None
    headers = headers_of(request.scope)
    answered = await addressed.company.api_call(
        request.method,
        called_url(addressed, request),
        request.url.path,
        headers,
        await request.body(),
        client_address(headers, peer_of(request.scope)) or None,
    )
    body = answered.body
    return Response(
        content=b""
        if body is None
        else body
        if isinstance(body, (bytes, str))
        else json.dumps(body, ensure_ascii=False),
        status_code=answered.status,
        headers={"Content-Type": "application/json", **dict(answered.headers or {})},
    )


def coerced(value: str, schema: Dict[str, Any]) -> Any:
    """A path or query value as its schema types it; left as written when it does not parse
    (the schema check then says why).
    """
    kind = schema.get("type")
    try:
        if kind == "integer":
            return int(value)
        if kind == "number":
            return float(value)
        if kind == "boolean" and value.lower() in ("true", "false"):
            return value.lower() == "true"
        if kind in ("array", "object"):
            return json.loads(value)
    except ValueError:
        return value
    return value


async def inputs_of(request: Request, operation: OpenApiOperation) -> Dict[str, Any]:
    """A request's inputs for ``operation``: its JSON body, then its path and query parameters."""
    inputs: Dict[str, Any] = {}
    if operation.body:
        raw = await request.body()
        try:
            body = json.loads(raw) if raw else {}
        except ValueError as error:
            raise OperationError(
                400, f"The body of {operation.operation_id} is not JSON."
            ) from error
        if not isinstance(body, dict):
            raise OperationError(
                400, f"The body of {operation.operation_id} is a JSON object."
            )
        inputs.update(body)
    properties = operation.input_schema.get("properties") or {}
    for name, location in operation.parameters:
        value = (
            request.path_params.get(name)
            if location == "path"
            else request.query_params.get(name)
        )
        if value is not None:
            inputs[name] = coerced(str(value), properties.get(name) or {})
    return inputs


def api_app(addressed: AddressedAgent) -> FastAPI:
    """The agent's REST API."""
    app = FastAPI(
        title=addressed.app.name,
        description=addressed.app.description,
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )

    @app.exception_handler(OperationError)
    async def refused(_: Request, error: OperationError) -> JSONResponse:
        headers = (
            {"WWW-Authenticate": 'Bearer realm="datalayer"'}
            if error.status == 401
            else None
        )
        return JSONResponse(error.as_dict(), status_code=error.status, headers=headers)

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi() -> JSONResponse:
        return JSONResponse(addressed.published_document())

    @app.get("/docs", include_in_schema=False)
    async def docs() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url="/openapi.json", title=f"{addressed.app.name} — API"
        )

    @app.get("/healthz", include_in_schema=False)
    async def health() -> Dict[str, Any]:
        return {
            "success": True,
            "operations": [op.operation_id for op in addressed.operations],
        }

    def route(operation: OpenApiOperation) -> Any:
        async def answer(request: Request) -> Response:
            if operation.pap:
                if addressed.company is not None and request.headers.get(
                    SESSION_HEADER
                ):
                    return await approved_through_the_company(addressed, request)
                # Who may call it is checked first, as for any operation; then nobody
                # is there to approve it, whoever calls.
                await addressed.access.admit(
                    headers_of(request.scope), peer_of(request.scope)
                )
                raise approval_required()
            caller = await addressed.access.admit(
                headers_of(request.scope), peer_of(request.scope)
            )
            inputs = await inputs_of(request, operation)
            return JSONResponse(
                await addressed.call(
                    operation.operation_id, inputs, interface="api", caller=caller
                )
            )

        answer.__name__ = operation.operation_id
        return answer

    for operation in addressed.operations:
        app.add_api_route(
            operation.path,
            route(operation),
            methods=[operation.method.upper()],
            name=operation.operation_id,
            include_in_schema=False,
        )
    return app


__all__ = [
    "SESSION_HEADER",
    "api_app",
    "approved_through_the_company",
    "called_url",
    "coerced",
    "inputs_of",
]
