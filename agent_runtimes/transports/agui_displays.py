# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's display, beside the result the page draws (REACTOR_UI RU-1).

A tool result that carried a display reaches the model as the display's model
view (``agent_runtimes.mcp.displays``) and keeps the whole display in its
``metadata``. pydantic-ai's AG-UI stream sends the page the model's content
only; this one sends the page that content with ``_meta["reactor.ui/display"]``
beside it — the shape ``resolveToolResult`` (``@datalayer/reactor/ui``) reads.
The model's message keeps the model view alone.

An agent whose answers may be heard has its voice said right after
``RUN_STARTED``: a ``voice.settings`` custom event (VO-35).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Optional

from ag_ui.core import BaseEvent, ToolCallResultEvent
from pydantic_ai.messages import FunctionToolResultEvent
from pydantic_ai.ui.ag_ui import AGUIAdapter, AGUIEventStream

from ..mcp.displays import page_meta

__all__ = ["DisplayAGUIAdapter", "DisplayAGUIEventStream", "with_page_meta"]


def with_page_meta(content: str, meta: dict[str, Any]) -> str:
    """
    A result's content as the page receives it: the model's, with ``_meta``.

    Parameters
    ----------
    content : str
        The result as the model reads it, as AG-UI serialized it: a display's
        model view, an object.
    meta : dict[str, Any]
        ``{"reactor.ui/display": …}``.

    Returns
    -------
    str
        The same object with ``_meta``, as JSON.
    """
    view = json.loads(content)
    if not isinstance(view, dict):
        raise TypeError(f"A display's model view is an object, not {type(view)!r}")
    return json.dumps({**view, "_meta": meta})


@dataclass
class DisplayAGUIEventStream(AGUIEventStream[Any, Any]):
    """AG-UI's event stream, with a tool's display beside its result."""

    #: The running agent's voice, said at the run's start (VO-35); None, nothing said.
    voice: Optional[dict[str, Any]] = None

    async def before_stream(self) -> AsyncIterator[BaseEvent]:
        async for event in super().before_stream():
            yield event
        if self.voice:
            from ..voice import settings_event  # noqa: PLC0415

            yield settings_event(self.voice)

    async def handle_function_tool_result(
        self, event: FunctionToolResultEvent
    ) -> AsyncIterator[BaseEvent]:
        meta = page_meta(event.part)
        async for sent in super().handle_function_tool_result(event):
            if meta is not None and isinstance(sent, ToolCallResultEvent):
                sent = sent.model_copy(
                    update={"content": with_page_meta(sent.content, meta)}
                )
            yield sent


class DisplayAGUIAdapter(AGUIAdapter[Any, Any]):
    """AG-UI's adapter, streaming with :class:`DisplayAGUIEventStream`."""

    def build_event_stream(self) -> DisplayAGUIEventStream:
        from ..voice import voice_of_agent  # noqa: PLC0415

        return DisplayAGUIEventStream(
            self.run_input,
            accept=self.accept,
            ag_ui_version=self.ag_ui_version,
            voice=voice_of_agent(self.agent),
        )
