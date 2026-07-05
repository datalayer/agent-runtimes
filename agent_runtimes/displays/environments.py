# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Display functions for Datalayer core."""

from __future__ import annotations

import json
import re
from typing import Any

from rich.console import Console


def _description_to_text(description: str) -> str:
    """Convert HTML/Markdown-like descriptions into readable plain text."""
    text = (description or "").strip()
    if not text:
        return "(no description)"

    normalized = text
    normalized = re.sub(r"<\s*/\s*p\s*>", "\n\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*p\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*b\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\s*/\s*b\s*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", "", normalized)
    # Strip lightweight markdown markers that look noisy in CLI tables.
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    normalized = re.sub(r"__(.*?)__", r"\1", normalized)
    normalized = re.sub(r"`([^`]*)`", r"\1", normalized)
    normalized = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", normalized)
    normalized = re.sub(r"^\s*#{1,6}\s*", "", normalized, flags=re.MULTILINE)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = normalized.strip() or "(no description)"
    return normalized


def _truncate(value: str, width: int) -> str:
    if width <= 0:
        return ""
    if len(value) <= width:
        return value
    if width == 1:
        return "…"
    return value[: width - 1] + "…"

def _wrap_lines(text: str, width: int) -> list[str]:
    """Wrap plain text into lines bounded by width, preserving explicit breaks."""
    if width <= 1:
        return [text[:width]] if text else [""]

    wrapped: list[str] = []
    for raw_line in text.splitlines() or [""]:
        line = raw_line.strip()
        if not line:
            wrapped.append("")
            continue

        remaining = line
        while len(remaining) > width:
            cut = remaining.rfind(" ", 0, width + 1)
            if cut <= 0:
                cut = width
            wrapped.append(remaining[:cut].rstrip())
            remaining = remaining[cut:].lstrip()
        wrapped.append(remaining)

    lines = wrapped
    if not lines:
        return [""]
    return lines


def _pad_cell(value: str, width: int, align_right: bool = False) -> str:
    text = _truncate(value, width)
    return text.rjust(width) if align_right else text.ljust(width)


def display_environments(environments: list[dict[str, Any]]) -> None:
    """Display environments with a full-width detail line per environment."""
    console = Console()

    headers = ("ID", "Credits/Second", "Name", "Language", "Resources")
    rows: list[tuple[str, str, str, str, str, str]] = []
    for env in environments:
        env_id = str(env.get("name") or "")
        cost = "{:.4g}".format(float(env.get("burning_rate") or 0.0))
        name = str(env.get("title") or "")
        language = str(env.get("language") or "")
        resources = json.dumps(env.get("resources") or {}, ensure_ascii=False)
        desc_text = _description_to_text(str(env.get("description") or ""))
        rows.append((env_id, cost, name, language, resources, desc_text))

    terminal_width = max(80, console.width)
    inner_target = terminal_width - 2

    # Preferred widths; later adjusted to fit exactly within terminal width.
    id_width = max(len(headers[0]), *(len(r[0]) for r in rows)) if rows else len(headers[0])
    cost_width = max(len(headers[1]), *(len(r[1]) for r in rows)) if rows else len(headers[1])
    name_width = max(len(headers[2]), *(len(r[2]) for r in rows)) if rows else len(headers[2])
    lang_width = max(len(headers[3]), *(len(r[3]) for r in rows)) if rows else len(headers[3])

    id_width = max(12, min(id_width, 28))
    cost_width = max(6, min(cost_width, 16))
    name_width = max(18, min(name_width, 32))
    lang_width = max(8, min(lang_width, 16))

    # Resources column gets remaining space.
    used_without_resources = (
        (id_width + 2)
        + (cost_width + 2)
        + (name_width + 2)
        + (lang_width + 2)
        + 4  # column separators between 5 columns
        + 2  # left/right padding of border interior
    )
    resources_width = max(20, inner_target - used_without_resources)

    # If terminal is very narrow, squeeze fixed columns further.
    if resources_width == 20 and used_without_resources + resources_width > inner_target:
        overflow = (used_without_resources + resources_width) - inner_target
        # Reduce name first, then id, then lang within minimums.
        shrink_name = min(max(0, name_width - 12), overflow)
        name_width -= shrink_name
        overflow -= shrink_name
        if overflow > 0:
            shrink_id = min(max(0, id_width - 10), overflow)
            id_width -= shrink_id
            overflow -= shrink_id
        if overflow > 0:
            shrink_lang = min(max(0, lang_width - 6), overflow)
            lang_width -= shrink_lang

    # Recompute resources width with final fixed widths.
    used_without_resources = (
        (id_width + 2)
        + (cost_width + 2)
        + (name_width + 2)
        + (lang_width + 2)
        + 4
        + 2
    )
    resources_width = max(12, inner_target - used_without_resources)

    c1 = id_width + 2
    c2 = cost_width + 2
    c3 = name_width + 2
    c4 = lang_width + 2
    c5 = resources_width + 2
    inner_total = c1 + c2 + c3 + c4 + c5 + 4

    console.print("Environments".center(inner_total + 2), style="bold")

    console.print(
        "┏"
        + "━" * c1
        + "┳"
        + "━" * c2
        + "┳"
        + "━" * c3
        + "┳"
        + "━" * c4
        + "┳"
        + "━" * c5
        + "┓"
    )
    console.print(
        "┃ "
        + _pad_cell(headers[0], id_width)
        + " ┃ "
        + _pad_cell(headers[1], cost_width, align_right=True)
        + " ┃ "
        + _pad_cell(headers[2], name_width)
        + " ┃ "
        + _pad_cell(headers[3], lang_width)
        + " ┃ "
        + _pad_cell(headers[4], resources_width)
        + " ┃"
    )
    console.print(
        "┡"
        + "━" * c1
        + "╇"
        + "━" * c2
        + "╇"
        + "━" * c3
        + "╇"
        + "━" * c4
        + "╇"
        + "━" * c5
        + "┩"
    )

    for index, (env_id, cost, name, language, resources, desc_text) in enumerate(rows):
        span_width = inner_total - 2
        for line in _wrap_lines(desc_text, span_width):
            console.print("│ " + _pad_cell(line, span_width))

        # Thin line between full-width detail line and the summary line.
        console.print("├" + "─" * inner_total + "┤")

        console.print(
            "│ "
            + _pad_cell(env_id, id_width)
            + " │ "
            + _pad_cell(cost, cost_width, align_right=True)
            + " │ "
            + _pad_cell(name, name_width)
            + " │ "
            + _pad_cell(language, lang_width)
            + " │ "
            + _pad_cell(resources, resources_width)
            + " │"
        )

        if index < len(rows) - 1:
            console.print("├" + "─" * inner_total + "┤")

    console.print("└" + "─" * inner_total + "┘")
