# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every model a spec names is one that can be built (ORCHESTRATOR.md, O2-09, O2-13).

Found on prod1 on 2026-09-12 by delegating to a team. The root failed:

    the agentspec 'team:analyze-support-tickets/supervisor' could not be
    served on its worker's runtime: Agent bootstrap failed (500):
    Unknown model: openai-gpt-4-1. Did you mean 'openai:gpt-4.1'?

Forty-three of the forty-seven model references across the team catalogue
were written without the provider separator — `openai-gpt-4-1` rather than
`openai:gpt-4.1` — so **no team naming one could be run at all**. The
agentspec catalogue had none of it, which is why nothing else had noticed:
teams are the only specs whose models were never exercised.

Nothing catches this before a runtime is launched, and by then a sandbox has
been bought and a person is watching a failure. A model id is a string in
YAML until something tries to build an agent from it, so the catalogue is
the only place to check it cheaply.
"""

from __future__ import annotations

import pytest

from agent_runtimes.specs.agents import list_agentspecs
from agent_runtimes.specs.models import list_models
from agent_runtimes.specs.teams import list_team_specs


@pytest.fixture(name="catalogued", scope="module")
def _catalogued() -> set[str]:
    """
    Every model id the catalogue offers.

    Returns
    -------
    set[str]
        The ids, which are what a spec must name.
    """
    identifiers = {model.id for model in list_models()}
    assert identifiers, "The model catalogue is empty, so this proves nothing."
    return identifiers


def test_every_agentspec_names_a_catalogued_model(catalogued):
    named = {
        (spec.id, spec.model) for spec in list_agentspecs() if spec.model
    }
    unknown = sorted((spec, model) for spec, model in named if model not in catalogued)
    assert not unknown, unknown


def test_every_team_member_names_a_catalogued_model(catalogued):
    # A member's model is what its seat's worker is registered with, so an
    # unknown one fails the member and the team with it.
    unknown = []
    for team in list_team_specs():
        for member in team.agents:
            if member.model and member.model not in catalogued:
                unknown.append((team.id, member.id, member.model))
    assert not unknown, unknown


def test_every_team_supervisor_names_a_catalogued_model(catalogued):
    # The supervisor is the team's root execution: its model failing is the
    # whole team failing before a single member is placed, which is exactly
    # how this was found.
    unknown = []
    for team in list_team_specs():
        model = getattr(team.supervisor, "model", "") if team.supervisor else ""
        if model and model not in catalogued:
            unknown.append((team.id, model))
    assert not unknown, unknown


def test_a_model_id_carries_its_provider(catalogued):
    # The separator is the thing that was missing, and it is what tells
    # `openai:gpt-4.1` from a name somebody typed. Asserted on the catalogue
    # rather than on the specs so that a catalogue entry cannot be added in
    # the broken shape either.
    without = sorted(model for model in catalogued if ":" not in model)
    assert not without, without
