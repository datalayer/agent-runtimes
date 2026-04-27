# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Skills-specific guardrail capability."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .common import GuardrailBlockedError


@dataclass
class SkillsGuardrailCapability(AbstractCapability[Any]):
    """Ensure disabled/untracked skills cannot be used and enforce approvals."""

    agent_id: str | None = None
    _approval_manager: Any = field(default=None, init=False, repr=False)

    def _enabled_skill_ids(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_agent_enabled_skill_ids

            return get_agent_enabled_skill_ids(self.agent_id)
        except Exception:
            return set()

    def _tracked_skill_ids(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_agent_tracked_skill_ids

            return get_agent_tracked_skill_ids(self.agent_id)
        except Exception:
            return set()

    def _approved_skill_ids(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_agent_approved_skill_ids

            return get_agent_approved_skill_ids(self.agent_id)
        except Exception:
            return set()

    def _skills_snapshot(self) -> list[dict[str, Any]]:
        try:
            from agent_runtimes.streams.loop import get_agent_skills_snapshot

            return get_agent_skills_snapshot(self.agent_id)
        except Exception:
            return []

    @staticmethod
    def _extract_skill_name(args: dict[str, Any]) -> str | None:
        for key in ("skill_name", "skill", "name", "skill_id", "id"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _strip_version(skill_ref: str) -> str:
        base, _, ver = skill_ref.rpartition(":")
        if base and "." in ver:
            return base.strip()
        return skill_ref.strip()

    @classmethod
    def _canonical_skill_ref(cls, skill_ref: str) -> str:
        raw = cls._strip_version(skill_ref).lower().strip()
        raw = raw.replace("_", "-")
        raw = re.sub(r"\s+", "-", raw)
        raw = re.sub(r"[^a-z0-9\-]", "-", raw)
        raw = re.sub(r"-+", "-", raw)
        return raw.strip("-")

    @classmethod
    def _canonical_skill_variants(cls, skill_ref: str) -> set[str]:
        """Return canonical aliases for a skill ref.

        This keeps matching generic across ids and human-friendly names such as
        "Text Summarizer Skill" vs "text-summarizer".
        """
        canonical = cls._canonical_skill_ref(skill_ref)
        if not canonical:
            return set()

        variants = {canonical}
        if canonical.endswith("-skill"):
            without_suffix = canonical[: -len("-skill")].strip("-")
            if without_suffix:
                variants.add(without_suffix)
        else:
            variants.add(f"{canonical}-skill")
        return variants

    def _resolve_skill_id(self, skill_ref: str) -> str | None:
        """Resolve a user/model-provided skill reference to a tracked skill ID.

        Supports IDs, version-qualified IDs, display names, and normalized
        variants without hardcoded skill mappings.
        """
        if not isinstance(skill_ref, str) or not skill_ref.strip():
            return None

        tracked = self._tracked_skill_ids()
        if not tracked:
            return None

        stripped = self._strip_version(skill_ref)
        canonical_variants = self._canonical_skill_variants(stripped)
        lowered = stripped.lower()

        # Fast path: exact tracked ID match.
        if stripped in tracked:
            return stripped

        tracked_by_lower = {skill_id.lower(): skill_id for skill_id in tracked}
        if lowered in tracked_by_lower:
            return tracked_by_lower[lowered]

        tracked_by_canonical = {
            self._canonical_skill_ref(skill_id): skill_id for skill_id in tracked
        }
        for variant in canonical_variants:
            matched = tracked_by_canonical.get(variant)
            if matched is not None:
                return matched

        # Generic name-based resolution from the live skills snapshot.
        for entry in self._skills_snapshot():
            skill_id = str(entry.get("id") or "").strip()
            if not skill_id or skill_id not in tracked:
                continue
            skill_name = str(entry.get("name") or "").strip()
            if not skill_name:
                continue
            if skill_name.lower() == lowered:
                return skill_id
            if self._canonical_skill_variants(skill_name) & canonical_variants:
                return skill_id

        return None

    def _is_skill_enabled_id(self, skill_id: str) -> bool:
        return skill_id in self._enabled_skill_ids()

    def _is_skill_approved_id(self, skill_id: str) -> bool:
        return skill_id in self._approved_skill_ids()

    def _assert_skill_enabled(
        self,
        *,
        skill_id: str,
        requested_skill_name: str | None = None,
    ) -> None:
        if not self._is_skill_enabled_id(skill_id):
            display = requested_skill_name or skill_id
            raise GuardrailBlockedError(
                f"Skill '{display}' is disabled by user selection"
            )

    def _get_approval_manager(self) -> Any:
        if self._approval_manager is None:
            from .tool_approvals import ToolApprovalConfig, ToolApprovalManager

            config = ToolApprovalConfig.from_env()
            config.agent_id = self.agent_id or config.agent_id
            self._approval_manager = ToolApprovalManager(config)
        return self._approval_manager

    async def _request_skill_approval(
        self,
        skill_id: str,
        *,
        source_tool: str,
        args: dict[str, Any],
        requested_skill_name: str | None = None,
    ) -> None:
        if self._is_skill_approved_id(skill_id):
            return

        manager = self._get_approval_manager()
        await manager.request_and_wait(
            tool_name=f"skill:{skill_id}",
            tool_args={
                "skill": requested_skill_name or skill_id,
                "skill_id": skill_id,
                "source_tool": source_tool,
                "args": {k: str(v)[:500] for k, v in args.items()},
            },
        )

    async def _enforce_execute_code_payload(self, args: dict[str, Any]) -> None:
        code = args.get("code")
        if not isinstance(code, str) or not code.strip():
            return

        imported_skills = set(re.findall(r"generated\.skills\.([A-Za-z0-9_\-]+)", code))
        inline_skill_refs = set(
            re.findall(r"run_skill_script\s*\(\s*['\"]([^'\"]+)['\"]", code)
        )

        referenced = imported_skills | inline_skill_refs
        if not referenced:
            return

        resolved: dict[str, str] = {}
        unknown: list[str] = []
        for ref in sorted(referenced):
            skill_id = self._resolve_skill_id(ref)
            if skill_id is None:
                unknown.append(ref)
            else:
                resolved[ref] = skill_id

        if unknown:
            raise GuardrailBlockedError(
                "Unknown skills cannot be used: " + ", ".join(unknown)
            )

        disabled = [
            ref
            for ref, skill_id in sorted(resolved.items())
            if not self._is_skill_enabled_id(skill_id)
        ]
        if disabled:
            raise GuardrailBlockedError(
                "Disabled skills cannot be used: " + ", ".join(disabled)
            )

        for skill_id in sorted(set(resolved.values())):
            await self._request_skill_approval(
                skill_id,
                source_tool="execute_code",
                args={"code": code[:1000]},
            )

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        tool_name = call.tool_name

        if tool_name in {"run_skill_script", "load_skill", "read_skill_resource"}:
            requested_skill_name = self._extract_skill_name(args)
            if requested_skill_name:
                skill_id = self._resolve_skill_id(requested_skill_name)
                if skill_id is None:
                    raise GuardrailBlockedError(
                        f"Skill '{requested_skill_name}' is not available for this agent"
                    )
                self._assert_skill_enabled(
                    skill_id=skill_id,
                    requested_skill_name=requested_skill_name,
                )
                await self._request_skill_approval(
                    skill_id,
                    source_tool=tool_name,
                    args=args,
                    requested_skill_name=requested_skill_name,
                )

        if tool_name == "execute_code":
            await self._enforce_execute_code_payload(args)

        return args
