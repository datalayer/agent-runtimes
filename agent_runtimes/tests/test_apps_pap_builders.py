# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Personal Agent Protocol in the Loop Python surface, both roles (PAP_DATALAYER S-04).

`app.company_connection`, `app.as_company` and `@app.company_operation` write
the `pap` block the Spec and the Canvas write: the catalogue's *Order Desk*
and *Exchange Desk* are rebuilt here from Python, field for field, and
`loop apps build` writes the same Appspec back.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from agentspecs.apps import APP_CATALOGUE, parse_app
from pydantic import ValidationError

from agent_runtimes.loop.apps import Application
from agent_runtimes.loop.apps.build import build


def _order_desk() -> Application:
    app = Application("order-desk-py", "chat", agent="example-blank:0.0.1")
    app.company_connection(
        "manzanita",
        "manzanita.example",
        access="write",
        acts_as="user",
        scopes=["orders:read", "orders:write"],
        interfaces=["agent"],
        sign_in=["direct", "device"],
        extensions=["operations"],
    )
    return app


def _exchange_desk() -> Application:
    app = Application("exchange-desk-py", "chat", agent="example-blank:0.0.1")
    app.as_company(
        signed_out=True,
        interfaces=["agent", "openapi"],
        scopes=["orders:read", "orders:write"],
        extensions=["operations"],
        personal_agents="any",
    )

    @app.company_operation(
        "orders.exchange", summary="Exchange order {order_id} for size {size}."
    )
    @app.tool(does="write")
    def exchange_order(order_id: str, size: str) -> dict:
        """Exchanges an order for another size, once the person approved it."""
        return {"order_id": order_id, "size": size}

    return app


def test_the_personal_agent_role_is_order_desks_block() -> None:
    document = _order_desk().document
    built = parse_app(document).pap
    assert built == APP_CATALOGUE["order-desk"].pap
    # The block names the profile it is written for, first (PAP_DATALAYER S-03).
    assert list(document["pap"])[0] == "profile" and built.profile == "draft-01"


def test_the_company_role_is_exchange_desks_block() -> None:
    app = _exchange_desk()
    built = parse_app(app.document)
    assert built.pap == APP_CATALOGUE["exchange-desk"].pap
    # The operation's handler is the application's own tool, and nothing else.
    assert [tool.name for tool in app.spec.tools] == ["exchange_order"]
    assert set(app.tools) == {"exchange_order"}


SOURCE = '''
from agent_runtimes.loop.apps import Application

app = Application("both-roles", "chat", agent="example-blank:0.0.1")
app.company_connection(
    "northwind", "northwind.example", access="write", scopes=["invoices:read", "invoices:write"],
    extensions=["operations"],
)
app.as_company(scopes=["books:read", "books:write"], extensions=["operations"])


@app.company_operation("books.close_month", summary="Close {month} for {company}.")
@app.tool(does="write")
def close_month(month: str, company: str) -> dict:
    """Closes a month's books."""
    return {"month": month, "company": company}
'''


def test_loop_apps_build_writes_the_same_appspec_for_both_roles(tmp_path: Path) -> None:
    """An application with both roles (the Ledgerly pattern): its app.py builds an
    Appspec whose YAML reads back to the same spec."""
    (tmp_path / "app.py").write_text(SOURCE)
    built = build(tmp_path / "app.py")
    again = parse_app(yaml.safe_load(built.text))
    assert again == parse_app(built.document)
    [connection] = again.pap.connections
    assert (connection.company, connection.access.value, connection.acts_as.value) == (
        "northwind.example",
        "write",
        "user",
    )
    assert again.pap.company.enabled is True
    [operation] = again.pap.company.operations
    assert (operation.action, operation.tool, operation.user_approval_required) == (
        "books.close_month",
        "close_month",
        True,
    )


@pytest.mark.parametrize(
    "company,why",
    [
        ("https://manzanita.example/", "only the domain"),
        ("manzanita.example:443", "only the domain"),
    ],
)
def test_a_company_is_a_domain_never_an_endpoint(company: str, why: str) -> None:
    app = Application("x", "chat", agent="example-blank:0.0.1")
    with pytest.raises(ValidationError, match=why):
        app.company_connection("orders", company)
    assert "pap" not in app.document


def test_what_the_builders_refuse() -> None:
    app = Application("x", "chat", agent="example-blank:0.0.1")
    with pytest.raises(ValidationError):
        app.company_connection("orders", "shop.example", sign_in=["password"])

    def stray(order_id: str) -> dict:
        """Not a tool."""
        return {}

    with pytest.raises(ValueError, match="as_company"):

        @app.company_operation("orders.cancel", summary="Cancel {order_id}.")
        @app.tool(does="write")
        def cancel_order(order_id: str) -> dict:
            """Cancels an order."""
            return {}

    app.as_company(scopes=["orders:write"], extensions=["operations"])
    with pytest.raises(ValueError, match="@app.tool"):
        app.company_operation("orders.refund", summary="Refund {order_id}.")(stray)
    with pytest.raises(ValidationError, match="names at least one"):
        Application("y", "chat", agent="example-blank:0.0.1").as_company(
            scopes=["orders:read"],
            extensions=[],
            personal_agents="registered",
        )


def test_an_application_says_what_it_speaks_and_where_it_renders() -> None:
    """`protocols` and `ui` from Python (AGENT_PROTOCOLS PS-02, PS-04): the Canvas and the YAML read the same lists."""
    from agent_runtimes.loop.apps.application import Application

    app = Application(
        "speaker",
        "chat",
        agent="example-blank:0.0.1",
        protocols=["mcp", "a2a"],
        ui=["a2ui"],
    )
    assert (app.spec.protocols, app.spec.ui) == (["mcp", "a2a"], ["a2ui"])
    assert app.document["protocols"] == ["mcp", "a2a"] and app.document["ui"] == [
        "a2ui"
    ]


def test_loop_apps_build_marks_what_the_code_decides_of_pap_with_its_line(
    tmp_path: Path,
) -> None:
    """U-06: each company, the company role and each operation built in Python are
    marked as the code's, with the line that decides them — the Studio's cards
    show them read-only, each a link to that line."""
    from agent_runtimes.loop.apps.build import read_code_marks

    (tmp_path / "app.py").write_text(SOURCE)
    built = build(tmp_path / "app.py")
    lines = SOURCE.splitlines()
    marks = {mark.moment: mark for mark in read_code_marks(built.text)}
    assert {moment for moment in marks if moment.startswith("pap ")} == {
        "pap company northwind.example",
        "pap company-role",
        "pap operation books.close_month",
    }
    for moment, handler, says in (
        (
            "pap company northwind.example",
            "company_connection",
            "app.company_connection(",
        ),
        ("pap company-role", "as_company", "app.as_company("),
        ("pap operation books.close_month", "close_month", "@app.company_operation("),
    ):
        mark = marks[moment]
        assert mark.handler == handler
        line = int(mark.where.split(":")[1])
        assert lines[line - 1].startswith(says), (moment, lines[line - 1])
    # Built in a test, too: the builder's caller is the line.
    assert _order_desk().pap_marks[0][:2] == (
        "pap company manzanita.example",
        "company_connection",
    )
