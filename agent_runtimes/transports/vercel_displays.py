# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's display, beside the output the page draws, on the Vercel AI stream (REACTOR_UI RU-1).

The Vercel AI twin of ``agent_runtimes.transports.agui_displays``: a tool
result that carried a display reaches the model as the display's model view
(``agent_runtimes.mcp.displays``) and keeps the whole display in its
``metadata``. pydantic-ai's Vercel AI stream sends the page the model's output
only; this one sends the page that output with ``_meta["reactor.ui/display"]``
beside it — the shape ``resolveToolResult`` (``@datalayer/reactor/ui``) reads.

An agent whose answers may be heard has its voice said right after the
start: a ``data-voice.settings`` data part (VOICE.md VO-36, the twin of
AG-UI's ``voice.settings``).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Optional

from pydantic_ai.messages import FunctionToolResultEvent
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from pydantic_ai.ui.vercel_ai._event_stream import VercelAIEventStream
from pydantic_ai.ui.vercel_ai.response_types import ToolOutputAvailableChunk

from ..mcp.displays import page_meta

__all__ = ["DisplayVercelAIAdapter", "DisplayVercelAIEventStream"]


@dataclass
class DisplayVercelAIEventStream(VercelAIEventStream[Any, Any]):
    """Vercel AI's event stream, with a tool's display beside its output."""

    #: The running agent's voice, said at the run's start (VO-36); None, nothing said.
    voice: Optional[dict[str, Any]] = None

    async def before_stream(self) -> AsyncIterator[Any]:
        async for chunk in super().before_stream():
            yield chunk
        if self.voice:
            from ..voice import data_part_of, settings_event  # noqa: PLC0415

            yield data_part_of(settings_event(self.voice))

    async def handle_function_tool_result(
        self, event: FunctionToolResultEvent
    ) -> AsyncIterator[Any]:
        meta = page_meta(event.part)
        async for sent in super().handle_function_tool_result(event):
            if meta is not None and isinstance(sent, ToolOutputAvailableChunk):
                if not isinstance(sent.output, dict):
                    raise TypeError(
                        "A display's model view is an object, not "
                        f"{type(sent.output)!r}"
                    )
                sent = sent.model_copy(
                    update={"output": {**sent.output, "_meta": meta}}
                )
            yield sent


class DisplayVercelAIAdapter(VercelAIAdapter[Any, Any]):
    """Vercel AI's adapter, streaming with :class:`DisplayVercelAIEventStream`."""

    def build_event_stream(self) -> DisplayVercelAIEventStream:
        from ..voice import voice_of_agent  # noqa: PLC0415

        return DisplayVercelAIEventStream(
            self.run_input,
            accept=self.accept,
            sdk_version=self.sdk_version,
            server_message_id=self.server_message_id,
            voice=voice_of_agent(self.agent),
        )
