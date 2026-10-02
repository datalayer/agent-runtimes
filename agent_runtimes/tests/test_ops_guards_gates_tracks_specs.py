# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Ops, Guards, Gates and Tracks: four catalogues generated from agentspecs 0.0.14.

Guards check, Gates decide, Tracks record, and an Op orchestrates Cogs under
a validation strategy made of the three. A Guard extends a guardrail. All
arrive resolved.
"""

import sys
from pathlib import Path

import pytest

from agent_runtimes.specs.cogs import COG_CATALOGUE
from agent_runtimes.specs.frames import FRAME_CATALOGUE
from agent_runtimes.specs.gates import GATE_CATALOGUE, get_gate, list_gates
from agent_runtimes.specs.guardrails import GUARDRAIL_CATALOG
from agent_runtimes.specs.guards import GUARD_CATALOGUE, get_guard, list_guards
from agent_runtimes.specs.ops import OP_CATALOGUE, get_op, list_ops
from agent_runtimes.specs.tracks import TRACK_CATALOGUE, get_track, list_tracks
from agent_runtimes.types import GuardrailSpec, GuardSpec

REPO = Path(__file__).resolve().parents[2]
CODEGEN = REPO / "scripts" / "codegen"
CLONE = REPO / "agentspecs" / "agentspecs"
OP = "op-sales-pipeline-board-report"
CATEGORIES = {
    "algorithmic",
    "source-grounding",
    "consensus",
    "expert",
    "policy-safety",
    "regression-drift",
    "outcome",
}
STAGES = ["preflight", "in_flight", "post_run", "continuous"]


class TestAGuardExtendsAGuardrail:
    def test_the_type_is_a_guardrail(self) -> None:
        assert issubclass(GuardSpec, GuardrailSpec)

    @pytest.mark.parametrize("guard", list_guards(), ids=lambda guard: guard.id)
    def test_a_guard_carries_the_policy_of_the_guardrail_it_extends(
        self, guard: GuardSpec
    ) -> None:
        guardrail = GUARDRAIL_CATALOG[guard.guardrail]
        assert guard.permissions == guardrail.permissions
        assert guard.token_limits == guardrail.token_limits
        assert guard.data_handling == guardrail.data_handling
        # Its own identity, and what it adds.
        assert guard.id != guardrail.id and guard.name != guardrail.name
        assert guard.check and guard.stages and guard.category in CATEGORIES

    def test_the_catalogue_covers_every_category_and_stage(self) -> None:
        assert {guard.category for guard in list_guards()} == CATEGORIES
        assert {stage for guard in list_guards() for stage in guard.stages} == set(
            STAGES
        )

    def test_a_guard_is_found_by_id_and_by_versioned_reference(self) -> None:
        guard = GUARD_CATALOGUE["sensitive-data-guard"]
        assert get_guard("sensitive-data-guard:0.0.1") is guard
        assert guard.guardrail == "restricted-viewer"
        # The guardrail's permissions, read from `read:data` as written.
        assert guard.permissions.read_data is True
        assert guard.permissions.execute_code is False
        assert get_guard("nope") is None


class TestGatesAndTracks:
    def test_a_gate_reads_guards_of_the_catalogue_and_signals_they_report(
        self,
    ) -> None:
        assert len(list_gates()) == len(GATE_CATALOGUE) >= 8
        for gate in list_gates():
            reported = set()
            for ref in gate.guards:
                guard = get_guard(ref)
                assert guard is not None, f"{gate.id}: {ref}"
                reported |= {signal.name for signal in guard.signals}
            assert set(gate.signals) <= reported
        gate = GATE_CATALOGUE["low-confidence-review"]
        assert get_gate("low-confidence-review:0.0.1") is gate
        assert (gate.when, gate.then, gate.signals) == (
            "confidence < 0.80",
            "human_review_required",
            ["confidence"],
        )
        assert get_gate("nope") is None

    def test_a_track_says_what_is_kept_and_for_how_long(self) -> None:
        assert len(list_tracks()) == len(TRACK_CATALOGUE) >= 2
        track = TRACK_CATALOGUE["financial-reporting"]
        assert get_track("financial-reporting:0.0.1") is track
        assert (track.retain_for, track.retention_days) == ("7_years", 2555)
        for kept in list_tracks():
            assert {"guard_results", "gate_decisions", "final_output"} <= set(
                kept.include
            )
            assert kept.exchangeable is False
        assert get_track("nope") is None


class TestTheComprehensiveOp:
    def test_it_arrives_with_everything_it_names(self) -> None:
        assert [op.id for op in list_ops()] == [OP]
        op = OP_CATALOGUE[OP]
        assert get_op(f"{OP}:0.0.1") is op and get_op("nope") is None
        assert op.owner
        for cog in op.cogs:
            assert COG_CATALOGUE[cog.id].agent == cog.agent
        for frame in [*op.frames, *op.lineage]:
            assert frame in FRAME_CATALOGUE
        assert op.lineage == ["datalayer", "sales-pipeline", "board-reporting"]

    def test_its_validation_strategy_is_complete(self) -> None:
        op = OP_CATALOGUE[OP]
        by_stage = {stage: getattr(op.guards, stage) for stage in STAGES}
        assert all(by_stage.values())
        guards = [guard for stage in by_stage.values() for guard in stage]
        assert {guard.category for guard in guards} == CATEGORIES
        for guard in guards:
            assert GUARD_CATALOGUE[guard.id].guardrail == guard.guardrail
        ran = {guard.id for guard in guards}
        assert len(op.gates) == 8
        for gate in op.gates:
            assert {ref.split(":")[0] for ref in gate.guards} <= ran
        assert op.gates[-2].id == "release-approval"
        assert op.gates[-2].when == "always"
        assert op.track.id == "financial-reporting"
        assert {"totals-reconcile", "finance-review"} <= {
            guard.id for guard in op.frame_guards
        }


@pytest.mark.skipif(
    not (CLONE / "ops").is_dir(),
    reason="the agentspecs clone `make specs` checks out is not present",
)
class TestTheGenerator:
    """What `make specs` runs, against the clone it checked out."""

    @pytest.fixture(autouse=True)
    def _codegen_on_path(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.syspath_prepend(str(CODEGEN))
        kept = {
            name: module
            for name, module in sys.modules.items()
            if name == "agentspecs" or name.startswith("agentspecs.")
        }
        yield
        for name in [n for n in sys.modules if n.split(".")[0] == "agentspecs"]:
            del sys.modules[name]
        sys.modules.update(kept)

    @pytest.mark.parametrize(
        "kind, catalogue",
        [
            ("guards", GUARD_CATALOGUE),
            ("gates", GATE_CATALOGUE),
            ("tracks", TRACK_CATALOGUE),
            ("ops", OP_CATALOGUE),
        ],
    )
    def test_what_is_generated_is_what_is_committed(
        self, kind: str, catalogue: dict
    ) -> None:
        import generate_ops

        specs = generate_ops.load_specs(kind, CLONE / kind)
        assert [spec["id"] for spec in specs] == sorted(catalogue)
        python = generate_ops.generate_python_code(kind, specs)
        assert f"{generate_ops.KINDS[kind]['catalogue']}: Dict[str, " in python
        typescript = generate_ops.generate_typescript_code(kind, specs)
        assert "Object.prototype.hasOwnProperty.call" in typescript
        # The keys this generator owns are camelCase; a stage is still a value.
        for snake in generate_ops.CAMEL:
            assert f'"{snake}":' not in typescript

    def test_a_guardrails_permissions_are_typed_in_python_and_kept_in_typescript(
        self,
    ) -> None:
        import generate_ops

        specs = generate_ops.load_specs("guards", CLONE / "guards")
        python = generate_ops.generate_python_code("guards", specs)
        assert "'read_data': True" in python and "read:data" not in python
        typescript = generate_ops.generate_typescript_code("guards", specs)
        assert '"read:data": true' in typescript
        # A guardrail's own keys stay as GuardrailSpec declares them.
        assert '"token_limits"' in typescript and '"per_run"' in typescript

    def test_constants_are_named_for_the_kind_once(self) -> None:
        import generate_ops

        def name(kind: str, identity: str) -> str:
            return generate_ops._const_name(kind, {"id": identity, "version": "0.0.1"})

        assert name("guards", "schema-guard") == "SCHEMA_GUARD_0_0_1"
        assert name("tracks", "standard") == "STANDARD_TRACK_0_0_1"
        assert name("ops", "op-x") == "OP_X_0_0_1"
        assert name("gates", "release-approval") == "RELEASE_APPROVAL_GATE_0_0_1"
