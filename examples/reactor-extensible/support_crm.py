# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A third-party Reactor extension the application composes (LOOP P-35).

Nothing here knows about LOOP: it is a Reactor extension as any — a plugin
that registers a command (``crm.lookup``), offers it to agents as a tool
(``provide_agent_tools``), declares a point of its own (``crm.sources``) and
extends a point of the application's (``support-desk-plus.greetings``). As
a distribution it would advertise ``extension`` under Reactor's
``datalayer.reactor.extensions`` entry-point group; here it sits beside the
application.
"""

from typing import Any, Dict, List

from reactor import (
    ExtensionManifest,
    PluginManifest,
    ReactorExtension,
    define_contribution_point,
)

#: Where the CRM's records come from: other plugins contribute here.
SOURCES = define_contribution_point("crm.sources")

#: The application's point this plugin extends, by its id.
GREETINGS = define_contribution_point("support-desk-plus.greetings")

CUSTOMERS: Dict[str, Dict[str, Any]] = {
    "ada@example.com": {"name": "Ada Lovelace", "plan": "Team", "seats": 12},
    "alan@example.com": {"name": "Alan Turing", "plan": "Free", "seats": 1},
}


def lookup(argument: Any) -> Dict[str, Any]:
    """A customer by their email: from a tool's arguments, or the words typed."""
    email = argument.get("email") if isinstance(argument, dict) else argument
    email = str(email or "").strip().lower()
    found = CUSTOMERS.get(email)
    return {"email": email, **found} if found else {"email": email, "found": False}


class SupportCrm:
    """The plugin: a command, the tool it offers agents, a greeting."""

    def provide_slash_commands(self, commands: Any) -> None:
        commands.add(
            "crm.lookup",
            "Look a customer up",
            lookup,
            description="A customer's plan and seats, by their email.",
        )

    def provide_agent_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "support-crm.tools",
                "name": "Support CRM",
                "commands": [
                    {
                        "name": "lookup_customer",
                        "command": "crm.lookup",
                        "description": "Find a customer's plan and seats by their email.",
                        "parameters": {
                            "type": "object",
                            "properties": {"email": {"type": "string"}},
                            "required": ["email"],
                        },
                    }
                ],
            }
        ]

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            GREETINGS,
            "The CRM is connected: ask about any customer by their email.",
            contribution_id="support-crm",
        )


def extension() -> ReactorExtension:
    """The extension, as its entry point would advertise it."""
    return ReactorExtension(
        manifest=ExtensionManifest(
            name="support-crm", display_name="Support CRM", emoji="📇"
        ),
        plugins=[
            (
                PluginManifest(
                    name="support-crm",
                    version="1.0.0",
                    display_name="Support CRM",
                    contribution_points=[SOURCES.id],
                ),
                SupportCrm(),
            )
        ],
    )
