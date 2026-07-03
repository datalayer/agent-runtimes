# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shared runtime lifecycle helpers.

This module centralizes runtime teardown behavior so invokers and routes can
reuse the same logic.
"""

from __future__ import annotations

import asyncio
import logging
import traceback

import httpx

logger = logging.getLogger(__name__)


def _terminate_runtime_with_core(
    runtime_id: str,
    runtime_base_url: str,
    token: str,
) -> bool:
    """Terminate a cloud runtime via datalayer-core primitives."""
    from datalayer_core.agents import terminate_cloud_agent_runtime
    from datalayer_core.client.client import DatalayerClient
    from datalayer_core.utils.urls import DatalayerURLs

    urls = DatalayerURLs.from_environment(
        run_url=runtime_base_url,
        iam_url=runtime_base_url,
        runtimes_url=runtime_base_url,
    )
    client = DatalayerClient(urls=urls, token=token)
    return terminate_cloud_agent_runtime(client, runtime_id)


async def terminate_runtime_prefer_core(
    runtime_id: str,
    runtime_base_url: str,
    token: str | None,
) -> bool:
    """Terminate a runtime, preferring datalayer-core then API fallback.

    Returns True when a termination request was issued successfully.
    """
    terminated_with_core = False
    if token:
        try:
            terminated_with_core = await asyncio.to_thread(
                _terminate_runtime_with_core,
                runtime_id,
                runtime_base_url,
                token,
            )
            logger.info(
                "Platform runtime termination via datalayer-core for %s: %s",
                runtime_id,
                terminated_with_core,
            )
        except Exception:
            logger.warning(
                "datalayer-core runtime termination failed for %s: %s",
                runtime_id,
                traceback.format_exc(),
            )

    if terminated_with_core:
        return True

    runtime_url = f"{runtime_base_url.rstrip('/')}/api/runtimes/v1/runtimes/{runtime_id}"
    logger.info("Fallback runtime termination via platform API: DELETE %s", runtime_url)
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(runtime_url, headers=headers, timeout=30)
            logger.info(
                "Fallback platform runtime termination for %s: %s %s",
                runtime_id,
                resp.status_code,
                resp.text[:200],
            )
            return 200 <= resp.status_code < 300
    except Exception:
        logger.warning(
            "Failed to terminate runtime via fallback platform API for %s: %s",
            runtime_id,
            traceback.format_exc(),
        )
        return False


async def terminate_runtime_and_local_agent(
    agent_id: str,
    runtime_id: str,
    runtime_base_url: str,
    token: str | None,
    local_server_base_url: str = "http://127.0.0.1:8765",
) -> None:
    """Terminate a runtime and remove local agent registration.

    1. Delete the local agent registration.
    2. Prefer datalayer-core runtime termination.
    3. Fallback to direct runtime API deletion.
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

    await terminate_runtime_prefer_core(
        runtime_id=runtime_id,
        runtime_base_url=runtime_base_url,
        token=token,
    )
