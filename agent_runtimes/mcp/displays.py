# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's display, kept for the page; its model view, for the model (RU-1).

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

A server that no longer knows the toolset's session (its process restarted,
its replica changed, or it reaped the session as idle) answers 404 "Session
not found". The MCP spec says the client then opens a new session; the SDK's
client gives up instead, and the run failed with ``RuntimeError: Session not
found``. The toolset opens a new session once and asks that one call again
(:func:`session_lost`); a second loss, or any other error, surfaces as before.
"""

from __future__ import annotations

import logging
from contextlib import AsyncExitStack
from contextvars import ContextVar
from typing import Any

# The display types the runtime's tools answer with: importing them registers
# them in `DISPLAY_TYPES` (PAP's sign-in, from the gateway's `pap_sign_in`).
import personal_agent_protocol.ui  # noqa: F401
from fastmcp.client.client import CallToolResult
from fastmcp.exceptions import McpError
from mcp.types import INVALID_REQUEST
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
    "session_lost",
]

logger = logging.getLogger(__name__)

#: What the SDK's client raises when the server answers 404 to a request on a
#: session it does not know: the body the SDK's server sends ("Session not
#: found"), the client's own wording for a 404 without a JSON-RPC body
#: ("Session terminated"), and a terminated transport's body.
SESSION_LOST_MESSAGES = frozenset(
    {
        "Session not found",
        "Session terminated",
        "Not Found: Session has been terminated",
    }
)


def session_lost(error: BaseException) -> bool:
    """
    Whether an MCP call failed because the server no longer knows the session.

    Parameters
    ----------
    error : BaseException
        What the call raised.

    Returns
    -------
    bool
        True for the SDK's protocol error with code ``INVALID_REQUEST`` and one
        of :data:`SESSION_LOST_MESSAGES`, bare or the only kind in a group;
        False for anything else.
    """
    if isinstance(error, BaseExceptionGroup):
        return all(session_lost(leaf) for leaf in error.exceptions)
    return (
        isinstance(error, McpError)
        and error.error.code == INVALID_REQUEST
        and error.error.message in SESSION_LOST_MESSAGES
    )


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
        call = self._once_more_on_a_lost_session(self.client.call_tool)
        self.client.list_tools = self._once_more_on_a_lost_session(
            self.client.list_tools
        )

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

        self.client.call_tool = call_tool

    def _once_more_on_a_lost_session(self, request: Any) -> Any:
        """``request`` on the client, asked again once in a new session when
        the server has lost the one it was asked in."""

        async def asked(*a: Any, **kw: Any) -> Any:
            lost = self._open_session()
            try:
                return await request(*a, **kw)
            except BaseException as error:
                if lost is None or not session_lost(error):
                    raise
            await self._reopen(lost)
            return await request(*a, **kw)

        return asked

    def _open_session(self) -> object | None:
        """The client's session under way, or None when none is open."""
        try:
            return self.client.session
        except RuntimeError:
            return None

    async def _reopen(self, lost: object) -> None:
        """
        Close the client's session the server lost and open a new one.

        Concurrent calls that lost the same session open one new session: the
        first reopens, the others find it open already. The toolset's entries
        (``_running_count``) are kept: those under way go on in the new session.
        """
        async with self._enter_lock:
            if self._open_session() is not lost or self._exit_stack is None:
                return
            logger.warning(
                "The MCP server `%s` no longer knows its session: opening a new "
                "one and asking the call again",
                self.id or self.label,
            )
            stale, self._exit_stack = self._exit_stack, None
            try:
                await stale.aclose()
            except Exception as error:  # the old session is gone either way
                logger.debug("Closing the lost MCP session: %s", error)
            async with AsyncExitStack() as stack:
                await stack.enter_async_context(self.client)
                self._exit_stack = stack.pop_all()
            self._cached_tools = None
            self._cached_resources = None
            self._cached_prompts = None

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
