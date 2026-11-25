# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every skill a generated agent or cog spec names is in the skills catalogue.

The chat's Skills menu draws a skill's icon, its display name and its
description from the catalogue. A skill an agent named with no entry of its
own was listed as its bare id, with nothing under it (``datalayer-memory-add``
and its three siblings, on the visitors' page, 25 November 2026): the
equipment route answered the id as the name. No skill ships without them.
"""

import re

from agent_runtimes.apps.equipment import _skill_row
from agent_runtimes.specs.agents import AGENTSPECS
from agent_runtimes.specs.cogs import COG_CATALOGUE
from agent_runtimes.specs.skills import SKILLS_CATALOG, get_skill_spec

#: An icon reference, as agentspecs.marks says it: ``<package>:<kebab-case name>``.
ICON = re.compile(
    r"^(@datalayer/icons-react|@primer/octicons-react):[a-z0-9]+(-[a-z0-9]+)*$"
)


def _ref(skill: object) -> str:
    return skill if isinstance(skill, str) else str(getattr(skill, "id", "") or "")


def _named() -> dict[str, list[str]]:
    """Each skill reference a generated spec names, with the specs that name it."""
    named: dict[str, list[str]] = {}
    for kind, catalogue in (("agent", AGENTSPECS), ("cog", COG_CATALOGUE)):
        for spec_id, spec in catalogue.items():
            # A cog's skills are its agent spec's (``CogSpec.spec``), not the cog's own.
            agent = spec.spec if kind == "cog" else spec
            for skill in _skills_of(agent):
                ref = _ref(skill)
                if ref:
                    named.setdefault(ref, []).append(f"{kind} {spec_id}")
    return named


def _skills_of(agent: object) -> list[object]:
    """Every skill reference of an agent spec: its ``skills`` and its ``optional.skills``."""
    optional = getattr(agent, "optional", None)
    if isinstance(optional, dict):
        optional_skills = optional.get("skills")
    else:
        optional_skills = getattr(optional, "skills", None)
    return [*(getattr(agent, "skills", None) or []), *(optional_skills or [])]


def test_an_optional_skill_reference_is_read_too() -> None:
    """A wrong version under ``optional.skills`` is a wrong version."""
    from types import SimpleNamespace

    agent = SimpleNamespace(
        skills=["crawl:0.0.1"], optional=SimpleNamespace(skills=["image-stock:9.9.9"])
    )
    assert _skills_of(agent) == ["crawl:0.0.1", "image-stock:9.9.9"]
    as_dict = SimpleNamespace(skills=None, optional={"skills": ["pdf:0.0.1"]})
    assert _skills_of(as_dict) == ["pdf:0.0.1"]
    assert _skills_of(SimpleNamespace(skills=["crawl"], optional=None)) == ["crawl"]
    declared = [
        ref
        for spec in AGENTSPECS.values()
        for ref in _skills_of(spec)
        if ref not in (spec.skills or [])
    ]
    for ref in declared:
        assert _ref(ref) in _named()


def test_the_cogs_skills_are_read() -> None:
    named = _named()
    by_cogs = {
        ref for ref, where in named.items() if any(w.startswith("cog ") for w in where)
    }
    assert "datalayer-memory-add:0.0.1" in by_cogs, sorted(by_cogs)
    for cog_id, cog in COG_CATALOGUE.items():
        for skill in cog.spec.skills or []:
            assert f"cog {cog_id}" in named[_ref(skill)]


def test_the_agents_and_the_cogs_name_skills() -> None:
    named = _named()
    assert len(named) > 10
    assert "datalayer-memory-add:0.0.1" in named
    assert "datalayer-whoami:1.0.0" in named


def test_every_named_skill_has_a_name_a_description_and_its_marks() -> None:
    problems: list[str] = []
    for ref, where in sorted(_named().items()):
        skill_id, _, version = ref.partition(":")
        spec = get_skill_spec(ref)
        if spec is None:
            problems.append(f"{ref} ({where[0]}): no catalogue entry")
            continue
        if version and spec.version != version:
            problems.append(f"{ref} ({where[0]}): the catalogue has {spec.version}")
        if not (spec.name or "").strip() or spec.name == skill_id:
            problems.append(f"{ref}: no display name")
        if not (spec.description or "").strip():
            problems.append(f"{ref}: no description")
        if not spec.emoji:
            problems.append(f"{ref}: no emoji")
        if not spec.icon:
            problems.append(f"{ref}: no icon")
        elif not ICON.match(spec.icon):
            problems.append(f"{ref}: the icon {spec.icon} names no package")
    assert problems == []


def test_the_equipment_route_names_the_memory_skills() -> None:
    names = {
        skill_id: _skill_row(skill_id)
        for skill_id in (
            "datalayer-memory-add",
            "datalayer-memory-search",
            "datalayer-memory-list",
            "datalayer-memory-delete",
            "datalayer-whoami",
        )
    }
    assert {skill_id: row["name"] for skill_id, row in names.items()} == {
        "datalayer-memory-add": "Remember Skill",
        "datalayer-memory-search": "Recall Skill",
        "datalayer-memory-list": "List Memories Skill",
        "datalayer-memory-delete": "Forget Skill",
        "datalayer-whoami": "Who Am I Skill",
    }
    assert all(row["description"] for row in names.values())


def test_every_catalogue_entry_loads_one_way() -> None:
    for skill_id, spec in SKILLS_CATALOG.items():
        assert spec.id == skill_id
        assert spec.module or spec.package or spec.path, skill_id
