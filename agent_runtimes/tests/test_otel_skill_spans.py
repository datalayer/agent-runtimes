# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The skill a ``load_skill`` call loads, on its tool span (AC-15).

An agent with agent-skills' toolset over datalayer-skills' own skills
loads ``datalayer-whoami``; the ``execute_tool`` span of that call carries
``invoked_skill``, ``skill_content`` (its ``SKILL.md``) and
``available_skills`` (every skill it could have chosen), as AgentCore's
skill evaluators read them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

import pytest
from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.otel.genai import instrumentation_settings
from agent_runtimes.otel.skill_spans import (
    AVAILABLE_SKILLS,
    INVOKED_SKILL,
    SKILL_CONTENT,
    SkillSpanCapability,
)

datalayer_skills = pytest.importorskip("datalayer_skills")
agent_skills = pytest.importorskip("agent_skills")

SKILLS = Path(datalayer_skills.__file__).parent / "skills"
WHOAMI = "datalayer-whoami"


def loading(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    """Load the whoami skill once, then answer."""
    if any(
        isinstance(part, ToolReturnPart)
        for message in messages
        for part in getattr(message, "parts", [])
    ):
        return ModelResponse(parts=[TextPart("Loaded.")])
    return ModelResponse(parts=[ToolCallPart("load_skill", {"skill_name": WHOAMI})])


@pytest.fixture()
def exported() -> Iterator[tuple[SDKTracerProvider, InMemorySpanExporter]]:
    memory = InMemorySpanExporter()
    provider = SDKTracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory))
    yield provider, memory
    provider.shutdown()


def _run(provider: SDKTracerProvider, environ: dict[str, str]) -> dict[str, Any]:
    toolset = agent_skills.AgentSkillsToolset(directories=[SKILLS])
    agent = Agent(
        FunctionModel(loading),
        toolsets=[toolset],
        capabilities=[SkillSpanCapability()],
    )
    agent.instrument = instrumentation_settings(provider, environ=environ)
    assert agent.run_sync("Who am I?").output == "Loaded."
    return {name: skill for name, skill in toolset._discovered_skills.items()}


def _load_span(memory: InMemorySpanExporter) -> dict[str, Any]:
    (span,) = [
        s
        for s in memory.get_finished_spans()
        if (s.attributes or {}).get("gen_ai.tool.name") == "load_skill"
    ]
    return dict(span.attributes or {})


def test_the_load_skill_span_carries_the_skill_its_content_and_the_choice(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    skills = _run(provider, {})

    attributes = _load_span(memory)
    assert attributes["gen_ai.operation.name"] == "execute_tool"
    assert attributes[INVOKED_SKILL] == WHOAMI
    skill_md = (SKILLS / "whoami" / "SKILL.md").read_text(encoding="utf-8")
    body = skill_md.split("---", 2)[2].strip()
    assert body.splitlines()[0] in attributes[SKILL_CONTENT]
    available = json.loads(attributes[AVAILABLE_SKILLS])
    assert {item["name"] for item in available} == set(skills)
    assert WHOAMI in {item["name"] for item in available}
    assert len(available) > 1
    (whoami,) = [item for item in available if item["name"] == WHOAMI]
    assert whoami["description"].startswith("Query the authenticated user's profile")


def test_without_content_capture_the_span_names_the_skill_but_not_its_content(
    exported: tuple[SDKTracerProvider, InMemorySpanExporter],
) -> None:
    provider, memory = exported
    _run(provider, {"OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT": "false"})

    attributes = _load_span(memory)
    assert attributes[INVOKED_SKILL] == WHOAMI
    assert SKILL_CONTENT not in attributes
    assert WHOAMI in attributes[AVAILABLE_SKILLS]


def test_every_agent_of_a_spec_has_the_capability() -> None:
    class Spec:
        guardrails: list[Any] = []
        capabilities: list[Any] = []
        advanced: dict[str, Any] = {}
        model = None

    built = build_capabilities_from_agent_spec(Spec())
    assert any(isinstance(c, SkillSpanCapability) for c in built)
