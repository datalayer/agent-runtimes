# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Skill Catalog.

Predefined skill configurations that can be used by agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

import os
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class SkillSpec(BaseModel):
    """Skill specification."""

    id: str = Field(..., description="Skill identifier")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Skill description")
    module: str = Field(default="", description="Python module path")
    envvars: List[str] = Field(default_factory=list, description="Required environment variables")
    optional_env_vars: List[str] = Field(default_factory=list, description="Optional environment variables")
    dependencies: List[str] = Field(default_factory=list, description="Python package dependencies")
    tags: List[str] = Field(default_factory=list, description="Search/discovery tags")
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")
    enabled: bool = Field(default=True, description="Whether skill is enabled")


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

EVENTS_SKILL_SPEC = SkillSpec(
    id="events",
    name="Events Skill",
    description="Event generation, enrichment, and lifecycle orchestration",
    module="agent_skills.events",
    envvars=[],
    optional_env_vars=[],
    dependencies=["httpx>=0.27.0"],
    tags=["events", "orchestration", "automation"],
    icon="bell",
    emoji="📅",
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
    "events": EVENTS_SKILL_SPEC,
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
