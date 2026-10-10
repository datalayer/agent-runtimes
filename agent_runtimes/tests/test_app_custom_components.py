# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Components a developer writes (LOOP P-17): declared in the application's
spec, of that application only, reviewed as the catalog's own, placed on its
surface, shown by its code and drawing a widget's page's output.
"""

from typing import Any, Dict

import pytest

from agent_runtimes.loop.apps import AppHost, Application, MemoryChannel, Shown
from agent_runtimes.loop.apps.components import answer_components, component_node
from agent_runtimes.loop.apps.loading import AppNotRunnable, load_app
from agent_runtimes.loop.apps.record import AppRecorder

pytest.importorskip("agentspecs.apps")

GAUGE: Dict[str, Any] = {
    "description": "A dial, from nothing to its most.",
    "source": "https://elements.example.com/gauge.js",
    "props": {
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "most": {"type": "number", "default": 100},
        },
        "required": ["label"],
    },
    "shows": ["value"],
    "sends": ["chosen"],
}


async def _nothing(_body: Any = None) -> None:
    return None


def gauge_app(kind: str = "chat") -> Application:
    app = Application(id="load-desk", kind=kind, agent="example-simple")
    app.custom_component("Gauge", **GAUGE)
    return app


async def opened(application: Application, channel: Any) -> Any:
    host = AppHost(
        application,
        channel,
        recorder=AppRecorder(app=application.spec, send=_nothing),
    )
    return await host.open()


def test_a_component_is_declared_in_its_spec_and_reviewed() -> None:
    app = gauge_app()
    own = app.spec.interface.custom_components
    assert [component.name for component in own] == ["Gauge"]
    assert own[0].source == GAUGE["source"] and own[0].height == 240
    assert app.document["interface"]["custom_components"][0]["shows"] == ["value"]
    # Refused in agentspecs' sentences, before anything runs.
    # A file of its folder is named by its path in it (LOOP P-29).
    with pytest.raises(ValueError, match="is a file of the application's folder"):
        app.custom_component("Dial", **{**GAUGE, "source": "../dial.js"})
    assert (
        app.custom_component("Dial", **{**GAUGE, "source": "./dial.js"})["source"]
        == "./dial.js"
    )
    with pytest.raises(
        ValueError, match="the component Table is a component of the catalog"
    ):
        app.custom_component("Table", **GAUGE)
    with pytest.raises(ValueError, match="already has a component 'Gauge'"):
        app.custom_component("Gauge", **GAUGE)
    with pytest.raises(ValueError, match="is loaded over `https://`"):
        app.custom_component(
            "Dial", **{**GAUGE, "source": "http://elements.example.com/d.js"}
        )


def test_it_is_placed_on_its_surface_checked_against_its_schema() -> None:
    app = gauge_app()
    node = app.component("load", "Gauge", label="Load", value={"path": "/load"})
    assert node == {
        "id": "load",
        "component": "Gauge",
        "label": "Load",
        "value": {"path": "/load"},
    }
    with pytest.raises(ValueError, match="'label' is a required property"):
        app.component("bare", "Gauge", value=3)
    with pytest.raises(ValueError, match="which has no property colour"):
        app.component("red", "Gauge", label="x", colour="red")
    with pytest.raises(ValueError, match="most: 'a lot' is not of type 'number'"):
        app.component("loud", "Gauge", label="x", most="a lot")


def test_it_is_of_its_application_only() -> None:
    # The catalog does not open: another application, or no application, has no Gauge.
    with pytest.raises(ValueError, match="The catalog has no component 'Gauge'"):
        component_node("load", "Gauge", label="Load")
    with pytest.raises(ValueError, match="The catalog has no component 'Gauge'"):
        Application(id="other", kind="chat", agent="example-simple").component(
            "load", "Gauge", label="Load"
        )
    with pytest.raises(AppNotRunnable, match="There is no component named 'Gauge'"):
        load_app(
            {
                "id": "other",
                "name": "Other",
                "kind": "chat",
                "agent": "example-simple",
                "interface": {"components": ["Gauge"]},
            }
        )
    own = gauge_app().spec.interface.custom_components
    assert answer_components([{"id": "load", "component": "Gauge", "label": "x"}], own)


async def test_its_code_shows_it_inline_in_a_panel_or_on_a_page() -> None:
    channel = MemoryChannel()
    session = await opened(gauge_app(), channel)
    gauge = session.component("load", "Gauge", label="Load", value={"path": "/load"})
    panel = await session.show(gauge, where="panel", title="Load", data={"load": 42})
    assert channel.shown == [
        Shown(panel.id, session.id, "panel", "Load", (gauge,), {"load": 42})
    ]
    inline = await session.show(
        {"id": "now", "component": "Gauge", "label": "Now", "value": 7}
    )
    assert inline.components[0]["component"] == "Gauge"
    message = await session.send("Here.", show=[gauge], data={"load": 1})
    assert message.components == (gauge,)
    with pytest.raises(ValueError, match="'label' is a required property"):
        await session.show({"id": "bare", "component": "Gauge"}, where="page")
    with pytest.raises(ValueError, match="The catalog has no component 'Dial'"):
        session.component("x", "Dial")


async def test_a_widgets_page_shows_an_output_with_it() -> None:
    app = gauge_app("widget")
    app.output("load", "Gauge", title="Load", label="Load")

    @app.page
    def load(seats: int = 10) -> Dict[str, Any]:
        return {"load": {"used": seats, "of": 100}}

    page = app.spec.interface.page
    assert page is not None
    output = page.outputs[0]
    assert (output.component, output.props) == ("Gauge", {"label": "Load"})
    host = AppHost(
        app, MemoryChannel(), recorder=AppRecorder(app=app.spec, send=_nothing)
    )
    session = await host.open()
    assert await host.page(session, {"seats": 30}) == {"load": {"used": 30, "of": 100}}
    with pytest.raises(ValueError, match="'label' is a required property"):
        app.output("bare", "Gauge")
    with pytest.raises(ValueError, match="a component of its own"):
        app.output("dial", "Dial")
    blind = Application(id="blind", kind="widget", agent="example-simple")
    blind.custom_component("Badge", **{**GAUGE, "shows": [], "sends": []})
    with pytest.raises(ValueError, match="which shows nothing"):
        blind.output("badge", "Badge", label="x")
