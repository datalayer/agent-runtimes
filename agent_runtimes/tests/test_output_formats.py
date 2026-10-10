# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The formats an answer comes in besides words: a Jupyter notebook, composed and checked.

What Accounting writes for Sales when Sales accepts a notebook: valid
nbformat 4, the figures embedded as data, the analysis in pandas and a
matplotlib chart, and nothing that needs the network, a module the
reader's browser does not have offline, or a credential.
"""

from __future__ import annotations

import json
from typing import Any

import nbformat
import pytest

from agent_runtimes.output import formats
from agent_runtimes.output.formats import (
    NOTEBOOK_MEDIA_TYPE,
    WRITE_NOTEBOOK,
    NotebookRefused,
    RunOutputs,
    accepted_formats,
    artifacts_of,
    card_output_modes,
    enter_run_outputs,
    leave_run_outputs,
    notebook_of_cells,
    outputs_instructions,
    outputs_toolset,
    tool_given,
)

#: A notebook as Accounting would write it: the figures as literals, then the analysis.
CELLS: list[dict[str, Any]] = [
    {
        "kind": "markdown",
        "source": "# Open invoices\n\nAs of 2026-10-05, in EUR, for Datalayer SAS.",
    },
    {
        "kind": "code",
        "source": (
            "import pandas as pd\n"
            "invoices = pd.DataFrame([\n"
            "    {'number': 'INV/2026/0007', 'customer': 'Ada', 'due': 1200.00},\n"
            "    {'number': 'INV/2026/0009', 'customer': 'Grace', 'due': 850.50},\n"
            "    {'number': 'INV/2026/0011', 'customer': 'Ada', 'due': 300.00},\n"
            "])\n"
            "invoices"
        ),
    },
    {"kind": "markdown", "source": "The total due, and by customer."},
    {
        "kind": "code",
        "source": (
            "total = invoices['due'].sum()\n"
            "by_customer = invoices.groupby('customer')['due'].sum().sort_values(ascending=False)\n"
            "print(f'Total due: {total:,.2f} EUR')\n"
            "by_customer"
        ),
    },
    {
        "kind": "code",
        "source": (
            "import matplotlib.pyplot as plt\n"
            "ax = by_customer.plot.bar(title='Due by customer (EUR)')\n"
            "ax.set_ylabel('EUR')\n"
            "plt.show()"
        ),
    },
]


def _run_code_cells(notebook: dict[str, Any]) -> dict[str, Any]:
    """Run a notebook's code cells in order in plain Python, as a kernel would."""
    import matplotlib

    matplotlib.use("Agg")
    namespace: dict[str, Any] = {}
    for cell in notebook["cells"]:
        if cell["cell_type"] == "code":
            source = cell["source"]
            exec(  # noqa: S102 - the notebook under test, written in this file
                compile(
                    source if isinstance(source, str) else "".join(source),
                    "<cell>",
                    "exec",
                ),
                namespace,
            )
    return namespace


class TestTheNotebook:
    def test_it_is_valid_nbformat_4_with_its_cells_in_order(self) -> None:
        notebook = notebook_of_cells(CELLS, "Open invoices, October 2026")
        nbformat.validate(nbformat.from_dict(notebook))
        assert notebook["nbformat"] == 4
        assert [cell["cell_type"] for cell in notebook["cells"]] == [
            "markdown",
            "code",
            "markdown",
            "code",
            "code",
        ]
        assert notebook["metadata"]["kernelspec"]["name"] == "python3"
        assert notebook["metadata"]["title"] == "Open invoices, October 2026"
        # Not run: the reader runs it.
        code = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
        assert all(cell["outputs"] == [] for cell in code)
        assert all(cell["execution_count"] is None for cell in code)
        # JSON, as it travels.
        assert json.loads(json.dumps(notebook)) == notebook

    def test_it_runs_in_plain_python_with_pandas(self) -> None:
        namespace = _run_code_cells(notebook_of_cells(CELLS))
        assert namespace["total"] == pytest.approx(2350.50)
        assert namespace["by_customer"].to_dict() == {"Ada": 1500.0, "Grace": 850.5}

    @pytest.mark.parametrize(
        "cell, refusal",
        [
            ("import requests\nrequests.get('x')", "imports 'requests'"),
            ("from urllib.request import urlopen", "imports 'urllib.request'"),
            ("import pyodide.http", "imports 'pyodide.http'"),
            (
                "import pandas as pd\npd.read_csv('https://odoo.example/x.csv')",
                "names a URL",
            ),
            ("%pip install odoo", "magic or a shell command"),
            ("!curl odoo", "magic or a shell command"),
            ("x = = 1", "is not valid Python"),
            ("data = open('/etc/passwd').read()", "calls 'open'"),
            ("__import__('socket')", "calls '__import__'"),
            (
                "token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lci11aWQifQ.sig'",
                "credential",
            ),
            ("api_key = 'abc123'", "credential"),
        ],
    )
    def test_what_does_not_run_offline_or_holds_a_secret_is_refused(
        self, cell: str, refusal: str
    ) -> None:
        with pytest.raises(NotebookRefused, match=refusal):
            notebook_of_cells([*CELLS[:2], {"kind": "code", "source": cell}])

    def test_a_secret_in_words_is_refused_too(self) -> None:
        with pytest.raises(NotebookRefused, match="credential"):
            notebook_of_cells(
                [
                    {
                        "kind": "markdown",
                        "source": "Asked with Bearer abcdefghijklmnop1234",
                    },
                    CELLS[1],
                ]
            )

    def test_an_empty_one_and_one_without_code_are_refused(self) -> None:
        with pytest.raises(NotebookRefused, match="at least one cell"):
            notebook_of_cells([])
        with pytest.raises(NotebookRefused, match="at least one code cell"):
            notebook_of_cells([CELLS[0]])

    def test_a_large_one_is_refused(self, monkeypatch: Any) -> None:
        monkeypatch.setattr(formats, "MAX_CELLS", 3)
        with pytest.raises(NotebookRefused, match="at most 3 cells"):
            notebook_of_cells(CELLS)


