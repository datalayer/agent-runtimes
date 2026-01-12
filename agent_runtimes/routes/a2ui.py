# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2UI protocol route for the pydantic-ai restaurant agent."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/a2ui", tags=["a2ui"])


class A2UIQueryRequest(BaseModel):
    """Request model for A2UI query endpoint."""

    query: str | None = None
    action: str | None = None
    context: dict[str, Any] | None = None


class A2UIResponse(BaseModel):
    """Response model for A2UI endpoint."""

    success: bool
    text: str | None = None
    error: str | None = None
    a2ui_messages: list[dict[str, Any]] | None = None


def _format_a2a_response(
    a2ui_messages: list[dict[str, Any]] | None,
    text: str | None = None,
) -> list[dict[str, Any]]:
    """
    Format A2UI messages as A2A-style response parts.

    This wraps A2UI messages in the A2A DataPart format for
    compatibility with the existing A2UI renderer.
    """
    parts = []

    # Add text part if present
    if text:
        parts.append({"kind": "text", "text": text})

    # Add A2UI data parts
    if a2ui_messages:
        for msg in a2ui_messages:
            parts.append({
                "kind": "data",
                "data": msg,
            })

    return parts


@router.post("/restaurant/")
async def restaurant_query(request: A2UIQueryRequest) -> list[dict[str, Any]]:
    """
    Handle restaurant search and booking queries via A2UI protocol.

    Supports two types of requests:
    1. Query requests (query parameter): Search for restaurants
    2. Action requests (action + context): Handle button clicks, form submissions

    Returns A2A-style response with A2UI messages as data parts.
    """
    try:
        # Import here to avoid circular imports and ensure module is loaded
        from agent_runtimes.agents.restaurant_finder import (
            run_restaurant_agent,
            handle_a2ui_action,
        )

        base_url = "http://localhost:8765"

        if request.action and request.context:
            # Handle action (button click, form submission)
            logger.info(f"A2UI action: {request.action} with context: {request.context}")
            result = await handle_a2ui_action(
                request.action,
                request.context,
                base_url=base_url,
            )
        elif request.query:
            # Handle search query
            logger.info(f"A2UI query: {request.query}")
            result = await run_restaurant_agent(
                request.query,
                base_url=base_url,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Either 'query' or 'action' with 'context' must be provided",
            )

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            logger.error(f"A2UI agent error: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)

        # Format response as A2A parts
        return _format_a2a_response(
            a2ui_messages=result.get("a2ui_messages"),
            text=result.get("text"),
        )

    except ImportError as e:
        logger.error(f"Failed to import restaurant_finder module: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Restaurant finder module not available: {e}",
        )
    except Exception as e:
        logger.exception(f"A2UI restaurant error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/restaurant/health")
async def restaurant_health():
    """Health check for the A2UI restaurant endpoint."""
    try:
        from agent_runtimes.agents.restaurant_finder import restaurant_agent

        return {
            "status": "healthy",
            "agent": "restaurant_finder",
            "protocol": "a2ui",
        }
    except ImportError:
        return {
            "status": "unhealthy",
            "error": "restaurant_finder module not available",
        }
