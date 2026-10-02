# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Frames and Cogs: two catalogues generated from agentspecs 0.0.12.

A Frame is owned, scoped context that inherits; a Cog extends an agent spec
and is equipped with Frames. Both arrive resolved: a runtime reads a flat
spec and keeps no inheritance logic.
"""

import sys
from pathlib import Path

import pytest

from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.specs.cogs import COG_CATALOGUE, cogs_using, get_cog, list_cogs
from agent_runtimes.specs.frames import FRAME_CATALOGUE, get_frame, list_frames
from agent_runtimes.types import Agentspec, CogSpec, FrameSpec

REPO = Path(__file__).resolve().parents[2]
CODEGEN = REPO / "scripts" / "codegen"
CLONE = REPO / "agentspecs" / "agentspecs"


def _ids(entries: list) -> list[str]:
    return [entry if isinstance(entry, str) else entry.id for entry in entries]


class TestTheFrameCatalogue:
    def test_it_lists_every_frame_owned_and_scoped(self) -> None:
        assert {
            "datalayer",
            "web-research",
            "sales-pipeline",
            "board-reporting",
            "customer-research",
        } <= set(FRAME_CATALOGUE)
        for frame in list_frames():
            assert isinstance(frame, FrameSpec)
            assert frame.owner and frame.scope and frame.rules

    def test_a_frame_is_found_by_id_and_by_versioned_reference(self) -> None:
        assert get_frame("web-research").id == "web-research"
        assert get_frame("web-research:0.0.1").id == "web-research"
        assert get_frame("nope") is None

    def test_a_frame_arrives_with_what_it_inherits(self) -> None:
        company = get_frame("datalayer")
        child = get_frame("web-research")
        assert child.extends == "datalayer:0.0.1"
        assert child.lineage == ["datalayer"] and company.lineage == []
        assert child.rules[: len(company.rules)] == company.rules
        assert len(child.rules) > len(company.rules)
        assert set(company.terminology) < set(child.terminology)
        assert child.guards[0].id == "no-secrets"
        # Its own identity, owner and tags; not its parent's.
        assert child.owner != company.owner
        assert not set(company.tags) & set(child.tags)


class TestTheCogCatalogue:
    def test_it_lists_the_three_worker_cogs(self) -> None:
        assert {cog.id: cog.agent for cog in list_cogs()} == {
            "cog-crawler": "worker-crawler",
            "cog-sales-pipeline-board-report": "worker-sales-pipeline-board-report",
            "cog-customer-interviewer": "worker-customer-interviewer",
        }
        assert get_cog("cog-crawler:0.0.1") is COG_CATALOGUE["cog-crawler"]
        assert get_cog("nope") is None

    @pytest.mark.parametrize("cog", list_cogs(), ids=lambda cog: cog.id)
    def test_a_cog_extends_an_agent_and_names_frames_of_the_catalogue(
        self, cog: CogSpec
    ) -> None:
        assert get_agent_spec(cog.agent) is not None
        assert cog.frames
        for frame_id in [*cog.frames, *cog.lineage]:
            assert frame_id in FRAME_CATALOGUE
        assert cog.kind == "context"
        # A Cog is not in the agent catalogue: it extends an agent.
        assert get_agent_spec(cog.id) is None

    def test_a_cog_is_the_agent_it_extends_with_its_frames(self) -> None:
        agent = get_agent_spec("worker-crawler")
        cog = get_cog("cog-crawler")
        assert isinstance(cog.spec, Agentspec)
        assert (cog.spec.id, cog.spec.name) == ("cog-crawler", "Crawler Cog")
        for inherited in ("model", "harness", "sandbox_variant", "icon", "color"):
            assert getattr(cog.spec, inherited) == getattr(agent, inherited)
        # The Frame's skill is added to the agent's.
        assert _ids(cog.spec.skills) == [*_ids(agent.skills), "crawl:0.0.1"]
        assert _ids(cog.spec.mcp_servers) == _ids(agent.mcp_servers)
        assert cog.spec.tags == [*agent.tags, "cog"]
        # Its context, rendered onto the agent's prompt.
        assert cog.spec.system_prompt.startswith(agent.system_prompt.strip())
        assert "## Frames" in cog.spec.system_prompt
        assert "Web Research Frame — owned by" in cog.spec.system_prompt
        assert "Never present a search-result snippet" in cog.spec.system_prompt

    def test_a_cog_says_which_frames_oriented_it_and_which_guards_it_answers_to(
        self,
    ) -> None:
        cog = get_cog("cog-sales-pipeline-board-report")
        assert cog.frames == ["sales-pipeline", "board-reporting"]
        assert cog.lineage == ["datalayer", "sales-pipeline", "board-reporting"]
        guards = [guard.id for guard in cog.guards]
        assert guards.count("no-secrets") == 1
        assert {"totals-reconcile", "summary-first", "finance-review"} <= set(guards)
        # The company's rule reaches the prompt once, through two Frames.
        assert cog.spec.system_prompt.count("Never put a secret") == 1

    def test_the_cogs_under_a_frame_are_found_through_inheritance_too(self) -> None:
        assert {cog.id for cog in cogs_using("datalayer")} == set(COG_CATALOGUE)
        assert [cog.id for cog in cogs_using("board-reporting:0.0.1")] == [
            "cog-sales-pipeline-board-report"
        ]
        assert cogs_using("nope") == []

    def test_only_the_crawler_cog_is_offered(self) -> None:
        assert [cog.id for cog in list_cogs() if cog.enabled] == ["cog-crawler"]


@pytest.mark.skipif(
    not (CLONE / "cogs").is_dir(),
    reason="the agentspecs clone `make specs` checks out is not present",
)
class TestTheGenerators:
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

    def test_agentspecs_is_imported_from_the_clone_the_yaml_is_read_from(self) -> None:
        import agentspecs_clone

        frames = agentspecs_clone.import_from_clone(CLONE / "frames", "frames")
        assert CLONE.parent in Path(frames.__file__).resolve().parents

    def test_a_clone_without_frames_says_which_version_is_needed(
        self, tmp_path: Path
    ) -> None:
        import agentspecs_clone

        (tmp_path / "agentspecs" / "agents").mkdir(parents=True)
        with pytest.raises(SystemExit, match="agentspecs >= 0.0.12"):
            agentspecs_clone.import_from_clone(
                tmp_path / "agentspecs" / "frames", "frames"
            )

    def test_the_frames_generated_are_the_frames_committed(self) -> None:
        import generate_frames

        specs = generate_frames.load_frame_specs(CLONE / "frames")
        assert [spec["id"] for spec in specs] == sorted(FRAME_CATALOGUE)
        for spec in specs:
            committed = FRAME_CATALOGUE[spec["id"]]
            assert spec["rules"] == committed.rules
            assert spec["lineage"] == committed.lineage
        code = generate_frames.generate_typescript_code(specs)
        assert "export const WEB_RESEARCH_FRAME_0_0_1: FrameSpec = {" in code
        assert '"mcpServers": [' in code and "mcp_servers" not in code

    def test_the_cogs_generated_are_the_cogs_committed(self) -> None:
        import generate_cogs

        specs = generate_cogs.load_cog_specs(CLONE / "cogs")
        assert [spec["id"] for spec in specs] == sorted(COG_CATALOGUE)
        python = generate_cogs.generate_python_code(specs)
        assert "COG_CRAWLER_0_0_1 = CogSpec(" in python
        assert "spec=COG_CRAWLER_AGENTSPEC_0_0_1," in python
        # A Cog catalogue, not a second agent registry.
        assert "AGENTSPECS: Dict" not in python and "def get_agent_spec" not in python
        typescript = generate_cogs.generate_typescript_code(specs, CLONE / "cogs")
        assert "export const COG_CRAWLER_0_0_1: CogSpec = {" in typescript
        assert "export const COG_CRAWLER_AGENTSPEC_0_0_1" not in typescript
        assert "from './mcpServers'" in typescript and "'../../types'" not in typescript
        assert "getAgentspecRequiredEnvVars" not in typescript