class TestTheRun:
    def test_the_card_says_its_outputs_or_plain_text(self) -> None:
        assert card_output_modes([]) == ["text/plain"]
        assert card_output_modes(["text/markdown", NOTEBOOK_MEDIA_TYPE]) == [
            "text/markdown",
            NOTEBOOK_MEDIA_TYPE,
        ]

    def test_a_run_gives_besides_words_what_both_sides_name(self) -> None:
        gives = ["text/markdown", NOTEBOOK_MEDIA_TYPE]
        assert accepted_formats(gives, [NOTEBOOK_MEDIA_TYPE, "text/markdown"]) == (
            NOTEBOOK_MEDIA_TYPE,
        )
        assert accepted_formats(gives, ["text/markdown"]) == ()
        assert accepted_formats(gives, None) == ()
        assert accepted_formats(["text/plain"], [NOTEBOOK_MEDIA_TYPE]) == ()

    def test_the_tool_is_offered_and_told_only_where_it_is_accepted(self) -> None:
        assert tool_given(WRITE_NOTEBOOK) is False
        assert tool_given("odoo_accounting_list_invoices") is True
        refused = RunOutputs(accepted=())
        accepted = RunOutputs(accepted=(NOTEBOOK_MEDIA_TYPE,))
        assert outputs_instructions(refused) == ""
        assert WRITE_NOTEBOOK in outputs_instructions(accepted)
        token = enter_run_outputs(accepted)
        try:
            assert tool_given(WRITE_NOTEBOOK) is True
        finally:
            leave_run_outputs(token)
        token = enter_run_outputs(refused)
        try:
            assert tool_given(WRITE_NOTEBOOK) is False
        finally:
            leave_run_outputs(token)

    def test_the_tool_keeps_the_notebook_for_the_run_and_retries_a_refused_one(
        self,
    ) -> None:
        from pydantic_ai import ModelRetry

        outputs = RunOutputs(accepted=(NOTEBOOK_MEDIA_TYPE,))
        token = enter_run_outputs(outputs)
        try:
            with pytest.raises(ModelRetry, match="imports 'requests'"):
                formats.write_notebook(
                    "Open invoices",
                    [formats.NotebookCell(kind="code", source="import requests")],
                )
            assert outputs.notebook is None
            said = formats.write_notebook(
                "Open invoices", [formats.NotebookCell(**cell) for cell in CELLS]
            )
        finally:
            leave_run_outputs(token)
        assert said.startswith("Notebook written (5 cells)")
        [artifact] = artifacts_of(outputs)
        [part] = artifact["parts"]
        assert artifact["name"] == "Open invoices"
        assert part["media_type"] == NOTEBOOK_MEDIA_TYPE
        assert part["filename"] == "open-invoices.ipynb"
        assert part["data"] == outputs.notebook

    def test_without_acceptance_the_tool_writes_nothing(self) -> None:
        said = formats.write_notebook("x", [formats.NotebookCell(**CELLS[1])])
        assert "does not accept a notebook" in said
        assert artifacts_of(RunOutputs()) == []

    def test_only_an_agent_that_gives_notebooks_has_the_tool(self) -> None:
        assert outputs_toolset(["text/plain"]) is None
        toolset = outputs_toolset(["text/markdown", NOTEBOOK_MEDIA_TYPE])
        assert WRITE_NOTEBOOK in toolset.tools


