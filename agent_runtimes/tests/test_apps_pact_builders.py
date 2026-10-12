# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT in the Loop Python surface (AGENT_PROTOCOLS PI-01, DOC-03).

`app.business_connection` writes the `pact` block the Spec and the Studio's
*Add a business* write, and lists `pact` among the protocols: the
catalogue's *Travel Desk* is rebuilt here from Python, field for field.
"""

from __future__ import annotations

import pytest
from agentspecs.apps import APP_CATALOGUE, parse_app
from pydantic import ValidationError

from agent_runtimes.loop.apps import Application


def _travel_desk() -> Application:
    app = Application("travel-desk-py", "chat", agent="example-blank:0.0.1")
    app.business_connection(
        "example-air",
        "air.example",
        audience="https://provider.example/a2a",
        access="write",
        scopes=["bookings:read", "bookings:change"],
    )
    return app


def test_the_block_is_travel_desks() -> None:
    app = _travel_desk()
    built = parse_app(app.document)
    assert built.pact == APP_CATALOGUE["travel-desk"].pact
    assert built.protocols == ["pact"]


def test_a_second_business_keeps_the_first_and_lists_pact_once() -> None:
    app = _travel_desk()
    app.business_connection("rail", "rail.example", audience="https://provider.example/a2a")
    built = parse_app(app.document)
    assert [connection.brand for connection in built.pact.connections] == ["air.example", "rail.example"]
    assert built.pact.connections[1].access.value == "read"
    assert built.protocols == ["pact"]


@pytest.mark.parametrize(
    "brand, kwargs, says",
    [
        ("https://air.example", {}, "not a business's domain"),
        ("rail.example", {"id": "example-air"}, "same id"),
        ("air.example", {"id": "other"}, "same business twice"),
        ("rail.example", {"access": "delete"}, "access"),
    ],
)
def test_what_is_refused_is_never_kept(brand: str, kwargs: dict, says: str) -> None:
    app = _travel_desk()
    before = app.document
    with pytest.raises(ValidationError, match=says):
        app.business_connection(
            kwargs.pop("id", "second"), brand, audience="https://provider.example/a2a", **kwargs
        )
    assert app.document == before


def test_no_audience_no_connection() -> None:
    app = Application("no-audience", "chat", agent="example-blank:0.0.1")
    with pytest.raises(TypeError):
        app.business_connection("air", "air.example")  # type: ignore[call-arg]
    assert "pact" not in app.document
