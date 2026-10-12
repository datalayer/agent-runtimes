# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's display, kept for the page; its model view, for the model (REACTOR_UI RU-1).

An MCP tool may answer with a Reactor UI display beside its result, in the
result's ``_meta["reactor.ui/display"]`` — the gateway's ``pap_sign_in`` with
a ``PapSignIn``. pydantic-ai's MCP client maps a result to what the model reads
and drops ``_meta``, so the display would never reach the page.

:class:`DisplayMCPToolset` is the MCP toolset agent-runtimes builds everywhere.
A call whose result carries a display returns a ``ToolReturn``:

- the model reads the display's model view — its type, its text and its
  ``both`` fields, never a ``page`` one (a device sign-in's page and code);
  a display whose type is not registered here gives the model its text only,
  since nothing here can tell which of its fields are for the page;
- the page receives the whole wire display, as the return's ``metadata``
  (:func:`page_meta`), which the AG-UI stream puts beside the result the page
  draws (``agent_runtimes.transports.agui_displays``).

A result without a display passes through as pydantic-ai maps it.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

# The display types the runtime's tools answer with: importing them registers
# them in `DISPLAY_TYPES` (PAP's sign-in, from the gateway's `pap_sign_in`).
import personal_agent_protocol.ui  # noqa: F401
from fastmcp.client.client import CallToolResult
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import ToolReturn, ToolReturnPart
from reactor.ui import DISPLAY_META_KEY, DISPLAY_TYPES, DisplayWire

__all__ = [
    "MCP_INIT_TIMEOUT",
    "DisplayMCPToolset",
    "McpServerUnreachable",
    "model_view_of",
    "page_meta",
    "returned",
]

#: The displays the results of the call under way carried, as their tool
#: returned them: set by `DisplayMCPToolset.call_tool`, filled by its client.
_caught: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "reactor_ui_displays", default=None
)


def model_view_of(wire: DisplayWire) -> dict[str, Any]:
    """
    What a model is told about a display.

    Parameters
    ----------
    wire : DisplayWire
        The display as the tool returned it.

    Returns
    -------
    dict[str, Any]
        Its class's model view when its type is registered; otherwise its type
        and text, and none of its data.
    """
    cls = DISPLAY_TYPES.get(wire.type, wire.version)
    if cls is None:
        return {"type": wire.type, "text": wire.text}
    return cls.from_wire(wire).model_view()


def returned(display: dict[str, Any]) -> ToolReturn[Any]:
    """
    A result that carried a display, as the model and the page receive it.

    Parameters
    ----------
    display : dict[str, Any]
        ``_meta["reactor.ui/display"]`` of the tool's result.

    Returns
    -------
    ToolReturn
        The display's model view for the model, the whole display for the page.
    """
    wire = DisplayWire.model_validate(display)
    return ToolReturn(
        return_value=model_view_of(wire),
        metadata={DISPLAY_META_KEY: wire.model_dump(mode="json")},
    )


def page_meta(part: object) -> dict[str, Any] | None:
    """
    The ``_meta`` the page receives with a tool's result, when it has one.

    Parameters
    ----------
    part : object
        A tool's result part.

    Returns
    -------
    dict[str, Any] | None
        ``{"reactor.ui/display": …}`` for a result that carried a display.
    """
    if not isinstance(part, ToolReturnPart) or not isinstance(part.metadata, dict):
        return None
    display = part.metadata.get(DISPLAY_META_KEY)
    return None if display is None else {DISPLAY_META_KEY: display}


#: How long an MCP server has to answer its handshake, in seconds, when the
#: toolset is not told otherwise. pydantic-ai's own default is 5 s, and a cold
#: gateway worker takes 7 to 10 s to start and answer `initialize`
#: (2026-10-12: 9.6 s and 6.9 s): the run failed in 5 s with
#: "Client failed to connect" before the gateway had answered.
MCP_INIT_TIMEOUT = 30.0


class McpServerUnreachable(RuntimeError):
    """An MCP server a run needs did not open: said in a sentence, the run ends."""


class DisplayMCPToolset(MCPToolset):
    """
    An MCP toolset whose results' displays reach the page, not the model.

    Built as ``MCPToolset`` is. Its client keeps what pydantic-ai's mapping of
    a result drops: the display in its ``_meta``. Without an `init_timeout` of
    its own it waits :data:`MCP_INIT_TIMEOUT` for the handshake, and a server
    that does not open ends the run with :class:`McpServerUnreachable`, which
    names the server and how long it was given.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        from fastmcp.client import Client  # noqa: PLC0415

        given = args[0] if args else kwargs.get("client")
        if not isinstance(given, Client):
            # A pre-built Client carries its own; passing one beside it is refused.
            kwargs.setdefault("init_timeout", MCP_INIT_TIMEOUT)
        self._init_timeout = kwargs.get("init_timeout")
        super().__init__(*args, **kwargs)
        call = self.client.call_tool

        async def call_tool(*a: Any, **kw: Any) -> Any:
            result = await call(*a, **kw)
            # A task's handle is not its result: a call run as a task keeps
            # pydantic-ai's mapping alone.
            if isinstance(result, CallToolResult):
                display = (result.meta or {}).get(DISPLAY_META_KEY)
                if display is not None:
                    caught = _caught.get()
                    if caught is None:
                        raise RuntimeError(
                            "A tool answered with a display outside a call of "
                            "its toolset"
                        )
                    caught.append(display)
            return result

        self.client.call_tool = call_tool  # type: ignore[method-assign]

    async def __aenter__(self) -> "DisplayMCPToolset":
        try:
            await super().__aenter__()
        except Exception as error:
            # pydantic-ai says "Client failed to connect: " — often with nothing
            # after the colon (a timeout's message is empty). The run's error is
            # what the page shows: it says which server, and how long it waited.
            cause = error.__cause__ or error
            detail = str(error).strip() or type(cause).__name__
            waited = (
                f" (it was given {self._init_timeout:g} s to answer)"
                if isinstance(self._init_timeout, (int, float))
                else ""
            )
            raise McpServerUnreachable(
                f"The MCP server `{self.id or self.label}` did not open{waited}, "
                f"so this run stopped before using it: {detail}"
            ) from error
        return self

    async def call_tool(
        self, name: str, tool_args: dict[str, Any], ctx: Any, tool: Any
    ) -> Any:
        caught: list[dict[str, Any]] = []
        token = _caught.set(caught)
        try:
            value = await super().call_tool(name, tool_args, ctx, tool)
        finally:
            _caught.reset(token)
        if not caught:
            return value
        if len(caught) > 1:
            raise RuntimeError(f"Tool {name!r} answered with {len(caught)} displays")
        return returned(caught[0])