class TestTheApplicationsRules:
    def test_accounting_writes_its_notebook_as_reading_even_for_a_visitor(self) -> None:
        from agent_runtimes.loop.apps.enforcement import AppRulesCapability
        from agent_runtimes.loop.apps.visitors import (
            enter_visitor_run,
            leave_visitor_run,
            visitor_refusal,
        )
        from agent_runtimes.specs.apps import APP_CATALOGUE

        rules = AppRulesCapability(app=APP_CATALOGUE["accounting"])
        decision = rules.decide(WRITE_NOTEBOOK, {}).decision
        assert decision.classes == ("read",)
        assert decision.behaviour == "do_it"
        token = enter_visitor_run("tab-ada")
        try:
            assert (
                visitor_refusal(WRITE_NOTEBOOK, decision.classes, decision.behaviour)
                == ""
            )
        finally:
            leave_visitor_run(token)
        # Given only in a run whose caller accepts a notebook.
        assert rules.given(WRITE_NOTEBOOK) is False
        token = enter_run_outputs(RunOutputs(accepted=(NOTEBOOK_MEDIA_TYPE,)))
        try:
            assert rules.given(WRITE_NOTEBOOK) is True
        finally:
            leave_run_outputs(token)
        assert WRITE_NOTEBOOK in rules.get_toolset().tools


