# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shared runtime lifecycle helpers.

One teardown path, so invokers and routes stop a runtime the same way — and
one word for it: `stop`, as in `code_sandboxes.lifecycle`, rather than the
`terminate` this module used to say and nothing else did.
"""

from __future__ import annotations

import asyncio
import logging
import traceback

import httpx

logger = logging.getLogger(__name__)


def _stop_runtime_with_core(
    runtime_id: str,
    runtime_base_url: str,
    token: str,
) -> bool:
    """Stop a cloud runtime via datalayer-core primitives."""
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.client import AgentClient
    from agent_runtimes.utils.agent_utils import stop_cloud_agent_runtime

    urls = DatalayerURLs.from_environment(
        runtimes_url=runtime_base_url,
        iam_url=runtime_base_url,
    )
    client = AgentClient(urls=urls, api_key=token)
    return stop_cloud_agent_runtime(client, runtime_id)


async def stop_runtime_prefer_core(
    runtime_id: str,
    runtime_base_url: str,
    token: str | None,
) -> bool:
    """Stop a runtime, preferring datalayer-core then the API fallback.

    Returns True when a stop request was issued successfully.
    """
    stopped_with_core = False
    if token:
        try:
            stopped_with_core = await asyncio.to_thread(
                _stop_runtime_with_core,
                runtime_id,
                runtime_base_url,
                token,
            )
            logger.info(
                "Platform runtime stop via datalayer-core for %s: %s",
                runtime_id,
                stopped_with_core,
            )
        except Exception:
            logger.warning(
                "datalayer-core runtime stop failed for %s: %s",
                runtime_id,
                traceback.format_exc(),
            )

    if stopped_with_core:
        return True

    runtime_url = (
        f"{runtime_base_url.rstrip('/')}/api/runtimes/v1/runtimes/{runtime_id}"
    )
    logger.info("Fallback runtime stop via platform API: DELETE %s", runtime_url)
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(runtime_url, headers=headers, timeout=30)
            logger.info(
                "Fallback platform runtime stop for %s: %s %s",
                runtime_id,
                resp.status_code,
                resp.text[:200],
            )
            return 200 <= resp.status_code < 300
    except Exception:
        logger.warning(
            "Failed to stop runtime via fallback platform API for %s: %s",
            runtime_id,
            traceback.format_exc(),
        )
        return False


async def stop_runtime_and_local_agent(
    agent_id: str,
    runtime_id: str,
    runtime_base_url: str,
    token: str | None,
    local_server_base_url: str = "http://127.0.0.1:8765",
) -> None:
    """Stop a runtime and remove its local agent registration.

    1. Delete the local agent registration.
    2. Prefer the datalayer-core runtime stop.
    3. Fall back to a direct runtime API delete.
    """
    url = f"{local_server_base_url.rstrip('/')}/api/v1/agents/{agent_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, timeout=10)
        logger.info(
            "Local agent deletion for %s: %s %s",
            agent_id,
            resp.status_code,
            resp.text[:200],
        )

    await stop_runtime_prefer_core(
        runtime_id=runtime_id,
        runtime_base_url=runtime_base_url,
        token=token,
    )
