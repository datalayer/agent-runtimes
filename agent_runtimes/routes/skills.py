# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
FastAPI routes for skills discovery and management.

Uses agent-skills library for proper skill discovery.
"""

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/skills", tags=["skills"])


class SkillInfo(BaseModel):
    """Information about a discovered skill."""

    id: str = Field(..., description="Unique skill identifier (same as name)")
    name: str = Field(..., description="Skill name")
    description: str = Field(..., description="Skill description")
    version: str = Field(default="1.0.0", description="Skill version")
    tags: list[str] = Field(default_factory=list, description="Skill tags")
    author: str | None = Field(default=None, description="Skill author")
    has_scripts: bool = Field(
        default=False, description="Whether skill has executable scripts"
    )
    has_resources: bool = Field(
        default=False, description="Whether skill has resources"
    )


class SkillsListResponse(BaseModel):
    """Response for listing skills."""

    skills: list[SkillInfo] = Field(default_factory=list)
    total: int = Field(default=0)
    skills_path: str | None = Field(
        default=None, description="Path where skills are loaded from"
    )


def _get_skills_path(request: Request) -> Path:
    """
    Get the skills path from app state or default.
    """
    repo_root = Path(__file__).resolve().parents[2]
    skills_path = getattr(
        request.app.state,
        "codemode_skills_path",
        str((repo_root / "skills").resolve()),
    )
    return Path(skills_path)


def _discover_skills_from_directory(skills_path: Path) -> list[SkillInfo]:
    """
    Discover skills using agent-skills library.

    Uses AgentSkill.from_skill_md() for proper skill parsing.

    Args:
        skills_path: Path to skills directory.

    Returns:
        List of discovered skill info.
    """
    skills: list[SkillInfo] = []

    if not skills_path.exists():
        logger.warning(f"Skills directory not found: {skills_path}")
        return skills

    try:
        from agent_skills import AgentSkill
    except ImportError:
        logger.warning("agent-skills package not installed, cannot discover skills")
        return skills

    # Discover skills by finding SKILL.md files
    for skill_md in skills_path.rglob("SKILL.md"):
        try:
            skill = AgentSkill.from_skill_md(skill_md)
            skills.append(
                SkillInfo(
                    id=skill.name,
                    name=skill.name,
                    description=skill.description,
                    version=skill.version,
                    tags=skill.tags,
                    author=skill.author,
                    has_scripts=len(skill.scripts) > 0,
                    has_resources=len(skill.resources) > 0,
                )
            )
            logger.debug(f"Discovered skill: {skill.name}")
        except Exception as e:
            logger.warning(f"Failed to load skill from {skill_md}: {e}")

    logger.info(f"Discovered {len(skills)} skills from {skills_path}")
    return skills


@router.get("", response_model=SkillsListResponse)
async def list_skills(request: Request) -> SkillsListResponse:
    """
    List all available skills.

    Discovers skills from the configured skills directory using
    the agent-skills library.

    Returns:
        List of available skills with their metadata.
    """
    try:
        skills_path = _get_skills_path(request)
        skills = _discover_skills_from_directory(skills_path)

        return SkillsListResponse(
            skills=skills,
            total=len(skills),
            skills_path=str(skills_path),
        )
    except Exception as e:
        logger.error(f"Error listing skills: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{skill_id}", response_model=SkillInfo)
async def get_skill(skill_id: str, request: Request) -> SkillInfo:
    """
    Get information about a specific skill.

    Args:
        skill_id: The skill identifier (name).

    Returns:
        Skill information if found.

    Raises:
        HTTPException: If skill is not found.
    """
    try:
        skills_path = _get_skills_path(request)
        skills = _discover_skills_from_directory(skills_path)

        for skill in skills:
            if skill.id == skill_id:
                return skill

        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting skill {skill_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{skill_id}/content")
async def get_skill_content(skill_id: str, request: Request) -> dict[str, Any]:
    """
    Get the full content of a skill including its SKILL.md content.

    Args:
        skill_id: The skill identifier (name).

    Returns:
        Full skill content and metadata.

    Raises:
        HTTPException: If skill is not found.
    """
    try:
        from agent_skills import AgentSkill
    except ImportError:
        raise HTTPException(
            status_code=500, detail="agent-skills package not installed"
        )

    try:
        skills_path = _get_skills_path(request)

        # Find the skill
        for skill_md in skills_path.rglob("SKILL.md"):
            try:
                skill = AgentSkill.from_skill_md(skill_md)
                if skill.name == skill_id:
                    return {
                        "id": skill.name,
                        "name": skill.name,
                        "description": skill.description,
                        "version": skill.version,
                        "tags": skill.tags,
                        "author": skill.author,
                        "content": skill.content,
                        "scripts": [
                            {
                                "name": s.name,
                                "description": s.description,
                                "path": str(s.path) if s.path else None,
                            }
                            for s in skill.scripts
                        ],
                        "resources": [
                            {
                                "name": r.name,
                                "description": r.description,
                                "path": str(r.path) if r.path else None,
                            }
                            for r in skill.resources
                        ],
                        "allowed_tools": skill.allowed_tools,
                        "denied_tools": skill.denied_tools,
                    }
            except Exception as e:
                logger.debug(f"Failed to load skill from {skill_md}: {e}")
                continue

        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting skill content {skill_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
