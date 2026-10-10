# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that extends with Reactor's vocabulary (LOOP P-35).

It is a Reactor plugin, ``loop-app-support-desk-plus``, and its author
extends it as any Reactor plugin is extended:

- it **declares a point** of its own, ``support-desk-plus.greetings``, that
  another plugin extends — and reads it when a conversation starts;
- it **uses** a third-party Reactor extension, ``support-crm``: registered
  with it, activated first, its agent tool ``lookup_customer`` given to its
  agent as its rules decide (it reads);
- it **contributes** to the CRM's point, ``crm.sources``;
- it registers a **Reactor command**, ``support-desk-plus.hours``, and offers
  it, and the CRM's ``crm.lookup``, in its composer as ``/hours`` and
  ``/lookup``;
- it serves a **route**, ``/health``, mounted by the host that serves it.

Run it::

    loop apps run app.py              # in the terminal: /hours, /lookup ada@example.com
    loop apps run app.py --web        # and GET http://127.0.0.1:<port>/app/health
"""

import sys
from pathlib import Path

from agent_runtimes.loop.apps import Application, Session

# The CRM sits beside this file, as if it were installed.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from support_crm import SOURCES, extension  # noqa: E402

app = Application(
    id="support-desk-plus",
    name="Support desk, extended",
    description="A support desk that composes a CRM plugin, with Reactor.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "You are the support desk of Example Inc. When a customer gives their "
        "email, look them up with lookup_customer before answering about their "
        "account. Answer in two sentences at most."
    ),
)

#: What greets a person: other plugins extend it.
GREETINGS = app.contribution_point("support-desk-plus.greetings")

app.uses(extension(), tools={"lookup_customer": "read"})
app.contribute(SOURCES, {"name": "support-desk-plus", "kind": "tickets"}, id="tickets")
app.contribute(GREETINGS, "Welcome to the support desk.", id="welcome", order=-1)


@app.reactor_command("support-desk-plus.hours", "Opening hours")
def hours(argument: object = None) -> str:
    """When the desk is open."""
    return "We are open Monday to Friday, 9:00 to 17:00 CET."


app.command("hours", "When the desk is open", run="support-desk-plus.hours")
app.command("lookup", "Look a customer up by their email", run="crm.lookup")


@app.route("/health")
def health() -> dict:
    """Whether the desk answers, and what its CRM holds."""
    return {"ok": True, "app": app.id}


@app.start
async def greet(session: Session) -> None:
    """Every greeting the plugins contributed, in their order."""
    said = [str(c.value) for c in session.contributions(GREETINGS)]
    await session.send(" ".join(said))
