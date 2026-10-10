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

Components of the catalog (``application/json+a2ui``, A2UI's media type) are
the other: shown with ``show_components`` — the sources as cards that open, a
comparison as a table, a series as a chart, a choice as buttons that answer
the application — each call one A2UI surface, the runtime building its nodes
from what the agent gave and checking each against the catalog's JSON Schema
(`agent_runtimes.loop.apps.components`). A button pressed comes back as the
reader's next turn, its action in the message's metadata
(``loop.action``): one whose option does more than read is refused to a
visitor in a sentence before any model runs (:func:`refused_action`).

A Jupyter notebook (``application/x-ipynb+json``) is
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
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Optional, Sequence

from pydantic import BaseModel, Field

from agent_runtimes.orchestration.documents import NOTEBOOK_MEDIA_TYPE

__all__ = [
    "A2UI_MEDIA_TYPE",
    "NOTEBOOK_MEDIA_TYPE",
    "SHOW_COMPONENTS",
    "ShownChart",
    "ShownChoice",
    "ShownOption",
    "ShownSource",
    "ShownTable",
    "SurfaceRefused",
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
    "refused_action",
    "surface_of_components",
    "tool_given",
]

#: The media types an answer in words comes in: the answer itself, never an artifact of its own.
TEXT_MEDIA_TYPES: frozenset[str] = frozenset({"text/plain", "text/markdown"})

#: The tool an agent composes a notebook with.
WRITE_NOTEBOOK = "write_notebook"

#: Components of the catalog, as an A2UI surface: A2UI's media type over A2A.
A2UI_MEDIA_TYPE = "application/json+a2ui"

#: The tool an agent shows components of the catalog with.
SHOW_COMPONENTS = "show_components"

#: The tools that compose an output, by the media type each writes.
OUTPUT_TOOLS: dict[str, str] = {
    WRITE_NOTEBOOK: NOTEBOOK_MEDIA_TYPE,
    SHOW_COMPONENTS: A2UI_MEDIA_TYPE,
}

#: What a caller is told while an output tool runs, and once it has: (call, end).
OUTPUT_TOOL_NOTES: dict[str, tuple[str, str]] = {
    WRITE_NOTEBOOK: ("Writing a notebook…", "Notebook written"),
    SHOW_COMPONENTS: ("Showing it…", "Shown"),
}

#: The most surfaces a run shows, and rows (or points, or sources) one holds.
MAX_SURFACES = 3
MAX_ITEMS = 200

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
    #: The surfaces shown (`surface_of_components`), in order.
    surfaces: list[dict[str, Any]] = field(default_factory=list)

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
    return _notebook_instructions(outputs) + _components_instructions(outputs)


def _components_instructions(outputs: RunOutputs) -> str:
    if not outputs.accepts(A2UI_MEDIA_TYPE):
        return ""
    return (
        "\n\n---\n"
        "Who asked can draw components beside your answer. Show what you read with the "
        f"`{SHOW_COMPONENTS}` tool, once per answer, after you have read it, with what "
        "fits: `sources` — the records, datasets or pages your answer rests on, each a "
        "card with its title, its link when it has a public one, and the passage or "
        "figure it gave; `table` — rows that compare, under their columns; `chart` — "
        "a series of numbers, a point per row, `x` the field across and `y` the one "
        "measured; `choice` — a question and two to four options, buttons the reader "
        "presses to answer you, each saying what choosing it does (`read`, `write`, "
        "`send`, `delete`…). When you are asked to do something that would change, "
        "send or delete — which you do not do yourself — say what you would do and "
        "show it as a choice: that action, its `does` what it would do, and *Not now* "
        "(`read`); a person decides, and your rules apply when it is pressed. Every "
        "value comes from what you read: invent no row, point, source or link; with "
        "nothing read for it — no row, no point — show nothing, and say so. Still "
        "answer in words, and say in one sentence what is shown, or why it is not."
    )


def _notebook_instructions(outputs: RunOutputs) -> str:
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


# --- components of the catalog ------------------------------------------------------

#: What an option of a choice does when it is chosen: the classes of the rules.
OptionDoes = Literal["read", "write", "send", "buy", "delete", "publish"]


class SurfaceRefused(ValueError):
    """Components the catalog does not draw as given, in a sentence."""


class ShownSource(BaseModel):
    """One source an answer rests on: a card that opens its link."""

    title: str = Field(description="What it is: an invoice's number, a dataset's name")
    url: str = Field(
        default="", description="Its public link, when it has one; empty otherwise"
    )
    passage: str = Field(
        default="", description="What it gave: the passage, the figure, the date"
    )


class ShownTable(BaseModel):
    """Rows that compare, under their columns."""

    title: str = Field(default="", description="What the table is, above it")
    columns: list[str] = Field(description="The columns, in order: the rows' keys")
    rows: list[dict[str, Any] | list[Any]] = Field(
        description="The rows, each by its columns, or its values in the columns' order"
    )


class ShownChart(BaseModel):
    """A series of numbers, drawn: a point per row."""

    title: str = Field(default="", description="What the chart shows, above it")
    kind: Literal["bar", "line", "scatter", "area"] = Field(
        default="bar", description="How the numbers are drawn"
    )
    x: str = Field(description="The field along the bottom")
    y: str = Field(description="The field measured: a number")
    series: str = Field(default="", description="A field whose values are drawn apart")
    points: list[dict[str, Any]] = Field(
        description="The points, each with `x` and `y`"
    )


class ShownOption(BaseModel):
    """One button of a choice."""

    label: str = Field(description="Its words: what the reader chooses")
    does: OptionDoes = Field(
        default="read", description="What choosing it does: `read`, or what it changes"
    )


class ShownChoice(BaseModel):
    """A question, and the buttons that answer it."""

    question: str = Field(description="What is asked of the reader, in a sentence")
    options: list[ShownOption] = Field(description="Two to four options, in order")


def _items(kind: str, items: Sequence[Any]) -> None:
    if not items:
        raise SurfaceRefused(
            f"The {kind} has nothing in it: show it only with what you read."
        )
    if len(items) > MAX_ITEMS:
        raise SurfaceRefused(
            f"The {kind} holds at most {MAX_ITEMS}; this one has {len(items)}."
        )


def surface_of_components(
    title: str,
    sources: Optional[Sequence[ShownSource | dict[str, Any]]] = None,
    table: Optional[ShownTable | dict[str, Any]] = None,
    chart: Optional[ShownChart | dict[str, Any]] = None,
    choice: Optional[ShownChoice | dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    An answer's components as the A2UI surface that draws them, each checked.

    The nodes are the catalog's — ``Evidence`` for the sources, ``Table``,
    ``Chart``, and a ``Row`` of ``Button`` for a choice, each option's
    action named by its words with what it does (``{"does": ...}``) — and
    each is checked against the catalog's JSON Schema; the values sit in the
    surface's data model, which the nodes read by path.

    Returns
    -------
    dict
        ``{surfaceId, catalogId, title, messages}``, its id ``answer-…``.

    Raises
    ------
    SurfaceRefused
        For nothing to show, an empty or oversized list, a table's row or a
        chart's point without its fields, a choice of fewer than two options
        or more than four, or a node the catalog refuses.
    """
    from agent_runtimes.loop.apps.components import answer_surface, component_node

    nodes: list[dict[str, Any]] = []
    data: dict[str, Any] = {}
    try:
        if sources:
            read = [
                item
                if isinstance(item, ShownSource)
                else ShownSource.model_validate(item)
                for item in sources
            ]
            _items("list of sources", read)
            for index, source in enumerate(read):
                if not source.title.strip() and not source.url.strip():
                    raise SurfaceRefused(
                        f"Source {index + 1} has neither a title nor a link."
                    )
                if source.url and not re.match(r"^https?://", source.url):
                    raise SurfaceRefused(
                        f"Source {index + 1}'s link is not a web address: leave it empty."
                    )
            data["sources"] = [item.model_dump() for item in read]
            nodes.append(
                component_node(
                    "sources", "Evidence", title="Sources", sources={"path": "/sources"}
                )
            )
        if table is not None:
            shown = (
                table
                if isinstance(table, ShownTable)
                else ShownTable.model_validate(table)
            )
            _items("table", shown.rows)
            data["rows"] = []
            for index, row in enumerate(shown.rows):
                if isinstance(row, list):
                    # Its values in the columns' order, as a model often gives them.
                    if len(row) > len(shown.columns):
                        raise SurfaceRefused(
                            f"Row {index + 1} of the table has {len(row)} values "
                            f"for {len(shown.columns)} columns."
                        )
                    row = dict(zip(shown.columns, row))
                data["rows"].append(
                    {column: row.get(column, "") for column in shown.columns}
                )
            nodes.append(
                component_node(
                    "table",
                    "Table",
                    columns=list(shown.columns),
                    rows={"path": "/rows"},
                    **({"title": shown.title.strip()} if shown.title.strip() else {}),
                )
            )
        if chart is not None:
            drawn = (
                chart
                if isinstance(chart, ShownChart)
                else ShownChart.model_validate(chart)
            )
            _items("chart", drawn.points)
            for index, point in enumerate(drawn.points):
                if drawn.x not in point or drawn.y not in point:
                    raise SurfaceRefused(
                        f"Point {index + 1} of the chart has no {drawn.x!r} or no {drawn.y!r}."
                    )
            data["points"] = list(drawn.points)
            nodes.append(
                component_node(
                    "chart",
                    "Chart",
                    kind=drawn.kind,
                    x=drawn.x,
                    y=drawn.y,
                    points={"path": "/points"},
                    **({"series": drawn.series} if drawn.series else {}),
                    **({"title": drawn.title.strip()} if drawn.title.strip() else {}),
                )
            )
        if choice is not None:
            asked = (
                choice
                if isinstance(choice, ShownChoice)
                else ShownChoice.model_validate(choice)
            )
            if not 2 <= len(asked.options) <= 4:
                raise SurfaceRefused("A choice has two to four options.")
            nodes.append(
                component_node("choice-question", "Text", text=asked.question.strip())
            )
            buttons: list[str] = []
            for index, option in enumerate(asked.options):
                label_id, button_id = f"option-{index}-label", f"option-{index}"
                nodes.append(
                    component_node(label_id, "Text", text=option.label.strip())
                )
                nodes.append(
                    component_node(
                        button_id,
                        "Button",
                        child=label_id,
                        variant="primary" if index == 0 else "default",
                        action={
                            "event": {
                                "name": option.label.strip(),
                                "context": {"does": option.does},
                            }
                        },
                    )
                )
                buttons.append(button_id)
            nodes.append(component_node("choice", "Row", children=buttons))
    except ValueError as refused:
        if isinstance(refused, SurfaceRefused):
            raise
        raise SurfaceRefused(str(refused)) from None
    if not nodes:
        raise SurfaceRefused(
            "Nothing to show: give the sources, a table, a chart or a choice."
        )
    # The labels and the buttons sit in the choice's row, the question above it.
    named = {"option-" + str(i) + "-label" for i in range(4)} | {
        "option-" + str(i) for i in range(4)
    }
    order = [node for node in nodes if node["id"] not in named]
    nested = [node for node in nodes if node["id"] in named]
    root = {
        "id": "root",
        "component": "Column",
        "children": [node["id"] for node in order],
    }
    return answer_surface(
        uuid.uuid4().hex, title.strip() or "Shown", [root, *order, *nested], data
    )


def show_components(
    title: str,
    sources: Optional[list[ShownSource]] = None,
    table: Optional[ShownTable] = None,
    chart: Optional[ShownChart] = None,
    choice: Optional[ShownChoice] = None,
) -> str:
    """
    Show components beside your answer: the sources, a table, a chart, a choice.

    Call it once per answer, after you have read what it shows; every value
    comes from what you read.

    Parameters
    ----------
    title : str
        What is shown, in a few words: `Open invoices, October 2026`.
    sources : list[ShownSource], optional
        What your answer rests on, each a card: its title, its public link
        when it has one, the passage or figure it gave.
    table : ShownTable, optional
        Rows that compare, under their columns.
    chart : ShownChart, optional
        A series of numbers, a point per row.
    choice : ShownChoice, optional
        A question and two to four buttons that answer you; an action you
        would take but do not take yourself is one of them, with what it does.

    Returns
    -------
    str
        That it is shown, or why not: a refusal is the call's answer, not its
        failure, and the answer says it in words (H-02, 2026-10-08).
    """
    outputs = current_run_outputs()
    if outputs is None or not outputs.accepts(A2UI_MEDIA_TYPE):
        return "Who asked does not draw components: answer in words only."
    if len(outputs.surfaces) >= MAX_SURFACES:
        return f"{MAX_SURFACES} are shown already: answer in words."
    try:
        surface = surface_of_components(title, sources, table, chart, choice)
    except SurfaceRefused as refused:
        return shown_refusal(refused)
    outputs.surfaces.append(surface)
    return "Shown beside your answer."


def shown_refusal(refused: SurfaceRefused) -> str:
    """What ``show_components`` answers when the catalog would not draw what was given.

    The call succeeds with it: a refused surface is not a failed tool call
    (the transcript said *show_components failed* when Odoo had no open
    invoice and the table came empty, 2026-10-08). The agent is told why, and
    to say it in its answer — or to show it again, corrected, when it read
    what the surface needs.
    """
    return (
        f"Nothing was shown: {refused} Say in your answer, in a sentence, what "
        "was not shown and why; or call it again with what you read, corrected."
    )


def refused_action(message: Any) -> str:
    """
    Why a button pressed on an answer's surface is not acted on, or ``""``.

    A press comes back as the reader's turn with its action in the message's
    metadata (``loop.action``: its name, and ``payload.does``). In a
    visitor's run an option that does more than read is refused in the
    sentence a visitor's tool call is (`visitor_refusal`), before any model
    runs: nobody is there to be asked. Anywhere else, or for an option that
    reads, nothing is refused here: the agent is asked, and its rules apply.
    """
    from collections.abc import Mapping

    from agent_runtimes.loop.apps.rules import DO_IT
    from agent_runtimes.loop.apps.visitors import visitor_refusal

    meta = message.get("metadata") if isinstance(message, Mapping) else None
    ours = meta.get("loop") if isinstance(meta, Mapping) else None
    action = ours.get("action") if isinstance(ours, Mapping) else None
    if not isinstance(action, Mapping):
        return ""
    payload = action.get("payload")
    does = payload.get("does") if isinstance(payload, Mapping) else None
    classes = [does] if isinstance(does, str) and does.strip() else ["read"]
    name = str(action.get("name") or "").strip() or "it"
    return visitor_refusal(name, classes, DO_IT)


def outputs_toolset(outputs: Sequence[str]) -> Any:
    """The tools that compose the outputs an agent gives besides words; ``None`` for none."""
    tools = [
        tool
        for media_type, tool in (
            (NOTEBOOK_MEDIA_TYPE, write_notebook),
            (A2UI_MEDIA_TYPE, show_components),
        )
        if media_type in outputs
    ]
    if not tools:
        return None
    from pydantic_ai.toolsets import FunctionToolset

    # A refused notebook is written again: twice more, then the run says why.
    # A refused surface is answered, not retried: the answer says why.
    return FunctionToolset(tools, id="outputs", max_retries=2)


def _file_name(title: str, extension: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower()[:60] or "notebook"
    return f"{stem}{extension}"


def artifacts_of(outputs: RunOutputs) -> list[Any]:
    """
    What a run composed besides words, as A2A artifacts: one part of its media type each.

    A notebook is a data part, the nbformat document itself, under
    ``application/x-ipynb+json``, named with a file name; each surface shown a
    data part under ``application/json+a2ui``: ``{surfaceId, catalogId,
    title, messages}``, what the page draws it from.
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
    # Each surface shown, one artifact: the A2UI messages that draw it.
    for surface in outputs.surfaces:
        artifacts.append(
            Artifact(
                artifact_id=str(uuid.uuid4()),
                name=str(surface.get("title") or "Shown"),
                description="Components of the catalog, drawn under the answer.",
                parts=[Part(data=surface, media_type=A2UI_MEDIA_TYPE)],
            )
        )
    return artifacts
