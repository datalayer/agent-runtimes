# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every card `to_agent_card()` writes validates against a real, independent
A2A client — not `fasta2a`, which Datalayer already depends on and already
shapes to its own needs, but `a2a-sdk`, the project's own reference
implementation (ORCHESTRATOR.md, O4-01, section 7.1).

Found on 2026-09-12, evaluating O4-01's own claim ("a catalogued agentspec is
consumable by a third-party A2A client with no Datalayer dependency"): it
was false. `to_agent_card()` wrote only `supportedInterfaces`, a field name
the current specification (a2a-protocol.org) does not have at all — the
current schema requires `url` at the top level, with `preferredTransport`
and `additionalInterfaces` for the rest. Every card the mapping produced
was missing a required field, confirmed by handing it to `a2a.types.AgentCard`
and reading what came back:

    1 validation error for AgentCard
    url
      Field required

Fixed by writing `url`/`preferredTransport`/`additionalInterfaces` beside
`supportedInterfaces`, which is kept because Datalayer's own `from_agent_card`
still prefers it (`core`'s own round-trip suite proves that side). This file
proves the other side: that the fix actually satisfies an implementation
Datalayer did not write.

`core` does not depend on `a2a-sdk` and should not start to — the dependency
belongs here, where `a2a-sdk[all]` is already the `a2a` extra's own package.
"""

from __future__ import annotations

import pytest
from a2a.types import AgentCard
from datalayer_core.orchestration import (
    AgentProtocol,
    ProtocolEndpoint,
    from_agentspec,
    to_agent_card,
)

from agent_runtimes.specs.agents import list_agentspecs

#: One endpoint per agentspec, standing in for what `resolve_worker` would
#: fill in once a worker actually answers. The claim under test is the
#: card's *shape*, not a live network fetch — O4-01's is a schema question.
_ENDPOINT = ProtocolEndpoint(
    protocol=AgentProtocol.A2A,
    url="https://example.datalayer.run/a2a/agent",
    transport="JSONRPC",
    protocol_version="1.0",
)


def _delegable_specs():
    """
    Every catalogued agentspec that declares work an orchestrator may hand it.

    An example agent deliberately declares none (O2-07) and is not a claim
    this item makes anything about.

    Returns
    -------
    list
        The specs.
    """
    return [spec for spec in list_agentspecs() if spec.delegable]


@pytest.mark.parametrize(
    "spec_id", [spec.id for spec in _delegable_specs()], ids=lambda s: s
)
def test_every_worker_specs_card_validates(spec_id: str) -> None:
    specs = {spec.id: spec for spec in _delegable_specs()}
    mapping = from_agentspec(specs[spec_id].model_dump(by_alias=False))
    descriptor = mapping.descriptor.model_copy(update={"endpoints": [_ENDPOINT]})
    card = to_agent_card(descriptor)

    # Raises on its own if the card is not standards-compliant; nothing here
    # is a Datalayer type or a Datalayer assertion about the shape.
    validated = AgentCard.model_validate(card.card)

    assert validated.name == descriptor.name
    assert validated.url == _ENDPOINT.url
    assert validated.preferred_transport == _ENDPOINT.transport


def test_a_card_with_more_than_one_endpoint_names_the_rest_as_additional() -> None:
    from agent_runtimes.specs.agents import get_agent_spec

    spec = get_agent_spec("worker-extract-data-from-files")
    assert spec is not None
    mapping = from_agentspec(spec.model_dump(by_alias=False))
    second = _ENDPOINT.model_copy(
        update={"url": "https://example.datalayer.run/a2a/agent-2", "transport": "GRPC"}
    )
    descriptor = mapping.descriptor.model_copy(update={"endpoints": [_ENDPOINT, second]})
    card = to_agent_card(descriptor)

    validated = AgentCard.model_validate(card.card)

    # The first is preferred; the second is additional. Neither is dropped.
    assert validated.url == _ENDPOINT.url
    assert [i.url for i in (validated.additional_interfaces or [])] == [second.url]
