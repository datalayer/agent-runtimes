# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Server-side skills area.

Maintains the lifecycle state for each skill known to the agent runtime.
Skills go through three states:

- **available**: in catalog, not yet enabled.
- **enabled**: user toggled it on; SKILL.md loading still pending.
- **loaded**: the full SKILL.md definition has been loaded and the skill
  is included in the LLM system prompt.

Only *loaded* skills are injected into the system prompt.  The WS
``agent.snapshot`` pushes the full skills list with per-skill status so the
frontend never needs a REST endpoint.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

SkillStatus = Literal["available", "enabled", "loaded"]


class SkillEntry(BaseModel):
    """A single skill tracked by the skills area."""

    id: str
    name: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    has_scripts: bool = False
    has_resources: bool = False
    status: SkillStatus = "available"
    # Full SKILL.md content, populated after loading.
    skill_definition: str | None = None
    # Prompt section generated from the skill definition.
    prompt_section: str | None = None
    # Discovery/source metadata for UI and debugging.
    source_variant: str | None = None
    module: str | None = None
    package: str | None = None
    method: str | None = None
    path: str | None = None


class SkillsArea:
    """
    Manages the runtime-global skills lifecycle used by monitoring and prompt
    composition.

    Notes
    -----
    This object is process-global in the current implementation (singleton).
    It does not provide explicit cross-thread synchronization.
    """

    def __init__(self) -> None:
        self._skills: dict[str, SkillEntry] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def strip_version(skill_ref: str) -> str:
        """Strip an optional version suffix like ``crawl:0.0.1`` → ``crawl``.

        The agent spec and frontend may use version-qualified references
        (``<name>:<semver>``) while the filesystem skills use plain names.
        """
        base, _, ver = skill_ref.rpartition(":")
        if base and "." in ver:
            return base
        return skill_ref

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def list_skills(self) -> list[SkillEntry]:
        """Return all tracked skills."""
        return list(self._skills.values())

    def get_skill(self, skill_id: str) -> SkillEntry | None:
        return self._skills.get(self.strip_version(skill_id))

    def get_skills_for_prompt(self) -> list[SkillEntry]:
        """Return only loaded skills (SKILL.md loaded, in system prompt).

        Lazily triggers loading of any enabled-but-not-yet-loaded skills
        so the first inference call promotes them to ``loaded``.
        """
        # Auto-load enabled skills that haven't been loaded yet.
        has_enabled = any(s.status == "enabled" for s in self._skills.values())
        if has_enabled:
            self.load_all_enabled()
        return [s for s in self._skills.values() if s.status == "loaded"]

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    def seed_available(self, skills_info: list[dict[str, Any]]) -> None:
        """Seed skills from discovery (folder scan / catalog).

        Only adds skills that are not already tracked, preserving existing
        status for skills that were already enabled/loaded.
        """
        for info in skills_info:
            sid = info.get("id") or info.get("name", "")
            if not sid:
                continue
            source_variant = info.get("source_variant")
            module = info.get("module")
            package = info.get("package")
            method = info.get("method")
            path = info.get("path")
            if source_variant is None or (
                module is None and package is None and path is None
            ):
                source = self._resolve_catalog_source(sid)
                if source_variant is None:
                    source_variant = source.get("source_variant")
                module = module or source.get("module")
                package = package or source.get("package")
                method = method or source.get("method")
                path = path or source.get("path")
            if sid not in self._skills:
                self._skills[sid] = SkillEntry(
                    id=sid,
                    name=info.get("name", sid),
                    description=info.get("description", ""),
                    tags=info.get("tags", []),
                    has_scripts=info.get("has_scripts", False),
                    has_resources=info.get("has_resources", False),
                    status="available",
                    source_variant=source_variant,
                    module=module,
                    package=package,
                    method=method,
                    path=path,
                )
            else:
                entry = self._skills[sid]
                entry.source_variant = entry.source_variant or source_variant
                entry.module = entry.module or module
                entry.package = entry.package or package
                entry.method = entry.method or method
                entry.path = entry.path or path

    def enable_skill(self, skill_id: str) -> SkillEntry | None:
        """Enable a skill.  If not yet tracked, creates an entry.

        Returns the updated entry, or None if the skill was already
        loaded (no state change needed).
        """
        skill_id = self.strip_version(skill_id)
        entry = self._skills.get(skill_id)
        if entry is None:
            # Not yet in the area — create as enabled so loading kicks in.
            entry = SkillEntry(
                id=skill_id,
                name=skill_id,
                status="enabled",
            )
            self._skills[skill_id] = entry
            return entry
        if entry.status == "loaded":
            return None  # already at the terminal state
        entry.status = "enabled"
        return entry

    def disable_skill(self, skill_id: str) -> SkillEntry | None:
        """Disable a skill (move back to available)."""
        skill_id = self.strip_version(skill_id)
        entry = self._skills.get(skill_id)
        if entry is None:
            return None
        entry.status = "available"
        entry.skill_definition = None
        entry.prompt_section = None
        return entry

    def mark_loaded(
        self,
        skill_id: str,
        skill_definition: str,
        prompt_section: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
        has_scripts: bool | None = None,
        has_resources: bool | None = None,
        source_variant: str | None = None,
        module: str | None = None,
        package: str | None = None,
        method: str | None = None,
        path: str | None = None,
    ) -> SkillEntry:
        """Mark a skill as loaded (SKILL.md loaded, in system prompt)."""
        skill_id = self.strip_version(skill_id)
        entry = self._skills.get(skill_id)
        if entry is None:
            entry = SkillEntry(id=skill_id, name=name or skill_id)
            self._skills[skill_id] = entry
        entry.status = "loaded"
        entry.skill_definition = skill_definition
        entry.prompt_section = prompt_section
        if name is not None:
            entry.name = name
        if description is not None:
            entry.description = description
        if tags is not None:
            entry.tags = tags
        if has_scripts is not None:
            entry.has_scripts = has_scripts
        if has_resources is not None:
            entry.has_resources = has_resources
        if source_variant is not None:
            entry.source_variant = source_variant
        if module is not None:
            entry.module = module
        if package is not None:
            entry.package = package
        if method is not None:
            entry.method = method
        if path is not None:
            entry.path = path
        return entry

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def build_prompt_section(self) -> str:
        """Build the combined system prompt section for all active skills."""
        sections = []
        for skill in self.get_skills_for_prompt():
            if skill.prompt_section:
                sections.append(skill.prompt_section)
        if not sections:
            return ""
        return "\n\n".join(sections)

    # ------------------------------------------------------------------
    # Serialisation (for WS snapshot)
    # ------------------------------------------------------------------

    def to_snapshot_list(self) -> list[dict[str, Any]]:
        """Serialize all skills for the WS snapshot payload."""
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "tags": s.tags,
                "has_scripts": s.has_scripts,
                "has_resources": s.has_resources,
                "status": s.status,
                "skill_definition": s.skill_definition,
                "source_variant": s.source_variant,
                "module": s.module,
                "package": s.package,
                "method": s.method,
                "path": s.path,
            }
            for s in self._skills.values()
        ]

    # ------------------------------------------------------------------
    # Loading (SKILL.md)
    # ------------------------------------------------------------------

    def load_skill(self, skill_id: str, skills_path: str | None = None) -> bool:
        """
        Load a skill via agent-skills and mark it as loaded.

        Returns True if the skill was successfully loaded, False otherwise.
        """
        skill_id = self.strip_version(skill_id)
        resolved_path = self._resolve_skills_path(skills_path)
        if resolved_path is None:
            logger.warning(f"Cannot load skill '{skill_id}': no skills path")
            return False

        try:
            from agent_skills import AgentSkill
        except ImportError:
            logger.warning(
                f"Cannot load skill '{skill_id}': agent-skills package not installed"
            )
            return False

        # Search in the skills directory for a matching SKILL.md
        skills_dir = Path(resolved_path)
        if not skills_dir.exists():
            logger.warning(f"Skills directory not found: {skills_dir}")
            return False

        for skill_md in skills_dir.rglob("SKILL.md"):
            try:
                skill = AgentSkill.from_skill_md(skill_md)
                if skill.name == skill_id:
                    # Build prompt section for this skill
                    prompt = self._build_single_skill_prompt(skill)
                    self.mark_loaded(
                        skill_id=skill.name,
                        skill_definition=skill.content
                        if hasattr(skill, "content")
                        else "",
                        prompt_section=prompt,
                        name=skill.name,
                        description=skill.description,
                        tags=skill.tags if hasattr(skill, "tags") else [],
                        has_scripts=len(skill.scripts) > 0,
                        has_resources=len(skill.resources) > 0,
                    )
                    logger.info(f"Loaded skill '{skill_id}' from {skill_md}")
                    return True
            except Exception as e:
                logger.debug(f"Failed to check skill at {skill_md}: {e}")
                continue

        # Also try catalog/module-based skills
        return self._load_from_catalog(skill_id)

    def load_all_enabled(self, skills_path: str | None = None) -> int:
        """Load all enabled-but-not-yet-loaded skills.

        Returns the number of skills that were successfully loaded.
        """
        count = 0
        for entry in list(self._skills.values()):
            if entry.status == "enabled":
                if self.load_skill(entry.id, skills_path):
                    count += 1
        return count

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_skills_path(explicit_path: str | None = None) -> str | None:
        """Resolve the skills directory path."""
        if explicit_path:
            return explicit_path
        env_path = os.getenv("AGENT_RUNTIMES_SKILLS_FOLDER")
        if env_path:
            return str(Path(env_path).resolve())
        repo_root = Path(__file__).resolve().parents[2]
        default = repo_root / "skills"
        if default.exists():
            return str(default)
        return None

    @staticmethod
    def _build_single_skill_prompt(skill: Any) -> str:
        """Build a prompt section for a single AgentSkill object."""
        lines = [f"### {skill.name}"]
        if skill.description:
            lines.append(f"**Description:** {skill.description}")
        if hasattr(skill, "scripts") and skill.scripts:
            lines.append("**Available Scripts:**")
            for s in skill.scripts:
                desc = f" — {s.description}" if s.description else ""
                lines.append(f"- `{s.name}`{desc}")
                if hasattr(s, "parameters") and s.parameters:
                    for p in s.parameters:
                        req = " (required)" if getattr(p, "required", False) else ""
                        lines.append(
                            f"  - `--{p.name}` ({getattr(p, 'type', 'str')}{req})"
                        )
                if hasattr(s, "returns") and s.returns:
                    lines.append(f"  Returns: {s.returns}")
                if hasattr(s, "env_vars") and s.env_vars:
                    lines.append(f"  Env vars: {', '.join(s.env_vars)}")
        if hasattr(skill, "resources") and skill.resources:
            lines.append("**Resources:**")
            for r in skill.resources:
                desc = f" — {r.description}" if r.description else ""
                lines.append(f"- `{r.name}`{desc}")
        return "\n".join(lines)

    def _load_from_catalog(self, skill_id: str) -> bool:
        """Try to load a skill from the Python catalog (module/package specs)."""
        try:
            from agent_runtimes.specs.skills import get_skill_spec

            spec = get_skill_spec(skill_id)
            if spec is not None:
                return self._load_catalog_skill(spec)
        except ImportError:
            pass
        return False

    def _load_catalog_skill(self, spec: Any) -> bool:
        """Load a skill from its catalog spec."""
        try:
            from agent_skills import AgentSkill

            skill = None
            if hasattr(spec, "module") and spec.module:
                skill = AgentSkill.from_module(spec.module)
            elif hasattr(spec, "package") and spec.package:
                method = getattr(spec, "method", None)
                skill = AgentSkill.from_package(
                    spec.package,
                    method or "",
                    name=spec.name,
                    description=spec.description,
                    version=getattr(spec, "version", "1.0.0"),
                    tags=getattr(spec, "tags", []),
                )

            if skill:
                prompt = self._build_single_skill_prompt(skill)
                self.mark_loaded(
                    skill_id=spec.id,
                    skill_definition=skill.content if hasattr(skill, "content") else "",
                    prompt_section=prompt,
                    name=skill.name,
                    description=skill.description,
                    tags=skill.tags if hasattr(skill, "tags") else [],
                    has_scripts=len(skill.scripts) > 0,
                    has_resources=len(skill.resources) > 0,
                    source_variant=self._infer_spec_source_variant(spec),
                    module=getattr(spec, "module", None),
                    package=getattr(spec, "package", None),
                    method=getattr(spec, "method", None),
                    path=getattr(spec, "path", None),
                )
                logger.info(f"Loaded catalog skill '{spec.id}'")
                return True
        except Exception as e:
            logger.warning(f"Failed to load catalog skill '{spec.id}': {e}")
        return False

    @staticmethod
    def _infer_spec_source_variant(spec: Any) -> str:
        """Infer source variant from a skill spec fields."""
        if getattr(spec, "package", None):
            return "package"
        if getattr(spec, "module", None):
            return "module"
        if getattr(spec, "path", None):
            return "path"
        return "unknown"

    def _resolve_catalog_source(self, skill_id: str) -> dict[str, Any]:
        """Resolve source metadata from skill catalog when available."""
        try:
            from agent_runtimes.specs.skills import get_skill_spec

            spec = get_skill_spec(skill_id)
            if spec is None:
                return {}
            return {
                "source_variant": self._infer_spec_source_variant(spec),
                "module": getattr(spec, "module", None),
                "package": getattr(spec, "package", None),
                "method": getattr(spec, "method", None),
                "path": getattr(spec, "path", None),
            }
        except Exception:
            return {}


# ---------------------------------------------------------------------------
# NOTE
# ---------------------------------------------------------------------------
#
# Agent-scoped skill state is now managed in ``agent_runtimes.streams.loop``.
# This module retains the ``SkillsArea`` class as a reusable utility, but the
# global singleton store has been removed to avoid multiple state backends.
