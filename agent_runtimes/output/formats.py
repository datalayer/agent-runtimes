# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The formats an answer comes in besides words, as a run is asked for them.

An application says the formats its answers come in, by media type, words
first (agentspecs' ``interface.outputs``); served over A2A they are its agent
card's output modes. A caller names the ones it accepts with each request
(``acceptedOutputModes``), which fasta2a hands the worker as the task's
``accepted_output_modes``. The A2A worker then opens a run's outputs
(:func:`enter_run_outputs`): the formats both sides name, words left out,
since words are the answer itself.

What is not words is composed by the agent with a tool of its own, offered
only in a run that accepts its format (:data:`OUTPUT_TOOLS`), and checked here
before it is kept. The worker carries what was composed as an A2A artifact,
one part of its media type (:func:`artifacts_of`), beside the text.

The one such format today is a Jupyter notebook (``application/x-ipynb+json``),
written with ``write_notebook``: a valid nbformat 4 document that runs in the
reader's browser, offline (Pyodide) — the figures the agent read embedded as
data, the analysis as code cells, the explanation as markdown. No network, no
module but pandas, numpy, matplotlib and Python's standard library, nothing
that looks like a credential: a notebook that breaks one of these is refused
with a sentence the model acts on, and it writes it again.
"""

from __future__ import annotations

import ast
import json
import re
import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any, Iterable, Literal, Optional, Sequence

from pydantic import BaseModel, Field

from agent_runtimes.orchestration.documents import NOTEBOOK_MEDIA_TYPE

__all__ = [
    "NOTEBOOK_MEDIA_TYPE",
    "OUTPUT_TOOLS",
    "OUTPUT_TOOL_NOTES",
    "TEXT_MEDIA_TYPES",
    "WRITE_NOTEBOOK",
    "NotebookCell",
    "NotebookRefused",
    "RunOutputs",
    "accepted_formats",
    "artifacts_of",
    "card_output_modes",
    "current_run_outputs",
    "enter_run_outputs",
    "leave_run_outputs",
    "notebook_of_cells",
    "outputs_instructions",
    "outputs_toolset",
    "tool_given",
]

#: The media types an answer in words comes in: the answer itself, never an artifact of its own.
TEXT_MEDIA_TYPES: frozenset[str] = frozenset({"text/plain", "text/markdown"})

#: The tool an agent composes a notebook with.
WRITE_NOTEBOOK = "write_notebook"

#: The tools that compose an output, by the media type each writes.
OUTPUT_TOOLS: dict[str, str] = {WRITE_NOTEBOOK: NOTEBOOK_MEDIA_TYPE}

#: What a caller is told while an output tool runs, and once it has: (call, end).
OUTPUT_TOOL_NOTES: dict[str, tuple[str, str]] = {
    WRITE_NOTEBOOK: ("Writing a notebook…", "Notebook written"),
}

#: The modules a notebook may import: what Pyodide ships, and Python's own.
NOTEBOOK_MODULES: frozenset[str] = frozenset(
    {
        "pandas",
        "numpy",
        "matplotlib",
        "json",
        "csv",
        "io",
        "math",
        "statistics",
        "datetime",
        "decimal",
        "fractions",
        "collections",
        "itertools",
        "functools",
        "operator",
        "re",
        "string",
        "textwrap",
        "calendar",
    }
)

#: The most cells, and characters, a notebook is written with.
MAX_CELLS = 60
MAX_CHARACTERS = 200_000

_URL = re.compile(r"\b(?:https?|wss?|ftp)://", re.IGNORECASE)
_SECRET = re.compile(
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"  # a JWT
    r"|\bBearer\s+[A-Za-z0-9._~+/-]{12,}"  # a bearer token
    r"|\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}"  # an API key
    r"|\b(?:password|passwd|api_key|apikey|secret|token)\s*=\s*['\"][^'\"]+['\"]",
    re.IGNORECASE,
)
_NAMES_REFUSED = frozenset(
    {"__import__", "exec", "eval", "compile", "open", "importlib", "input"}
)


class NotebookRefused(ValueError):
    """A notebook that does not run offline in the reader's browser, in a sentence."""


class NotebookCell(BaseModel):
    """One cell of a notebook, as the agent writes it."""

    kind: Literal["markdown", "code"] = Field(
        description="`markdown` for words, `code` for Python"
    )
    source: str = Field(description="The cell's text: markdown, or Python code")


@dataclass
class RunOutputs:
    """What a run may give besides words, and what it gave."""

    #: The media types the caller accepts and the agent gives, words left out.
    accepted: tuple[str, ...] = ()
    #: The notebook composed, once it is.
    notebook: Optional[dict[str, Any]] = None
    #: Its title, which names the artifact and the file.
    notebook_title: str = ""

    def accepts(self, media_type: str) -> bool:
        return media_type in self.accepted


_RUN_OUTPUTS: ContextVar[Optional[RunOutputs]] = ContextVar(
    "agent_runtimes_run_outputs", default=None
)


def card_output_modes(outputs: Sequence[str]) -> list[str]:
    """The output modes an agent card declares: its outputs, plain text when it says none."""
    return list(outputs) or ["text/plain"]


def accepted_formats(
    gives: Sequence[str], accepted: Optional[Iterable[str]]
) -> tuple[str, ...]:
    """
    The formats a run gives besides words: those both the agent and its caller name.

    Parameters
    ----------
    gives : Sequence[str]
        The agent's output modes, as its card declares them.
    accepted : Optional[Iterable[str]]
        What the caller accepts (``accepted_output_modes``); a caller that
        names nothing is given words alone.

    Returns
    -------
    tuple[str, ...]
        In the agent's order, words left out.
    """
    wanted = set(accepted or ())
    return tuple(
        media_type
        for media_type in gives
        if media_type in wanted and media_type not in TEXT_MEDIA_TYPES
    )


def enter_run_outputs(outputs: RunOutputs) -> Token[Optional[RunOutputs]]:
    """Open a run's outputs; answer the token to close them with."""
    return _RUN_OUTPUTS.set(outputs)


def leave_run_outputs(token: Token[Optional[RunOutputs]]) -> None:
    _RUN_OUTPUTS.reset(token)


def current_run_outputs() -> Optional[RunOutputs]:
    """The outputs of the run under way, when it was opened with some."""
    return _RUN_OUTPUTS.get()


def tool_given(tool_name: str) -> bool:
    """Whether an output tool is offered: only in a run whose caller accepts its format."""
    media_type = OUTPUT_TOOLS.get(tool_name)
    if media_type is None:
        return True
    outputs = current_run_outputs()
    return outputs is not None and outputs.accepts(media_type)


def outputs_instructions(outputs: RunOutputs) -> str:
    """What the agent is told of the formats this run may give besides words; empty for none."""
    if not outputs.accepts(NOTEBOOK_MEDIA_TYPE):
        return ""
    modules = ", ".join(sorted({"pandas", "numpy", "matplotlib"}))
    return (
        "\n\n---\n"
        "Who asked accepts a Jupyter notebook beside your answer. When the request asks "
        "for one, or your answer has figures worth working with, compose it with the "
        f"`{WRITE_NOTEBOOK}` tool, once, after you have read the figures: a markdown cell "
        "that says what it is (its period, its currency, whom it is for); a code cell that "
        "builds a pandas DataFrame from the figures you read, written in it as literals; "
        "code cells for the analysis (totals, breakdowns, comparisons) and a matplotlib "
        "chart where one helps; a markdown cell explaining each result. The notebook runs "
        "in the reader's browser, offline: nothing in it reaches the network, your tools "
        "or your connections, and it holds no credential, key or token. Import only "
        f"{modules} and Python's standard library. Still answer in words as you would, "
        "and say in one sentence that a notebook comes with it."
    )


def _imports(tree: ast.AST) -> list[str]:
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                names.append("." * node.level + (node.module or ""))
            elif node.module:
                names.append(node.module)
    return names


def _code_problem(index: int, source: str) -> str:
    """Why a code cell does not run offline in the reader's browser, or ``""``."""
    where = f"Cell {index + 1}"
    for line in source.splitlines():
        if line.lstrip().startswith(("%", "!")):
            return f"{where} has a magic or a shell command ({line.strip()!r}): write plain Python."
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return f"{where} is not valid Python: {error.msg} (line {error.lineno})."
    for name in _imports(tree):
        if name.split(".")[0] not in NOTEBOOK_MODULES:
            allowed = ", ".join(sorted(NOTEBOOK_MODULES))
            return (
                f"{where} imports {name!r}, which the reader's browser does not have offline: "
                f"import only {allowed}."
            )
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in _NAMES_REFUSED:
            return f"{where} calls {node.id!r}: the notebook computes from its own data only."
    return ""


def notebook_of_cells(
    cells: Sequence[NotebookCell | dict[str, Any]], title: str = ""
) -> dict[str, Any]:
    """
    A notebook from the cells an agent wrote, valid nbformat 4, that runs offline.

    Parameters
    ----------
    cells : Sequence[NotebookCell | dict]
        Each ``{kind: "markdown" | "code", source}``, in order.
    title : str
        What it is, in a few words; kept in its metadata.

    Returns
    -------
    dict[str, Any]
        The notebook, as JSON data: its code cells not run.

    Raises
    ------
    NotebookRefused
        With the sentence that says what to change: no cell, too many, a code
        cell that is not Python, that imports a module the browser does not
        have offline, or a URL or a credential anywhere.
    """
    import nbformat
    from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

    written = [
        cell if isinstance(cell, NotebookCell) else NotebookCell.model_validate(cell)
        for cell in cells
    ]
    if not written:
        raise NotebookRefused("A notebook has at least one cell.")
    if len(written) > MAX_CELLS:
        raise NotebookRefused(
            f"A notebook has at most {MAX_CELLS} cells; this one has {len(written)}."
        )
    size = sum(len(cell.source) for cell in written) + len(title)
    if size > MAX_CHARACTERS:
        raise NotebookRefused(
            f"A notebook holds at most {MAX_CHARACTERS:,} characters; this one has {size:,}."
        )
    if not any(cell.kind == "code" for cell in written):
        raise NotebookRefused(
            "A notebook has at least one code cell: the analysis, in Python."
        )
    for index, cell in enumerate(written):
        if _SECRET.search(cell.source) or _SECRET.search(title):
            raise NotebookRefused(
                f"Cell {index + 1} holds what looks like a credential, a key or a token: "
                "a notebook holds none."
            )
        if cell.kind == "code":
            if _URL.search(cell.source):
                raise NotebookRefused(
                    f"Cell {index + 1} names a URL: the notebook runs offline and reaches nothing."
                )
            problem = _code_problem(index, cell.source)
            if problem:
                raise NotebookRefused(problem)
    notebook = new_notebook(
        cells=[
            new_code_cell(cell.source)
            if cell.kind == "code"
            else new_markdown_cell(cell.source)
            for cell in written
        ],
        metadata={
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python"},
            **({"title": title.strip()} if title.strip() else {}),
        },
    )
    nbformat.validate(notebook)
    return json.loads(nbformat.writes(notebook))


def write_notebook(title: str, cells: list[NotebookCell]) -> str:
    """
    Compose the Jupyter notebook that goes with your answer, for the reader to run.

    Call it once, after you have read the figures. It runs in the reader's
    browser, offline.

    Parameters
    ----------
    title : str
        What it is, in a few words: `Open invoices, October 2026`.
    cells : list[NotebookCell]
        Its cells in order: markdown for words, code (Python) for the data and
        the analysis.

    Returns
    -------
    str
        That it was written, or why not.
    """
    from pydantic_ai import ModelRetry

    outputs = current_run_outputs()
    if outputs is None or not outputs.accepts(NOTEBOOK_MEDIA_TYPE):
        return "Who asked does not accept a notebook: answer in words only."
    try:
        notebook = notebook_of_cells(cells, title)
    except NotebookRefused as refused:
        raise ModelRetry(f"The notebook was not written. {refused}") from None
    outputs.notebook = notebook
    outputs.notebook_title = title.strip()
    return (
        f"Notebook written ({len(notebook['cells'])} cells): it goes with your answer."
    )


def outputs_toolset(outputs: Sequence[str]) -> Any:
    """The tools that compose the outputs an agent gives besides words; ``None`` for none."""
    if NOTEBOOK_MEDIA_TYPE not in outputs:
        return None
    from pydantic_ai.toolsets import FunctionToolset

    # A refused notebook is written again: twice more, then the run says why.
    return FunctionToolset([write_notebook], id="outputs", max_retries=2)


def _file_name(title: str, extension: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower()[:60] or "notebook"
    return f"{stem}{extension}"


def artifacts_of(outputs: RunOutputs) -> list[Any]:
    """
    What a run composed besides words, as A2A artifacts: one part of its media type each.

    A notebook is a data part, the nbformat document itself, under
    ``application/x-ipynb+json``, named with a file name.
    """
    from fasta2a.schema import Artifact, Part

    artifacts: list[Any] = []
    if outputs.notebook is not None:
        title = outputs.notebook_title or "Notebook"
        artifacts.append(
            Artifact(
                artifact_id=str(uuid.uuid4()),
                name=title,
                description="A Jupyter notebook, to run in the reader's browser.",
                parts=[
                    Part(
                        data=outputs.notebook,
                        media_type=NOTEBOOK_MEDIA_TYPE,
                        filename=_file_name(title, ".ipynb"),
                    )
                ],
            )
        )
    return artifacts
