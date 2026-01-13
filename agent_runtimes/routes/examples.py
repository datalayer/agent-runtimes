# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Routes for AG-UI example agents.

Exposes example agents demonstrating AG-UI protocol features:
- /examples/agentic_chat - Basic chat with tools
- /examples/human_in_the_loop - Approval workflows
- /examples/tool_based_generative_ui - Frontend render tools
- /examples/shared_state - Bidirectional state sync
- /examples/agentic_generative_ui - Plan-based UI generation
- /examples/backend_tool_rendering - Backend tools with UI rendering
- /examples/haiku_generative_ui - Haiku generation with UI rendering
"""

import logging
from typing import Any

from fastapi import APIRouter
from starlette.routing import Mount

logger = logging.getLogger(__name__)

# Router for example endpoints info
router = APIRouter(
    prefix="/examples",
    tags=["examples"],
)

# Store example apps for mounting
_example_apps: dict[str, Any] = {}
_initialized = False


def _init_example_apps() -> None:
    """Initialize example apps lazily."""
    global _initialized, _example_apps
    
    if _initialized:
        return
    
    try:
        from ..agents.examples import (
            agentic_chat_app,
            agentic_generative_ui_app,
            backend_tool_rendering_app,
            haiku_generative_ui_app,
            human_in_the_loop_app,
            shared_state_app,
            tool_based_generative_ui_app,
        )
        
        _example_apps = {
            "agentic_chat": agentic_chat_app,
            "human_in_the_loop": human_in_the_loop_app,
            "tool_based_generative_ui": tool_based_generative_ui_app,
            "shared_state": shared_state_app,
            "agentic_generative_ui": agentic_generative_ui_app,
            "backend_tool_rendering": backend_tool_rendering_app,
            "haiku_generative_ui": haiku_generative_ui_app,
        }
        _initialized = True
        logger.info(f"Initialized {len(_example_apps)} AG-UI example apps")
        
    except ImportError as e:
        logger.warning(f"Could not initialize AG-UI examples: {e}")
        logger.warning("Make sure pydantic-ai and ag-ui are installed")
        _initialized = True
    except Exception as e:
        # Handle OpenAI API key errors and other initialization failures
        logger.warning(f"Could not initialize AG-UI examples: {e}")
        logger.warning("Examples require OPENAI_API_KEY environment variable to be set")
        logger.warning("Set OPENAI_API_KEY to enable example agents")
        _initialized = True


def get_example_mounts(api_prefix: str = "/api/v1") -> list[Mount]:
    """Get all example app mounts for the FastAPI app.

    Args:
        api_prefix: The API prefix to use for mounting.

    Returns:
        List of Starlette Mount objects for each example.
    """
    _init_example_apps()
    
    mounts = []
    for name, app in _example_apps.items():
        # Mount each example at /api/v1/examples/{name}/
        mount = Mount(f"{api_prefix}/examples/{name}", app=app)
        mounts.append(mount)
        logger.info(f"Prepared example mount: {api_prefix}/examples/{name}/")
    
    return mounts


@router.get("/")
async def list_examples() -> dict[str, Any]:
    """List available AG-UI example agents.

    Returns:
        Dictionary with information about each example.
    """
    _init_example_apps()
    
    examples = [
        {
            "id": "agentic_chat",
            "name": "Agentic Chat",
            "description": "Basic conversational agent with tools (current time)",
            "endpoint": "/api/v1/examples/agentic_chat/",
            "features": ["Text streaming", "Tool calling", "Simple conversation"],
        },
        {
            "id": "human_in_the_loop",
            "name": "Human in the Loop",
            "description": "Agent that generates task plans requiring human approval",
            "endpoint": "/api/v1/examples/human_in_the_loop/",
            "features": ["Task planning", "User approval", "Frontend tools"],
        },
        {
            "id": "tool_based_generative_ui",
            "name": "Tool Based Generative UI",
            "description": "Agent that uses frontend tools to render UI components",
            "endpoint": "/api/v1/examples/tool_based_generative_ui/",
            "features": ["Frontend render tools", "Dynamic UI", "Rich content"],
        },
        {
            "id": "shared_state",
            "name": "Shared State",
            "description": "Recipe builder with bidirectional state sync",
            "endpoint": "/api/v1/examples/shared_state/",
            "features": ["State snapshots", "Bidirectional sync", "Recipe builder"],
        },
        {
            "id": "agentic_generative_ui",
            "name": "Agentic Generative UI",
            "description": "Agent that creates and updates plans with steps",
            "endpoint": "/api/v1/examples/agentic_generative_ui/",
            "features": ["Plan creation", "Step updates", "JSON Patch"],
        },
        {
            "id": "backend_tool_rendering",
            "name": "Backend Tool Rendering",
            "description": "Weather assistant with real API calls",
            "endpoint": "/api/v1/examples/backend_tool_rendering/",
            "features": ["Backend tools", "Real API calls", "Weather data"],
        },
    ]
    
    # Filter to only available examples
    available_ids = set(_example_apps.keys())
    available_examples = [e for e in examples if e["id"] in available_ids]
    
    return {
        "examples": available_examples,
        "count": len(available_examples),
        "protocol": "ag-ui",
        "documentation": "https://docs.copilotkit.ai/guides",
    }


@router.get("/{example_id}")
async def get_example_info(example_id: str) -> dict[str, Any]:
    """Get information about a specific example.

    Args:
        example_id: The example identifier.

    Returns:
        Information about the example.
    """
    _init_example_apps()
    
    example_info = {
        "agentic_chat": {
            "id": "agentic_chat",
            "name": "Agentic Chat",
            "description": (
                "Demonstrates a basic conversational agent with tools. "
                "The agent can chat and use tools to get real-time information "
                "like the current time in any timezone."
            ),
            "endpoint": "/api/v1/examples/agentic_chat/",
            "features": ["Text streaming", "Tool calling", "Simple conversation"],
            "tools": ["current_time"],
        },
        "human_in_the_loop": {
            "id": "human_in_the_loop",
            "name": "Human in the Loop",
            "description": (
                "Demonstrates an agent that generates task plans requiring human approval. "
                "The agent creates a list of steps and waits for the user to approve, "
                "modify, or reject them before proceeding."
            ),
            "endpoint": "/api/v1/examples/human_in_the_loop/",
            "features": ["Task planning", "User approval flow", "Frontend tools"],
            "tools": ["generate_task_steps (frontend)"],
        },
        "tool_based_generative_ui": {
            "id": "tool_based_generative_ui",
            "name": "Tool Based Generative UI",
            "description": (
                "Demonstrates an agent that uses frontend-defined tools to render "
                "dynamic UI components like cards, tables, and charts."
            ),
            "endpoint": "/api/v1/examples/tool_based_generative_ui/",
            "features": ["Frontend render tools", "Dynamic UI generation", "Rich content"],
            "tools": ["Defined by frontend"],
        },
        "shared_state": {
            "id": "shared_state",
            "name": "Shared State",
            "description": (
                "Demonstrates bidirectional state synchronization between the agent "
                "and the UI using a recipe builder example. The agent can read and "
                "update shared state, and the UI reflects changes in real-time."
            ),
            "endpoint": "/api/v1/examples/shared_state/",
            "features": ["State snapshots", "State deltas", "Bidirectional sync"],
            "tools": ["display_recipe"],
            "state_schema": {
                "recipe": {
                    "skill_level": "Beginner|Intermediate|Advanced",
                    "special_preferences": ["High Protein", "Low Carb", "..."],
                    "cooking_time": "5 min|15 min|30 min|45 min|60+ min",
                    "ingredients": [{"icon": "🥕", "name": "...", "amount": "..."}],
                    "instructions": ["Step 1...", "Step 2..."],
                }
            },
        },
        "agentic_generative_ui": {
            "id": "agentic_generative_ui",
            "name": "Agentic Generative UI",
            "description": (
                "Demonstrates an agent that generates UI through plans and steps. "
                "The agent creates a plan with multiple steps and can update "
                "individual steps as progress is made using JSON Patch."
            ),
            "endpoint": "/api/v1/examples/agentic_generative_ui/",
            "features": ["Plan creation", "Incremental updates", "JSON Patch (RFC 6902)"],
            "tools": ["create_plan", "update_plan_step"],
            "state_schema": {
                "steps": [{"description": "...", "status": "pending|completed"}]
            },
        },
        "backend_tool_rendering": {
            "id": "backend_tool_rendering",
            "name": "Backend Tool Rendering",
            "description": (
                "Demonstrates an agent that uses backend tools to fetch data "
                "which is then rendered by the frontend. Uses real weather API."
            ),
            "endpoint": "/api/v1/examples/backend_tool_rendering/",
            "features": ["Backend tool execution", "Real API calls", "Weather data"],
            "tools": ["get_weather"],
            "api_source": "Open-Meteo (https://open-meteo.com/)",
        },
    }
    
    if example_id not in example_info:
        return {"error": f"Example '{example_id}' not found"}
    
    if example_id not in _example_apps:
        return {
            **example_info[example_id],
            "status": "unavailable",
            "reason": "Example not initialized (missing dependencies?)",
        }
    
    return {
        **example_info[example_id],
        "status": "available",
    }
