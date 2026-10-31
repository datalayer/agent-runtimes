# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent is told the date on each run, not once when it is made."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.apps import today
from agent_runtimes.apps.today import today_instruction


class _Clock(datetime):
    now_is = datetime(2026, 10, 30, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.now_is


def test_the_date_is_read_on_each_run(monkeypatch) -> None:
    monkeypatch.setattr(today, "datetime", _Clock)
    said: list[str] = []

    def answer(_: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        said.append(info.instructions or "")
        return ModelResponse(parts=[TextPart("done")])

    agent = Agent(
        FunctionModel(answer), instructions=["Read the books.", today_instruction]
    )
    agent.run_sync("hello")
    monkeypatch.setattr(_Clock, "now_is", datetime(2026, 11, 2, tzinfo=timezone.utc))
    agent.run_sync("hello")

    assert "Read the books." in said[0]
    assert "Friday 30 October 2026" in said[0]
    assert "Monday 02 November 2026" in said[1]
