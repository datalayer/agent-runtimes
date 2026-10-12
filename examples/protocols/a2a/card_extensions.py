# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A Agent Card extensions, published and negotiated (AGENT_PROTOCOLS EX-03).

Every A2A extension this runtime implements is a contribution point of the A2A
plugin (`a2a.extension.<name>`): what an agent's card publishes is what is
contributed there, and a client activates with an agent only the extensions
of its card it implements — refusing an agent that requires one it does not.

    python examples/protocols/a2a/card_extensions.py
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.a2a import (
    OTHER,
    CardContext,
    card_extensions,
    negotiate_extensions,
)

LOYALTY = "https://example.com/extensions/loyalty/v1"


@dataclass(frozen=True)
class Loyalty:
    """A third party's extension: points for each order, required by its agents."""

    uri: str = LOYALTY
    description: str = "Points for each order."
    required: bool = True

    def params(self, context: CardContext):
        return {"program": f"{context.agent_id}-points"}


class LoyaltyPlugin:
    def provide_contributions(self, contributions) -> None:
        contributions.contribute(OTHER, Loyalty(), contribution_id=LOYALTY, order=50)


def main() -> None:
    platform = build_protocols_reactor()
    card = {
        "name": "Shop",
        "capabilities": {
            "extensions": [
                e.to_json()
                for e in card_extensions(
                    platform,
                    CardContext(
                        agent_id="shop", api_prefix="/api/v1", face={"emoji": "🛍"}
                    ),
                )
            ]
        },
    }
    print("A Datalayer agent's card publishes:")
    print(json.dumps(card["capabilities"], indent=2, ensure_ascii=False))

    loyal = build_protocols_reactor(
        plugins=[(PluginManifest(name="loyalty", version="1.0.0"), LoyaltyPlugin())]
    )
    shop_card = {
        "capabilities": {
            "extensions": [
                e.to_json()
                for e in card_extensions(loyal, CardContext(agent_id="shop"))
            ]
        }
    }
    print("\nWith the loyalty plugin installed, the card adds:", LOYALTY)

    try:
        negotiate_extensions(shop_card, platform)
    except ValueError as refused:
        print("A client without it refuses the agent:", refused)
    print("A client with it activates:", negotiate_extensions(shop_card, loyal))


if __name__ == "__main__":
    main()
