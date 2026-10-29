# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT in the Loop Python surface (PI-01, DOC-03).

`app.business_connection` writes the `pact` block the Spec and the Studio's
*Add a business* write, and lists `pact` among the protocols: the
catalogue's *Travel Desk* is rebuilt here from Python, field for field.
"""

from __future__ import annotations

import pytest
from agentspecs.apps import APP_CATALOGUE, parse_app
from pydantic import ValidationError

from agent_runtimes.apps import Application


def _travel_desk() -> Application:
    app = Application("travel-desk-py", "chat", agent="example-blank:0.0.1")
    app.business_connection(
        "example-air",
        "air.examples.datalayer.run",
        audience="https://air.examples.datalayer.run/a2a",
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
    app.business_connection(
        "rail", "rail.example", audience="https://provider.example/a2a"
    )
    built = parse_app(app.document)
    assert [connection.brand for connection in built.pact.connections] == [
        "air.examples.datalayer.run",
        "rail.example",
    ]
    assert built.pact.connections[1].access.value == "read"
    assert built.protocols == ["pact"]


@pytest.mark.parametrize(
    "brand, kwargs, says",
    [
        ("https://air.example", {}, "not a business's domain"),
        ("rail.example", {"id": "example-air"}, "same id"),
        ("air.examples.datalayer.run", {"id": "other"}, "same business twice"),
        ("rail.example", {"access": "delete"}, "access"),
    ],
)
def test_what_is_refused_is_never_kept(brand: str, kwargs: dict, says: str) -> None:
    app = _travel_desk()
    before = app.document
    with pytest.raises(ValidationError, match=says):
        app.business_connection(
            kwargs.pop("id", "second"),
            brand,
            audience="https://provider.example/a2a",
            **kwargs,
        )
    assert app.document == before


def test_no_audience_no_connection() -> None:
    app = Application("no-audience", "chat", agent="example-blank:0.0.1")
    with pytest.raises(TypeError):
        app.business_connection("air", "air.example")  # type: ignore[call-arg]
    assert "pact" not in app.document


def test_as_business_writes_the_business_and_lists_pact() -> None:
    """PR-13 (decided 2026-10-13): the application as a PACT business."""
    app = Application("air-desk", "chat", agent="example-blank:0.0.1")
    agent = {
        "issuer": "https://agent.example/pact",
        "jwks_uri": "https://agent.example/pact/jwks.json",
    }
    app.as_business(
        registered_agents=[agent],
        scopes={"bookings:read": "See your bookings"},
        brand="Example Air",
    )
    assert app.document["pact"] == {
        "business": {
            "enabled": True,
            "brand": "Example Air",
            "scopes": {"bookings:read": "See your bookings"},
            "registered_agents": [agent],
        }
    }
    built = parse_app(app.document)
    assert built.pact.business.enabled and built.protocols == ["pact"]
    # Nobody registered: refused, nothing kept.
    other = Application("nobody", "chat", agent="example-blank:0.0.1")
    with pytest.raises(ValidationError, match="name at least one"):
        other.as_business(registered_agents=[])
    assert "pact" not in other.document
