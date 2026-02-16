# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Skill Catalog.

Predefined skill configurations that can be used by agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import os
from dataclasses import dataclass
from typing import Dict, List


@dataclass
class SkillSpec:
    """Skill specification."""

    id: str
    name: str
    description: str
    module: str
    envvars: List[str]
    optional_env_vars: List[str]
    dependencies: List[str]
    tags: List[str]
    icon: str | None
    emoji: str | None
    enabled: bool


# ============================================================================
# Skill Definitions
# ============================================================================

CRAWL_SKILL_SPEC = SkillSpec(
    id="crawl",
    name="Web Crawl Skill",
    description="Web crawling and content extraction capabilities",
    module="agent_skills.crawl",
    envvars=["TAVILY_API_KEY"],
    optional_env_vars=[],
    dependencies=["requests>=2.31.0", "beautifulsoup4>=4.12.0"],
    tags=["web", "crawl", "scraping"],
    icon="globe",
    emoji="🌐",
    enabled=True,
)

GITHUB_SKILL_SPEC = SkillSpec(
    id="github",
    name="GitHub Skill",
    description="GitHub repository management and code operations",
    module="agent_skills.github",
    envvars=["GITHUB_TOKEN"],
    optional_env_vars=[],
    dependencies=["PyGithub>=2.1.0"],
    tags=["github", "git", "code"],
    icon="mark-github",
    emoji="🐙",
    enabled=True,
)

PDF_SKILL_SPEC = SkillSpec(
    id="pdf",
    name="PDF Processing Skill",
    description="PDF document reading, parsing, and extraction",
    module="agent_skills.pdf",
    envvars=[],
    optional_env_vars=[],
    dependencies=["PyPDF2>=3.0.0", "pdfplumber>=0.10.0"],
    tags=["pdf", "documents", "extraction"],
    icon="file",
    emoji="📄",
    enabled=True,
)

# ============================================================================
# Skill Catalog
# ============================================================================

SKILL_CATALOG: Dict[str, SkillSpec] = {
    "crawl": CRAWL_SKILL_SPEC,
    "github": GITHUB_SKILL_SPEC,
    "pdf": PDF_SKILL_SPEC,
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
    return all(os.environ.get(var) for var in env_vars)


def get_skill_spec(skill_id: str) -> SkillSpec | None:
    """
    Get a skill specification by ID.

    Args:
        skill_id: The unique identifier of the skill.

    Returns:
        The SkillSpec, or None if not found.
    """
    return SKILL_CATALOG.get(skill_id)


def list_skill_specs() -> List[SkillSpec]:
    """
    List all skill specifications.

    Returns:
        List of all SkillSpec configurations.
    """
    return list(SKILL_CATALOG.values())
