# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Reactor tool bundles on the server: the backend half, as pydantic-ai tools.

A ``ReactorToolSpec`` has two halves. Its *frontend* entries are reactor
commands and can only run where the plugin is mounted — the browser sends
those as client tools with every request, the way it sends the notebook
tools, and executes them itself when the model calls one. Its *backend*
entries are the plugin's HTTP API, and those the harness can call directly:
this module turns them into a :class:`FunctionToolset` an agent runs with,
whichever transport (AG-UI, Vercel AI) is in front of it.

Each tool is built from the JSON Schema in the spec with
:meth:`pydantic_ai.Tool.from_schema`, so the model sees exactly the arguments
the spec declared, and the call is one HTTP request: path parameters
substituted, the rest as query for GET and DELETE and as the JSON body
otherwise — the same rule the browser adapter follows.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Callable, Iterable, List, Optional
from urllib.parse import quote

import httpx

from agent_runtimes.specs.reactor_tools import get_reactor_tool_spec
from agent_runtimes.types import ReactorBackendToolSpec, ReactorToolSpec

logger = logging.getLogger(__name__)

_PATH_PARAM = re.compile(r"\{(\w+)\}")
_NO_ARGUMENTS: dict[str, Any] = {"type": "object", "properties": {}}


def resolve_reactor_backend_url(
    spec: ReactorToolSpec, override: Optional[str] = None
) -> Optional[str]:
    """Where the bundle's backend is: an override, its env var, its default."""
    backend = spec.backend
    if backend is None:
        return None
    candidates = [override]
    if backend.base_url_envvar:
        candidates.append(os.environ.get(backend.base_url_envvar))
    candidates.append(backend.base_url)
    for candidate in candidates:
        if candidate:
            return candidate.rstrip("/")
    return None


def build_reactor_backend_request(
    tool: ReactorBackendToolSpec, base_url: str, args: dict[str, Any]
) -> tuple[str, str, dict[str, Any], Optional[dict[str, Any]]]:
    """``(method, url, query, json_body)`` for a call of ``tool`` with ``args``."""
    remaining = dict(args)

    def substitute(match: re.Match[str]) -> str:
        value = remaining.pop(match.group(1), None)
        return "" if value is None else quote(str(value), safe="/")

    path = _PATH_PARAM.sub(substitute, tool.path)
    method = tool.method.upper()
    url = f"{base_url}{path}"
    if method in ("GET", "DELETE"):
        query = {
            key: value for key, value in remaining.items() if value is not None
        }
        return method, url, query, None
    return method, url, {}, remaining


def _make_tool_function(
    tool: ReactorBackendToolSpec,
    base_url: str,
    client_factory: Callable[[], httpx.AsyncClient],
) -> Callable[..., Any]:
    async def call(**kwargs: Any) -> Any:
        method, url, query, body = build_reactor_backend_request(tool, base_url, kwargs)
        async with client_factory() as client:
            response = await client.request(method, url, params=query or None, json=body)
        if response.status_code >= 400:
            # The model reads this. Say what was asked and what came back.
            return {
                "error": f"{method} {url} answered {response.status_code}",
                "detail": response.text[:2000],
            }
        if response.status_code == 204 or not response.content:
            return {"ok": True}
        try:
            return response.json()
        except ValueError:
            return response.text

    call.__name__ = tool.name
    call.__doc__ = tool.description
    return call


def reactor_backend_tools(
    reactor_tool_ids: Iterable[str],
    *,
    base_url: Optional[str] = None,
    client_factory: Optional[Callable[[], httpx.AsyncClient]] = None,
) -> list[Any]:
    """The backend tools of the named bundles, as ``pydantic_ai.Tool`` objects."""
    from pydantic_ai import Tool

    factory = client_factory or (lambda: httpx.AsyncClient(timeout=30.0))
    tools: list[Any] = []
    for tool_id in reactor_tool_ids:
        spec = get_reactor_tool_spec(tool_id)
        if spec is None:
            logger.warning("Reactor tool bundle '%s' not found; skipping", tool_id)
            continue
        if not spec.enabled or spec.backend is None:
            continue
        resolved = resolve_reactor_backend_url(spec, base_url)
        if not resolved:
            logger.warning(
                "Reactor tool bundle '%s' names no backend URL; skipping its backend tools",
                tool_id,
            )
            continue
        for entry in spec.backend.tools:
            tools.append(
                Tool.from_schema(
                    _make_tool_function(entry, resolved, factory),
                    name=entry.name,
                    description=entry.description or entry.name,
                    json_schema=entry.parameters or _NO_ARGUMENTS,
                    takes_ctx=False,
                )
            )
    return tools


def reactor_backend_toolset(
    reactor_tool_ids: Iterable[str],
    *,
    base_url: Optional[str] = None,
    client_factory: Optional[Callable[[], httpx.AsyncClient]] = None,
) -> Any | None:
    """A ``FunctionToolset`` of the bundles' backend tools, or ``None`` if there are none."""
    tools = reactor_backend_tools(
        reactor_tool_ids, base_url=base_url, client_factory=client_factory
    )
    if not tools:
        return None
    from pydantic_ai.toolsets import FunctionToolset

    return FunctionToolset(tools, id="reactor-tools")


def reactor_tool_names(reactor_tool_ids: Iterable[str]) -> dict[str, list[str]]:
    """``{"frontend": [...], "backend": [...]}`` — the tool names the bundles grant."""
    frontend: list[str] = []
    backend: list[str] = []
    for tool_id in reactor_tool_ids:
        spec = get_reactor_tool_spec(tool_id)
        if spec is None or not spec.enabled:
            continue
        frontend.extend(entry.name for entry in spec.frontend)
        if spec.backend:
            backend.extend(entry.name for entry in spec.backend.tools)
    return {"frontend": frontend, "backend": backend}


def reactor_tools_requiring_approval(reactor_tool_ids: Iterable[str]) -> List[str]:
    """Tool names whose spec asks for a person's approval before they run."""
    required: list[str] = []
    for tool_id in reactor_tool_ids:
        spec = get_reactor_tool_spec(tool_id)
        if spec is None or not spec.enabled:
            continue
        required.extend(e.name for e in spec.frontend if e.approval == "manual")
        if spec.backend:
            required.extend(e.name for e in spec.backend.tools if e.approval == "manual")
    return required
