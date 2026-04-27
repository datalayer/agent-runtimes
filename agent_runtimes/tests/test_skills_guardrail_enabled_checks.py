# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for enabled/disabled checks in SkillsGuardrailCapability."""

from __future__ import annotations

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails import GuardrailBlockedError, SkillsGuardrailCapability


@pytest.mark.asyncio
async def test_blocks_direct_skill_tool_when_skill_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"alpha"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: set())

    with pytest.raises(GuardrailBlockedError, match="disabled by user selection"):
        await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="run_skill_script",
                args={"skill_name": "alpha"},
                tool_call_id="tool-1",
            ),
            tool_def=None,
            args={"skill_name": "alpha"},
        )


@pytest.mark.asyncio
async def test_blocks_execute_code_when_referencing_disabled_skill(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"alpha"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: set())

    with pytest.raises(GuardrailBlockedError, match="Disabled skills cannot be used"):
        await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="execute_code",
                args={"code": "from generated.skills.alpha import run"},
                tool_call_id="tool-2",
            ),
            tool_def=None,
            args={"code": "from generated.skills.alpha import run"},
        )


@pytest.mark.asyncio
async def test_requests_approval_for_enabled_skill(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"alpha"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: {"alpha"})

    called: list[str] = []

    async def _fake_request_skill_approval(
        skill_name: str,
        *,
        source_tool: str,
        args: dict[str, object],
        requested_skill_name: str | None = None,
    ) -> None:
        called.append(f"{skill_name}:{source_tool}")

    monkeypatch.setattr(
        capability, "_request_skill_approval", _fake_request_skill_approval
    )

    await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="run_skill_script",
            args={"skill_name": "alpha"},
            tool_call_id="tool-3",
        ),
        tool_def=None,
        args={"skill_name": "alpha"},
    )

    assert called == ["alpha:run_skill_script"]


@pytest.mark.asyncio
async def test_display_name_resolves_to_skill_id_and_requests_approval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(
        capability,
        "_skills_snapshot",
        lambda: [{"id": "text-summarizer", "name": "Text Summarizer Skill"}],
    )

    called: list[str] = []

    async def _fake_request_skill_approval(
        skill_id: str,
        *,
        source_tool: str,
        args: dict[str, object],
        requested_skill_name: str | None = None,
    ) -> None:
        called.append(f"{skill_id}:{source_tool}:{requested_skill_name}")

    monkeypatch.setattr(
        capability, "_request_skill_approval", _fake_request_skill_approval
    )

    await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="run_skill_script",
            args={"skill_name": "Text Summarizer Skill"},
            tool_call_id="tool-4",
        ),
        tool_def=None,
        args={"skill_name": "Text Summarizer Skill"},
    )

    assert called == ["text-summarizer:run_skill_script:Text Summarizer Skill"]


@pytest.mark.asyncio
async def test_execute_code_display_name_resolves_to_skill_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(
        capability,
        "_skills_snapshot",
        lambda: [{"id": "text-summarizer", "name": "Text Summarizer Skill"}],
    )

    called: list[str] = []

    async def _fake_request_skill_approval(
        skill_id: str,
        *,
        source_tool: str,
        args: dict[str, object],
        requested_skill_name: str | None = None,
    ) -> None:
        called.append(f"{skill_id}:{source_tool}")

    monkeypatch.setattr(
        capability, "_request_skill_approval", _fake_request_skill_approval
    )

    await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="execute_code",
            args={
                "code": 'run_skill_script("Text Summarizer Skill", "summarize_text", [])',
            },
            tool_call_id="tool-5",
        ),
        tool_def=None,
        args={
            "code": 'run_skill_script("Text Summarizer Skill", "summarize_text", [])',
        },
    )

    assert called == ["text-summarizer:execute_code"]


@pytest.mark.asyncio
async def test_display_name_with_skill_suffix_resolves_without_snapshot_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = SkillsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(capability, "_tracked_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(capability, "_enabled_skill_ids", lambda: {"text-summarizer"})
    monkeypatch.setattr(capability, "_skills_snapshot", lambda: [])

    called: list[str] = []

    async def _fake_request_skill_approval(
        skill_id: str,
        *,
        source_tool: str,
        args: dict[str, object],
        requested_skill_name: str | None = None,
    ) -> None:
        called.append(f"{skill_id}:{source_tool}:{requested_skill_name}")

    monkeypatch.setattr(
        capability, "_request_skill_approval", _fake_request_skill_approval
    )

    await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="run_skill_script",
            args={"skill_name": "Text Summarizer Skill"},
            tool_call_id="tool-6",
        ),
        tool_def=None,
        args={"skill_name": "Text Summarizer Skill"},
    )

    assert called == ["text-summarizer:run_skill_script:Text Summarizer Skill"]
