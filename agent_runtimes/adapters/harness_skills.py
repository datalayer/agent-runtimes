# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Skills and instructions lent to a harness in its own format (SH-21).

Datalayer's skills are Python compositions of MCP tools (``agent-skills``,
run through the skills toolset); a harness reads skills as folders with a
``SKILL.md`` (the agentskills.io specification Claude Code, Codex, Gemini CLI
and the others follow). Before the harness starts, the runtime **writes the
application's enabled skills into the workspace** in the format and the
directory its harness spec names (``skills: {format: skill-md, dir:
.claude/skills}``), each ``SKILL.md`` generated from the skill's catalogue
spec — its name, its description, when to use it, its instructions (the
package's own ``SKILL.md`` body when it ships one) — and says how its code
runs on Datalayer. The application's instructions reach the harness the same
way, as its instructions file (``CLAUDE.md``, ``AGENTS.md``, ``GEMINI.md``,
``.goosehints`` — ``instructions_file`` of the harness spec), generated from
the Appspec.

What is written is **read-only to the agent**: a write or an edit of these
paths is refused by the Shield in a sentence (:meth:`ACPAgent.decide`), and a
skill the harness writes elsewhere is a file write — shown, decided,
recorded, never promoted to the catalogue. A skill the Appspec names that the
catalogue does not have, or has disabled, is refused at load; so is a skill
on a harness that reads none. A skill's declared secrets are never written
here: they reach the harness through the declared-secrets path.
"""

from __future__ import annotations

import importlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from agent_runtimes.types import HarnessSpec, SkillSpec

__all__ = [
    "LentFiles",
    "SKILL_FORMATS",
    "instructions_markdown",
    "skill_markdown",
    "skill_specs_of",
    "write_lent_files",
]

#: What a harness spec's ``skills.format`` may say.
SKILL_FORMATS = ("skill-md", "none")

#: Owner-readable only; the agent runs as the same user, so the Shield's
#: refusal is the gate, and the mode says what the file is.
READ_ONLY = 0o444


@dataclass(frozen=True)
class LentFiles:
    """What was written into the workspace for the harness, and what is read-only to it."""

    #: The ``SKILL.md`` files written, one per skill.
    skills: list[Path] = field(default_factory=list)
    #: The instructions file, when the harness spec names one.
    instructions: Path | None = None
    #: Paths the agent may not write: the skill folders and the instructions file.
    protected: list[Path] = field(default_factory=list)

    def protects(self, path: Path) -> bool:
        """Whether ``path`` (resolved) is one of the lent files, or inside a lent folder."""
        for kept in self.protected:
            if path == kept or kept in path.parents:
                return True
        return False


def _refused(sentence: str) -> Exception:
    from .acp_agent import HarnessRefused

    return HarnessRefused(sentence)


def skill_specs_of(app: Any, harness: HarnessSpec) -> list[SkillSpec]:
    """
    The catalogue's specs of the skills ``app`` names, each enabled; refused otherwise.

    Parameters
    ----------
    app : AppSpec
        The application; its ``skills`` are ids, or ``id:version``.
    harness : HarnessSpec
        The harness; one that reads no skills refuses any.

    Returns
    -------
    list[SkillSpec]
        In the application's order, each once.
    """
    from agent_runtimes.specs.skills import get_skill_spec, list_skill_specs

    wanted: list[str] = []
    for reference in getattr(app, "skills", None) or []:
        skill_id = str(reference).partition(":")[0].strip()
        if skill_id and skill_id not in wanted:
            wanted.append(skill_id)
    if not wanted:
        return []
    if harness.skills.format not in SKILL_FORMATS:
        raise _refused(
            f"The harness {harness.id!r} says skills.format: {harness.skills.format!r}, "
            f"which is not one of {', '.join(SKILL_FORMATS)}."
        )
    if harness.skills.format == "none":
        raise _refused(
            f"{harness.name} reads no skills, and the application names "
            f"{', '.join(wanted)}: drop `skills:`."
        )
    if not harness.skills.dir:
        raise _refused(
            f"The harness {harness.id!r} names no skills directory (skills.dir), so "
            "nothing can be written for it."
        )
    specs: list[SkillSpec] = []
    for skill_id in wanted:
        spec = get_skill_spec(skill_id)
        if spec is None:
            known = ", ".join(sorted(item.id for item in list_skill_specs()))
            raise _refused(
                f"There is no skill named {skill_id!r} in the catalogue: one of {known}."
            )
        if not spec.enabled:
            raise _refused(
                f"The skill {skill_id!r} is not enabled in the catalogue, so it is not "
                "lent to the harness."
            )
        specs.append(spec)
    return specs


def _shipped_markdown(spec: SkillSpec) -> str | None:
    """The ``SKILL.md`` the skill's package or path ships, its frontmatter dropped."""
    folder: Path | None = None
    if spec.path:
        given = Path(spec.path).expanduser()
        folder = given.parent if given.name == "SKILL.md" else given
    elif spec.module:
        try:
            module = importlib.import_module(spec.module)
        except Exception:  # noqa: BLE001 - a skill that does not import ships no page
            return None
        origin = getattr(module, "__file__", None)
        folder = Path(origin).parent if origin else None
    if folder is None:
        return None
    page = folder / "SKILL.md"
    if not page.is_file():
        return None
    text = page.read_text(encoding="utf-8")
    if text.startswith("---"):
        _, _, rest = text[3:].partition("\n---")
        text = rest.lstrip("\n")
    return text.strip() or None


def _frontmatter(fields: Sequence[tuple[str, Any]]) -> str:
    lines = ["---"]
    for name, value in fields:
        if isinstance(value, list):
            lines.append(f"{name}:")
            lines.extend(f"  - {item}" for item in value)
        else:
            lines.append(f"{name}: {value}")
    lines.append("---")
    return "\n".join(lines)


def skill_markdown(spec: SkillSpec, harness: HarnessSpec) -> str:
    """
    One ``SKILL.md``, generated from the skill's spec, in the agentskills.io shape.

    Parameters
    ----------
    spec : SkillSpec
        The catalogue's spec.
    harness : HarnessSpec
        The harness it is written for.

    Returns
    -------
    str
        The frontmatter (``name``, ``description``, ``version``, ``tags``,
        Datalayer's ``metadata``) and the body: what it is for, when to use it,
        its instructions, and how its code runs — never a secret.
    """
    shipped = _shipped_markdown(spec)
    frontmatter = _frontmatter(
        [
            ("name", spec.id),
            ("description", spec.description or spec.name),
            ("version", spec.version),
            *([("tags", list(spec.tags))] if spec.tags else []),
            ("metadata", ""),
            ("  datalayer-skill", spec.id),
            ("  lent-to", harness.id),
            *([("  module", spec.module)] if spec.module else []),
        ]
    ).replace("metadata: \n", "metadata:\n")
    when = (
        f"Use it when the task calls for {spec.description.rstrip('.').lower()}."
        if spec.description
        else f"Use it when the task calls for {spec.name}."
    )
    if spec.tags:
        when += f" Its tags: {', '.join(spec.tags)}."
    needs = ", ".join(name.partition(":")[0] for name in spec.envvars)
    body = [
        frontmatter,
        "",
        f"# {spec.name}",
        "",
        spec.description or spec.name,
        "",
        "## When to use it",
        "",
        when,
        "",
        "## How its code runs",
        "",
        "This skill is one of Datalayer's: its scripts are Python compositions of "
        "MCP tools that run on Datalayer through the skills tools "
        "(`run_skill_script`) when the application is lent them, never from this "
        "directory, and never with a key of your own"
        + (
            f". It needs {needs}, which Datalayer holds and gives its scripts: "
            "do not look for it, and do not write it anywhere."
            if needs
            else "."
        ),
        "",
        "## Instructions",
        "",
        shipped or f"Follow the skill's description: {spec.description or spec.name}",
        "",
        "This file was written by Datalayer from the skill's catalogue spec and is "
        "read-only: a skill of your own goes in a folder of its own.",
        "",
    ]
    return "\n".join(body)


def _rules_in_words(app: Any) -> list[str]:
    words = {
        "do_it": "do it",
        "if_asked": "do it if the person asked",
        "ask_first": "ask the person first",
        "leave_to_me": "leave it to the person",
    }
    lines: list[str] = []
    for rule in getattr(app, "rules", None) or []:
        behaviour = words.get(str(rule.behaviour), str(rule.behaviour))
        applies = ", ".join(rule.applies_to) if rule.applies_to else "anything"
        lines.append(f"- {rule.action} ({applies}): {behaviour}.")
    return lines


def instructions_markdown(
    app: Any, harness: HarnessSpec, lent: Sequence[str] = ()
) -> str:
    """
    The harness's instructions file, generated from the Appspec.

    Parameters
    ----------
    app : AppSpec
        The application: its name, what it does, its instructions, its Rules,
        its skills.
    harness : HarnessSpec
        The harness it is written for.
    lent : Sequence[str]
        The gateway toolsets it is lent, by name (SH-14).

    Returns
    -------
    str
        Markdown: the application's instructions verbatim under its name, then
        what Datalayer decides around the agent, in words.
    """
    name = str(getattr(app, "name", "") or getattr(app, "id", "") or "This application")
    description = str(getattr(app, "description", "") or "")
    instructions = str(getattr(app, "instructions", "") or "").strip()
    skills = [
        str(item).partition(":")[0] for item in getattr(app, "skills", None) or []
    ]
    lines = [
        f"# {name}",
        "",
        *([description, ""] if description else []),
        "## Instructions",
        "",
        instructions or "No instructions beyond this page.",
        "",
        "## Datalayer, beside you",
        "",
        "You run on Datalayer as this application's agent. Every file you read or "
        "write, every command you run and every tool you call is decided by the "
        "application's Rules before it happens, and kept in its record. Inside this "
        "workspace, reading and editing are done; deleting, running a command, "
        "reaching outside it, pushing or installing are asked of the person first "
        "unless a Rule says otherwise.",
        "",
    ]
    rules = _rules_in_words(app)
    if rules:
        lines += ["### The application's Rules", "", *rules, ""]
    if lent:
        lines += [
            "### Tools",
            "",
            "The MCP servers of your session are Datalayer's gateway toolsets the "
            f"application connects — {', '.join(lent)} — reached with a credential "
            "Datalayer holds. There are no others; do not look for keys.",
            "",
        ]
    if skills and harness.skills.format == "skill-md" and harness.skills.dir:
        lines += [
            "### Skills",
            "",
            f"The application's skills are in `{harness.skills.dir}/` — "
            f"{', '.join(skills)} — each a `SKILL.md` written by Datalayer, "
            "read-only. A skill of your own goes in a folder of its own.",
            "",
        ]
    lines += [
        f"This file (`{harness.instructions_file}`) was written by Datalayer from the "
        "application and is read-only.",
        "",
    ]
    return "\n".join(lines)


def _write_read_only(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        os.chmod(path, 0o644)
    path.write_text(content, encoding="utf-8")
    os.chmod(path, READ_ONLY)


def write_lent_files(
    workspace: Path, harness: HarnessSpec, app: Any, lent: Sequence[str] = ()
) -> LentFiles:
    """
    Write the application's skills and instructions into the workspace for the harness.

    Parameters
    ----------
    workspace : Path
        The harness's workspace.
    harness : HarnessSpec
        The harness: where its skills go, what its instructions file is named.
    app : AppSpec
        The application; ``None`` writes nothing (``loop --harness`` outside one).
    lent : Sequence[str]
        The gateway toolsets it is lent, named in the instructions.

    Returns
    -------
    LentFiles
        What was written, and what is read-only to the agent.
    """
    if app is None:
        return LentFiles()
    root = workspace.resolve()
    written: list[Path] = []
    protected: list[Path] = []
    for spec in skill_specs_of(app, harness):
        folder = (root / harness.skills.dir / spec.id).resolve()
        if root not in folder.parents:
            raise _refused(
                f"The harness {harness.id!r} names a skills directory outside the "
                f"workspace ({harness.skills.dir}): nothing is written there."
            )
        page = folder / "SKILL.md"
        _write_read_only(page, skill_markdown(spec, harness))
        written.append(page)
        protected.append(folder)
    instructions: Path | None = None
    if harness.instructions_file:
        instructions = (root / harness.instructions_file).resolve()
        if root not in instructions.parents:
            raise _refused(
                f"The harness {harness.id!r} names an instructions file outside the "
                f"workspace ({harness.instructions_file}): nothing is written there."
            )
        _write_read_only(instructions, instructions_markdown(app, harness, lent))
        protected.append(instructions)
    return LentFiles(skills=written, instructions=instructions, protected=protected)
