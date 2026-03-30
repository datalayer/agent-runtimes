# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Skill Catalog.

Predefined skill configurations that can be used by agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import os
from typing import Dict, List

from agent_runtimes.types import SkillSpec

# ============================================================================
# Skill Definitions
# ============================================================================

CRAWL_SKILL_SPEC_0_0_1 = SkillSpec(
    id="crawl",
    version="0.0.1",
    name="Web Crawl Skill",
    description="Web crawling and content extraction capabilities",
    module="agent_skills.skills.crawl",
    package=None,
    method=None,
    path=None,
    envvars=["TAVILY_API_KEY:0.0.1"],
    optional_env_vars=[],
    dependencies=["requests>=2.31.0", "beautifulsoup4>=4.12.0"],
    tags=["web", "crawl", "scraping"],
    icon="globe",
    emoji="🌐",
    enabled=True,
)

EVENTS_SKILL_SPEC_0_0_1 = SkillSpec(
    id="events",
    version="0.0.1",
    name="Events Skill",
    description="Event generation, enrichment, and lifecycle orchestration",
    module="agent_skills.skills.events",
    package=None,
    method=None,
    path=None,
    envvars=[],
    optional_env_vars=[],
    dependencies=["httpx>=0.27.0"],
    tags=["events", "orchestration", "automation"],
    icon="bell",
    emoji="📅",
    enabled=True,
)

GITHUB_SKILL_SPEC_0_0_1 = SkillSpec(
    id="github",
    version="0.0.1",
    name="GitHub Skill",
    description="GitHub repository management and code operations",
    module="agent_skills.skills.github",
    package=None,
    method=None,
    path=None,
    envvars=["GITHUB_TOKEN:0.0.1"],
    optional_env_vars=[],
    dependencies=["PyGithub>=2.1.0"],
    tags=["github", "git", "code"],
    icon="mark-github",
    emoji="🐙",
    enabled=True,
)

JOKES_SKILL_SPEC_0_0_1 = SkillSpec(
    id="jokes",
    version="0.0.1",
    name="Jokes Skill",
    description="Return random jokes from a local path-based skill.",
    module=None,
    package=None,
    method=None,
    path="jokes",
    envvars=[],
    optional_env_vars=[],
    dependencies=[],
    tags=["fun", "humor", "demo"],
    icon="smiley",
    emoji="😄",
    enabled=True,
)

PDF_SKILL_SPEC_0_0_1 = SkillSpec(
    id="pdf",
    version="0.0.1",
    name="PDF Processing Skill",
    description="PDF document reading, parsing, and extraction",
    module="agent_skills.skills.pdf",
    package=None,
    method=None,
    path=None,
    envvars=[],
    optional_env_vars=[],
    dependencies=["PyPDF2>=3.0.0", "pdfplumber>=0.10.0"],
    tags=["pdf", "documents", "extraction"],
    icon="file",
    emoji="📄",
    enabled=True,
)

TEXT_SUMMARIZER_SKILL_SPEC_0_0_1 = SkillSpec(
    id="text-summarizer",
    version="0.0.1",
    name="Text Summarizer Skill",
    description="Summarize text content using extractive and abstractive techniques. Use when the user asks for summaries, key points, or condensed versions of documents.",
    module=None,
    package="agent_skills.skills.text_summarizer",
    method="summarize_text",
    path=None,
    envvars=[],
    optional_env_vars=[],
    dependencies=["agent-skills>=0.0.1"],
    tags=["nlp", "summarization", "text-processing"],
    icon="note",
    emoji="📝",
    enabled=True,
)

# ============================================================================
# Skill Catalog
# ============================================================================

SKILL_CATALOG: Dict[str, SkillSpec] = {
    "crawl": CRAWL_SKILL_SPEC_0_0_1,
    "events": EVENTS_SKILL_SPEC_0_0_1,
    "github": GITHUB_SKILL_SPEC_0_0_1,
    "jokes": JOKES_SKILL_SPEC_0_0_1,
    "pdf": PDF_SKILL_SPEC_0_0_1,
    "text-summarizer": TEXT_SUMMARIZER_SKILL_SPEC_0_0_1,
}


def check_env_vars_available(env_vars: List[str]) -> bool:
    """
    Check if all required environment variables are set.

    Args:
        env_vars: List of environment variable names to check.

    Returns:
        True if all env vars are set (non-empty), False otherwise.
    """
    if not env_vars:
        return True
    return all(os.environ.get(var.rsplit(':', 1)[0]) for var in env_vars)


def get_skill_spec(skill_id: str) -> SkillSpec | None:
    """
    Get a skill specification by ID (accepts both bare and versioned refs).

    Args:
        skill_id: The unique identifier of the skill.

    Returns:
        The SkillSpec, or None if not found.
    """
    spec = SKILL_CATALOG.get(skill_id)
    if spec is not None:
        return spec
    base, _, ver = skill_id.rpartition(':')
    if base and '.' in ver:
        return SKILL_CATALOG.get(base)
    return None


def list_skill_specs() -> List[SkillSpec]:
    """
    List all skill specifications.

    Returns:
        List of all SkillSpec configurations.
    """
    return list(SKILL_CATALOG.values())
