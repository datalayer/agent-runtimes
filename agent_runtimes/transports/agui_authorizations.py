# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A third party's authorization asked during an AG-UI turn, on its stream (ID-10).

A tool that needs a person's grant (``identity.oauth_token``,
``@requires_oauth``) hands the authorization URL to the run's sink and waits;
the turn's stream is blocked on that tool meanwhile. The run is therefore read
in a task of its own, and what it yields and what the sink is given are sent
in the order they come: the ``identity.authorization_required`` custom event
reaches the chat while the tool waits, and the chat draws *Connect <provider>
to continue*.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Mapping

from ag_ui.encoder import EventEncoder

from ..identity import use_authorization_sink, use_identity_context

#: Said on the queue when the run's own stream has ended.
_END = object()


async def stream_with_authorizations(
    chunks: AsyncIterator[bytes | str],
    context: Mapping[str, Any],
) -> AsyncIterator[bytes]:
    """Yield an AG-UI run's chunks with the authorization events its tools emit.

    Parameters
    ----------
    chunks : AsyncIterator[bytes | str]
        The run's SSE chunks, as the AG-UI adapter yields them; the run
        happens as they are read.
    context : Mapping[str, Any]
        What the identity providers are told of the run (``agent_id``,
        ``bearer``).

    Yields
    ------
    bytes
        The run's chunks, and each authorization event encoded as SSE.
    """
    queue: asyncio.Queue[Any] = asyncio.Queue()
    encoder = EventEncoder()

    def sink(event: Any) -> None:
        queue.put_nowait(encoder.encode(event).encode("utf-8"))

    async def read() -> None:
        try:
            async for chunk in chunks:
                queue.put_nowait(
                    chunk if isinstance(chunk, bytes) else str(chunk).encode("utf-8")
                )
        except BaseException as failure:  # handed to the reader, raised there
            queue.put_nowait(failure)
        finally:
            queue.put_nowait(_END)

    # The task copies the context: the run's tools see the sink and the run.
    with use_identity_context(context), use_authorization_sink(sink):
        reader = asyncio.ensure_future(read())
    try:
        while True:
            item = await queue.get()
            if item is _END:
                break
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        if not reader.done():
            reader.cancel()
