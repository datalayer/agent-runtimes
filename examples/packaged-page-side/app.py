# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application whose page side is a file of its folder (LOOP P-29).

Its dial is ``components/dial.js``, beside this file. ``loop apps package
app.py`` puts it in the application's wheel; installed beside the server that
runs the application, the page draws the dial from that server::

    loop apps package app.py
    pip install dist/loop_app_dial_desk-0.0.1-py3-none-any.whl
    loop apps run app.py --web
"""

from agent_runtimes.loop.apps import Application

app = Application(
    id="dial-desk",
    name="Dial desk",
    description="A desk with a dial of its own, drawn from its package.",
    kind="widget",
    agent="example-simple",
)

app.custom_component(
    "Dial",
    description="A dial, from nothing to its most.",
    source="components/dial.js",
    props={
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "most": {"type": "number", "default": 100},
        },
        "required": ["label"],
    },
    shows=["value"],
    height=120,
)

# A page of its own: a widget's page whose output the Dial draws.
app.output("load", "Dial", title="Load", label="Load", most=100)


@app.page
def load(seats: int = 42) -> int:
    """How loaded the desk is: its seats taken."""
    return seats
