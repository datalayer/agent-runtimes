# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for delegation depth, the cycle guard, and what the transcript sees."""

from __future__ import annotations

from agent_runtimes.subagents.capability import (
    SubagentDefinition,
    SubagentsCapability,
    _build_subagent_capabilities,
)


def _definition(name: str) -> SubagentDefinition:
    return SubagentDefinition(
        name=name, description=f"The {name}", instructions=f"You are {name}."
    )


def _capability(**kwargs) -> SubagentsCapability:
    defaults = dict(
        subagents=[_definition("Compactor"), _definition("Fixer")],
        default_model="bedrock:model",
        include_general_purpose=False,
        agent_id="parent",
    )
    defaults.update(kwargs)
    return SubagentsCapability(**defaults)  # type: ignore[arg-type]


def _nested(parent: SubagentsCapability, name: str) -> list[SubagentsCapability]:
    return [
        capability
        for capability in _build_subagent_capabilities(
            "bedrock:model", parent=parent, subagent_name=name
        )
        if isinstance(capability, SubagentsCapability)
    ]


class TestDepth:
    def test_a_subagent_cannot_delegate_by_default(self) -> None:
        # `0` is the safe default: an agent calling an agent calling an agent
        # spends a budget nobody watched being spent.
        assert _nested(_capability(), "Compactor") == []

    def test_one_level_of_nesting_when_the_spec_allows_two(self) -> None:
        parent = _capability(max_nesting_depth=2)

        nested = _nested(parent, "Compactor")

        assert len(nested) == 1
        assert nested[0].depth == 1
        assert nested[0].chain == ("Compactor",)

    def test_nesting_stops_at_the_declared_depth(self) -> None:
        parent = _capability(max_nesting_depth=2)
        first = _nested(parent, "Compactor")[0]

        # depth 1 + 1 is not < 2, so the chain ends here.
        assert _nested(first, "Fixer") == []

    def test_a_deeper_cap_allows_a_deeper_chain(self) -> None:
        # Three specialists, because with two the cycle guard has removed both
        # by the second level and there is nothing left to offer — which is the
        # guard working, not the depth failing.
        parent = _capability(
            subagents=[
                _definition("Compactor"),
                _definition("Fixer"),
                _definition("Reproducer"),
            ],
            max_nesting_depth=3,
        )
        first = _nested(parent, "Compactor")[0]
        second = _nested(first, "Fixer")

        assert len(second) == 1
        assert second[0].chain == ("Compactor", "Fixer")
        assert [d.name for d in second[0].subagents] == ["Reproducer"]


class TestCycleGuard:
    def test_a_specialist_on_the_stack_is_not_offered_again(self) -> None:
        parent = _capability(max_nesting_depth=3)

        nested = _nested(parent, "Compactor")[0]

        # The loop cannot form, rather than being caught mid-run.
        assert [d.name for d in nested.subagents] == ["Fixer"]

    def test_no_capability_at_all_when_nothing_is_left_to_offer(self) -> None:
        parent = _capability(subagents=[_definition("Only")], max_nesting_depth=3)

        assert _nested(parent, "Only") == []

    def test_a_nested_capability_does_not_add_a_general_purpose_fallback(self) -> None:
        parent = _capability(max_nesting_depth=3)

        nested = _nested(parent, "Compactor")[0]

        # One fallback per delegation tree is enough; one per level is noise.
        assert nested.include_general_purpose is False


class TestTranscriptVisibility:
    def test_an_event_says_how_deep_it_was_and_who_asked(self) -> None:
        emitted: list[dict] = []
        capability = _capability(max_nesting_depth=2, depth=1, chain=("Compactor",))

        import agent_runtimes.streams as streams

        original = streams.enqueue_stream_message
        streams.enqueue_stream_message = lambda agent_id, message: emitted.append(
            message.payload
        )
        try:
            capability._emit_subagent_event("Fixer", "call-1", "start", task="fix it")
        finally:
            streams.enqueue_stream_message = original

        assert emitted, "the event never reached the stream"
        payload = emitted[0]
        # A nested delegation that looks like a top-level one leaves a reader
        # unable to tell what spent their tokens.
        assert payload["depth"] == 1
        assert payload["chain"] == ["Compactor", "Fixer"]
        assert payload["subagentName"] == "Fixer"

    def test_a_top_level_delegation_reads_as_depth_zero(self) -> None:
        emitted: list[dict] = []
        capability = _capability()

        import agent_runtimes.streams as streams

        original = streams.enqueue_stream_message
        streams.enqueue_stream_message = lambda agent_id, message: emitted.append(
            message.payload
        )
        try:
            capability._emit_subagent_event("Compactor", None, "start")
        finally:
            streams.enqueue_stream_message = original

        assert emitted[0]["depth"] == 0
        assert emitted[0]["chain"] == ["Compactor"]