class TestTheComponents:
    """STUDIO H-02: components of the catalog beside the answer, as an A2UI surface."""

    def test_the_sources_a_table_a_chart_and_a_choice_are_the_catalogs(self) -> None:
        surface = formats.surface_of_components(
            "Aged receivables",
            sources=[
                {"title": "INV/2026/0007", "passage": "1,200.00 EUR due"},
                {"title": "MOD13Q1", "url": "https://cmr.earthdata.nasa.gov/x"},
            ],
            table={
                "columns": ["customer", "due"],
                "rows": [{"customer": "Ada", "due": 1200}],
            },
            chart={
                "x": "customer",
                "y": "due",
                "points": [{"customer": "Ada", "due": 1200}],
            },
            choice={
                "question": "Remind Ada?",
                "options": [{"label": "Send", "does": "send"}, {"label": "Not now"}],
            },
        )
        assert surface["surfaceId"].startswith("answer-")
        [created, components, data] = surface["messages"]
        assert created["createSurface"]["surfaceId"] == surface["surfaceId"]
        nodes = {
            node["id"]: node for node in components["updateComponents"]["components"]
        }
        assert nodes["root"]["children"] == [
            "sources",
            "table",
            "chart",
            "choice-question",
            "choice",
        ]
        assert nodes["sources"]["component"] == "Evidence"
        assert nodes["chart"]["points"] == {"path": "/points"}
        assert nodes["choice"]["children"] == ["option-0", "option-1"]
        assert nodes["option-1"]["action"]["event"] == {
            "name": "Not now",
            "context": {"does": "read"},
        }
        model = data["updateDataModel"]["value"]
        assert model["rows"] == [{"customer": "Ada", "due": 1200}]
        assert model["sources"][0] == {
            "title": "INV/2026/0007",
            "url": "",
            "passage": "1,200.00 EUR due",
        }

    @pytest.mark.parametrize(
        "given, refusal",
        [
            ({}, "Nothing to show"),
            ({"sources": [{"title": "", "url": ""}]}, "neither a title nor a link"),
            ({"sources": [{"title": "x", "url": "file:///etc"}]}, "not a web address"),
            ({"table": {"columns": ["a"], "rows": []}}, "has nothing in it"),
            ({"chart": {"x": "m", "y": "v", "points": [{"m": 1}]}}, "no 'm' or no 'v'"),
            (
                {"choice": {"question": "?", "options": [{"label": "Yes"}]}},
                "two to four",
            ),
        ],
    )
    def test_what_the_catalog_would_not_draw_is_refused_in_a_sentence(
        self, given: dict[str, Any], refusal: str
    ) -> None:
        with pytest.raises(formats.SurfaceRefused, match=refusal):
            formats.surface_of_components("x", **given)

    def test_shown_only_to_a_caller_that_draws_them_and_carried_as_an_artifact(
        self,
    ) -> None:
        assert tool_given(formats.SHOW_COMPONENTS) is False
        assert "does not draw" in formats.show_components("x", choice=None)
        outputs = RunOutputs(accepted=(formats.A2UI_MEDIA_TYPE,))
        assert formats.SHOW_COMPONENTS in outputs_instructions(outputs)
        assert WRITE_NOTEBOOK not in outputs_instructions(outputs)
        token = enter_run_outputs(outputs)
        try:
            assert tool_given(formats.SHOW_COMPONENTS) is True
            assert tool_given(WRITE_NOTEBOOK) is False
            said = formats.show_components(
                "Open invoices",
                table=formats.ShownTable(columns=["n"], rows=[{"n": 1}]),
            )
        finally:
            leave_run_outputs(token)
        assert said.startswith("Shown")
        [artifact] = artifacts_of(outputs)
        [part] = artifact["parts"]
        assert part["media_type"] == formats.A2UI_MEDIA_TYPE
        assert part["data"]["title"] == "Open invoices"

    def test_a_refused_surface_is_the_calls_answer_not_its_failure(self) -> None:
        """H-02/H-25, 2026-10-08: Odoo had no open invoice, Accounting showed an
        empty table, and the refusal (`ModelRetry`) made the transcript say
        *show_components failed*. The call now answers why, for the answer to
        say; nothing is kept; a correct call after it is shown."""
        outputs = RunOutputs(accepted=(formats.A2UI_MEDIA_TYPE,))
        token = enter_run_outputs(outputs)
        try:
            said = formats.show_components(
                "Open invoices",
                table=formats.ShownTable(columns=["invoice", "due"], rows=[]),
            )
            assert said.startswith("Nothing was shown: The table has nothing in it")
            assert "Say in your answer" in said
            assert outputs.surfaces == []
            # A row of values in the columns' order is a row of the table.
            shown = formats.show_components(
                "Open invoices",
                table=formats.ShownTable(
                    columns=["invoice", "due"], rows=[["INV/2026/0007", 1200]]
                ),
            )
            too_long = formats.show_components(
                "Open invoices",
                table=formats.ShownTable(columns=["invoice"], rows=[["a", "b"]]),
            )
        finally:
            leave_run_outputs(token)
        assert shown.startswith("Shown")
        assert "Row 1 of the table has 2 values for 1 columns." in too_long
        [surface] = outputs.surfaces
        model = surface["messages"][2]["updateDataModel"]["value"]
        assert model["rows"] == [{"invoice": "INV/2026/0007", "due": 1200}]
        assert "show nothing, and say so" in outputs_instructions(outputs)

    def test_both_tools_for_an_agent_that_gives_both(self) -> None:
        toolset = outputs_toolset(
            ["text/markdown", NOTEBOOK_MEDIA_TYPE, formats.A2UI_MEDIA_TYPE]
        )
        assert {WRITE_NOTEBOOK, formats.SHOW_COMPONENTS} <= set(toolset.tools)
        assert set(
            outputs_toolset(["text/markdown", formats.A2UI_MEDIA_TYPE]).tools
        ) == {formats.SHOW_COMPONENTS}

    def test_an_approval_pressed_by_a_visitor_is_refused_and_by_a_person_asked(
        self,
    ) -> None:
        from agent_runtimes.loop.apps.visitors import (
            enter_visitor_run,
            leave_visitor_run,
        )

        def pressed(does: str) -> dict[str, Any]:
            return {
                "metadata": {
                    "loop": {"action": {"name": "Post them", "payload": {"does": does}}}
                }
            }

        # Outside a visitor's run the agent is asked, and its rules apply.
        assert formats.refused_action(pressed("write")) == ""
        token = enter_visitor_run("tab-ada")
        try:
            refused = formats.refused_action(pressed("write"))
            assert refused.startswith("Without an account it only reads: `Post them`")
            assert formats.refused_action(pressed("read")) == ""
            assert formats.refused_action({"metadata": {}}) == ""
        finally:
            leave_visitor_run(token)

    def test_showing_is_reading_for_the_applications_rules(self) -> None:
        from agent_runtimes.loop.apps.enforcement import AppRulesCapability
        from agent_runtimes.specs.apps import APP_CATALOGUE

        rules = AppRulesCapability(app=APP_CATALOGUE["accounting"])
        decision = rules.decide(formats.SHOW_COMPONENTS, {}).decision
        assert decision.classes == ("read",) and decision.behaviour == "do_it"
        assert formats.SHOW_COMPONENTS in rules.get_toolset().tools

    def test_the_rehearsal_reads_the_kinds_the_components_show(self) -> None:
        from agent_runtimes.loop.scenes.stage import kind_of_words, shown_kinds

        surface = formats.surface_of_components(
            "x",
            sources=[{"title": "a"}],
            choice={
                "question": "?",
                "options": [{"label": "Send", "does": "send"}, {"label": "No"}],
            },
        )
        nodes = surface["messages"][1]["updateComponents"]["components"]
        assert set(shown_kinds("Shown.", nodes)) >= {
            "words",
            "sources",
            "choice",
            "approval",
        }
        assert kind_of_words("an approval") == "approval"
        assert kind_of_words("sources") == "sources"
