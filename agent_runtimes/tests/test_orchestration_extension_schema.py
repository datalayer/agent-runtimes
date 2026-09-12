# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The published schema says what the code actually sends (O3-01).

`EXTENSION_URI` is advertised on agent cards, so a third party builds against
this schema. The way that goes wrong is quiet: a field is added to the
envelope and the schema does not learn about it, or a field is renamed and the
schema keeps the old name — either way the document stays valid JSON and stops
being true.

So the schema is not compared to a fixture. It is compared to a **real
delegation**, built by the same `delegation_meta` the adapters call, and to
what a worker actually answers with.
"""

from __future__ import annotations

import pytest
from datalayer_core.orchestration import Usage

from agent_runtimes.context.delegation import (
    EXTENSION_URI,
    paused_meta,
    spent_meta,
)
from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY
from agent_runtimes.orchestration.budget import delegation_meta
from agent_runtimes.orchestration.extension_schema import extension_schema
from agent_runtimes.tests.orchestration_records import an_execution


@pytest.fixture(name="schema")
def _schema() -> dict:
    """
    The published schema.

    Returns
    -------
    dict
        The document.
    """
    return extension_schema()


def _envelope(schema: dict) -> dict:
    """
    The properties of the `datalayer` object the schema describes.

    Parameters
    ----------
    schema : dict
        The document.

    Returns
    -------
    dict
        Its properties, keyed by field name.
    """
    return schema["properties"][DELEGATION_META_KEY]["properties"]


def test_the_schema_is_published_at_the_uri_that_agent_cards_advertise(schema):
    """An identifier that resolved somewhere else would be a second extension."""
    assert schema["$id"].startswith(EXTENSION_URI)
    assert schema["x-datalayer-extension"]["uri"] == EXTENSION_URI


def test_every_field_a_real_delegation_carries_is_described(schema):
    """Built by the function the adapters call, not by a fixture.

    A delegation with everything on it: an execution, a budget, a credential
    and a checkpoint to resume from.
    """
    execution = an_execution()
    meta = delegation_meta(
        execution,
        credential="tok_secret",
        extended=True,
        resumed_from="ckpt_1",
        account_uid="acc_1",
    )
    assert meta is not None

    described = _envelope(schema)
    for field in meta[DELEGATION_META_KEY]:
        assert field in described, (
            f"A delegation carries {field!r} and the published schema does "
            "not describe it; an implementer reading the schema would drop it."
        )


def test_every_field_a_worker_answers_with_is_described(schema):
    """The other direction, built the same way."""
    described = _envelope(schema)
    answers = [
        spent_meta(Usage(input_tokens=10, output_tokens=5, cost=0.01)),
        paused_meta("ckpt_1"),
    ]
    for answer in answers:
        assert answer is not None
        for field in answer[DELEGATION_META_KEY]:
            assert field in described, (
                f"A worker answers with {field!r} and the schema does not "
                "describe it."
            )


def test_the_execution_reference_carries_what_a_child_needs(schema):
    """`executionId` alone says nothing about the tree.

    The whole reason this field exists is that neither protocol can express
    parentage, so a schema that made the tree optional would have described
    the gap rather than closed it.
    """
    execution = _envelope(schema)["execution"]
    assert set(execution["required"]) == {"executionId", "rootExecutionId", "depth"}
    assert "parentExecutionId" in execution["properties"]


def test_the_credential_is_described_as_a_bearer_token_to_be_removed(schema):
    """An implementer that stored it would leak it into task state."""
    credential = _envelope(schema)["credential"]
    assert "withheld" in credential["description"]


def test_the_schema_promises_nothing_that_is_not_sent(schema):
    """The five proposed fields are listed as absent, not described.

    A schema describing them would tell an implementer to expect fields
    nothing sends, which is worse than not mentioning them.
    """
    described = _envelope(schema)
    proposed = schema["x-datalayer-extension"]["specifiedNotYetOnTheWire"]
    assert proposed, "The proposed fields are part of the contract's honesty."
    for field in proposed:
        assert field not in described


def test_the_envelope_is_closed_so_an_unknown_field_is_noticed(schema):
    """A new field has to be added here deliberately, which is the point."""
    assert schema["properties"][DELEGATION_META_KEY]["additionalProperties"] is False


def test_a_message_carrying_the_envelope_is_still_a_message(schema):
    """The extension adds a key; it does not own the message it rides in."""
    assert schema["additionalProperties"] is True


def test_every_catalogued_capability_is_in_the_closed_vocabulary():
    """No spec slipped a capability past the generator (O2-07).

    The vocabulary is validated on the model, so a spec built in Python
    cannot name an unknown capability. The catalogue is generated from YAML,
    and this is the proof that the generated file agrees — free text does not
    match, and two specs saying "analysis" and "analyse" describe the same
    work and find each other never.

    It lives here rather than in `core`'s descriptor suite because that suite
    reads the catalogue as YAML data on purpose: `core` does not depend on
    `agent-runtimes` and must not, since the dependency runs the other way.
    """
    from agent_runtimes.specs.agents import list_agentspecs
    from agent_runtimes.types import AGENT_CAPABILITIES

    specs = list_agentspecs()
    declared = {
        capability.id for spec in specs for capability in spec.delegable
    }
    assert declared, "no spec declares delegable work, so discovery matches nothing"
    assert declared <= set(AGENT_CAPABILITIES), sorted(declared - set(AGENT_CAPABILITIES))

    # A demonstration discovered as something to hand work to is worse than
    # one that cannot be discovered at all.
    examples = [s for s in specs if s.id.startswith("example-") and s.delegable]
    assert not examples, [s.id for s in examples]
