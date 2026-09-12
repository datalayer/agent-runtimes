# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
The work both workers do, so that neither is the one doing it better.

PLAN_ORCHESTRATOR.md O0-13 asks for one objective delegated to an A2A worker
and to an ACP worker with only the descriptor differing. If the two workers
analysed the notebook differently, a difference in the answers would say
nothing about orchestration — so the analysis is here, once, and each worker
is a protocol shell around this module.

The analysis needs no model and no network: it reads the notebook, reports
what is wrong with it, and is deterministic, so the example runs anywhere and
a difference between the two runs is a difference in the orchestration.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Finding:
    """One thing wrong with the notebook.

    Parameters
    ----------
    cell : int
        Which cell, counting from 1 as a person reading the notebook does.
    kind : str
        What sort of problem: ``error``, ``never-ran``, ``undefined``.
    detail : str
        What to say about it.
    """

    cell: int
    kind: str
    detail: str

    def to_wire(self) -> dict[str, Any]:
        """
        The finding as JSON, for the structured half of a worker's answer.

        Returns
        -------
        dict[str, Any]
            The finding.
        """
        return {"cell": self.cell, "kind": self.kind, "detail": self.detail}


@dataclass
class Report:
    """What the analysis found, as both prose and structure.

    Parameters
    ----------
    notebook : str
        The notebook's name.
    cells : int
        How many cells it has.
    code_cells : int
        How many of those are code.
    executed : int
        How many code cells carry an execution count.
    findings : list[Finding]
        What is wrong with it.
    """

    notebook: str
    cells: int = 0
    code_cells: int = 0
    executed: int = 0
    findings: list[Finding] = field(default_factory=list)

    @property
    def verdict(self) -> str:
        """
        One line a person can act on.

        Returns
        -------
        str
            The verdict.
        """
        if not self.findings:
            return "The notebook runs clean."
        errors = sum(1 for finding in self.findings if finding.kind == "error")
        return (
            f"The notebook does not run clean: {len(self.findings)} problems, "
            f"{errors} of them raised."
        )

    def to_wire(self) -> dict[str, Any]:
        """
        The report as JSON.

        Returns
        -------
        dict[str, Any]
            The report.
        """
        return {
            "notebook": self.notebook,
            "cells": self.cells,
            "codeCells": self.code_cells,
            "executed": self.executed,
            "verdict": self.verdict,
            "findings": [finding.to_wire() for finding in self.findings],
        }

    def as_text(self) -> str:
        """
        The report as the prose a worker answers with.

        Both protocols carry text on their plain path — an A2A artifact part
        and an ACP content block — so the answer is written once here and
        neither adapter has to invent one.

        Returns
        -------
        str
            The answer.
        """
        lines = [
            self.verdict,
            "",
            f"{self.notebook}: {self.cells} cells, {self.code_cells} of them code, "
            f"{self.executed} with an execution count.",
        ]
        for finding in self.findings:
            lines.append(f"- Cell {finding.cell} ({finding.kind}): {finding.detail}")
        return "\n".join(lines)


def _source_of(cell: dict[str, Any]) -> str:
    """
    A cell's source, whichever way nbformat stored it.

    Parameters
    ----------
    cell : dict[str, Any]
        The cell.

    Returns
    -------
    str
        Its source as one string.
    """
    source = cell.get("source") or ""
    return source if isinstance(source, str) else "".join(source)


def _assigns(source: str) -> str | None:
    """
    The name a cell assigns at its top level, when it assigns one.

    Read line by line rather than off the first ``=`` in the cell: the first
    line of a cell is as often a comment mentioning a column name as it is
    the assignment, and splitting the whole source on ``=`` finds the comment.

    Parameters
    ----------
    source : str
        The cell's source.

    Returns
    -------
    str | None
        The name, or ``None`` when the cell assigns nothing.
    """
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" in stripped.split("=")[0]:
            continue
        head, _, rest = stripped.partition("=")
        name = head.strip()
        if rest.startswith("=") or not name or not name.isidentifier():
            continue
        return name
    return None


def analyse(notebook_path: Path) -> Report:
    """
    Read the notebook and report what is wrong with it.

    Three things are looked for, because all three are true of the notebook
    beside this file and each is a different kind of wrong: a cell whose
    stored output is an exception, a cell that names something an earlier
    cell failed to define, and a code cell that was never run at all.

    Parameters
    ----------
    notebook_path : Path
        The notebook.

    Returns
    -------
    Report
        What the analysis found.
    """
    document = json.loads(notebook_path.read_text())
    cells = document.get("cells") or []
    report = Report(notebook=notebook_path.name, cells=len(cells))
    undefined: set[str] = set()
    for index, cell in enumerate(cells, start=1):
        if cell.get("cell_type") != "code":
            continue
        report.code_cells += 1
        if cell.get("execution_count"):
            report.executed += 1
        else:
            report.findings.append(
                Finding(
                    cell=index,
                    kind="never-ran",
                    detail="This code cell has no execution count: it never ran, so "
                    "nothing here says whether it works.",
                )
            )
        for output in cell.get("outputs") or []:
            if output.get("output_type") != "error":
                continue
            name = str(output.get("ename") or "error")
            value = str(output.get("evalue") or "").strip()
            report.findings.append(
                Finding(
                    cell=index,
                    kind="error",
                    detail=f"{name}: {value}" if value else name,
                )
            )
            # The assignment this cell was making never happened, so every
            # later cell reading it is broken by this one.
            target = _assigns(_source_of(cell))
            if target:
                undefined.add(target)
    for index, cell in enumerate(cells, start=1):
        if cell.get("cell_type") != "code":
            continue
        if any(
            (output.get("output_type") == "error")
            for output in cell.get("outputs") or []
        ):
            # This cell already has its own error reported; saying it also
            # reads something undefined is the same fact twice.
            continue
        source = _source_of(cell)
        for name in sorted(undefined):
            if _assigns(source) == name:
                continue
            if name in source:
                report.findings.append(
                    Finding(
                        cell=index,
                        kind="undefined",
                        detail=f"Reads '{name}', which the cell that was to define it "
                        "never assigned.",
                    )
                )
    report.findings.sort(key=lambda finding: (finding.cell, finding.kind))
    return report
