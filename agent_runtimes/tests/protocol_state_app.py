# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime serving one slow agent over A2A and ACP, for the restart tests (O1-11).

Run by uvicorn in a process of its own, so a test can kill it in the middle of
a run and start another over the same protocol state file. The agent answers
in two halves and waits between them for a gate file to exist, which is how a
test holds a task mid-run and then lets the next process finish it.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI

from agent_runtimes.adapters.base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolDefinition,
)
from agent_runtimes.routes.a2a import (
    A2AAgentCard,
    register_a2a_agent,
    set_a2a_app,
    unregister_a2a_agent,
)
from agent_runtimes.routes.acp import AgentInfo, register_agent
from agent_runtimes.routes.acp import router as acp_router

AGENT_ID = "slow"
GATE = Path(os.environ.get("PROTOCOL_STATE_GATE", "/nonexistent/gate"))


class SlowAgent(BaseAgent):
    """Says the first half of its answer, waits for the gate, then the second."""

    async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
        text = "".join(
            [event.data async for event in self.stream(prompt, context) if event.type == "text"]
        )
        return AgentResponse(content=text)

    async def stream(self, prompt: str, context: AgentContext) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type="text", data=f"First half of {prompt}. ")
        while not GATE.exists():
            await asyncio.sleep(0.05)
        yield StreamEvent(type="text", data="Second half.")
        yield StreamEvent(type="done", data=None)

    def get_tools(self) -> list[ToolDefinition]:
        return []

    @property
    def name(self) -> str:
        return "Slow agent"

    @property
    def description(self) -> str:
        return "Answers in two halves."

    @property
    def version(self) -> str:
        return "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    set_a2a_app(app, "/api/v1")
    register_a2a_agent(
        SlowAgent(),
        A2AAgentCard(
            id=AGENT_ID,
            name="Slow agent",
            description="Answers in two halves.",
            url=f"/api/v1/a2a/agents/{AGENT_ID}",
        ),
    )
    yield
    unregister_a2a_agent(AGENT_ID)


app = FastAPI(lifespan=lifespan)
app.include_router(acp_router, prefix="/api/v1")
register_agent(SlowAgent(), AgentInfo(id=AGENT_ID, name="Slow agent"))


@app.get("/ready")
async def ready() -> dict[str, Any]:
    return {"ready": True}
