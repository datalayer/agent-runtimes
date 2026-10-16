# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT 1.0, Personal Agent Consent & Trust (PR-10 to PR-13).

Implements ``openpactprotocol/openpactprotocol`` ``docs/spec.md`` at 838c6bd
(2026-10-06), reviewed 2026-10-12 (``protocol/README.md``): the *Identity*
profile (§2–4) and the *Delegated* profile, on A2A 1.0 HTTP+JSON.

- :mod:`.card` reads a Brand's Agent Card: interface, JWT scheme, delegation,
  scopes and their action classes (PR-11);
- :mod:`.tokens` signs the personal-agent JWT with the host's key, and holds
  the Provider's checks (PR-12, PR-13);
- :mod:`.client` is the personal agent (PR-12, PR-13);
- :mod:`.provider` is a local Provider for tests and examples;
- :mod:`.plugin` is PACT as a Reactor plugin.
"""

from .card import PactCard, PactCardError, PactDelegation, PactScope, read_card
from .client import (
    PACT_VERSION,
    InMemoryDelegationStore,
    InMemoryReceiptStore,
    PactError,
    PactPersonalAgent,
    Reply,
    SignIn,
    StepUp,
)
from .tokens import (
    sign_personal_agent_jwt,
    verify_delegation_token,
    verify_personal_agent_jwt,
    verify_receipt,
)

__all__ = [
    "InMemoryDelegationStore",
    "InMemoryReceiptStore",
    "PACT_VERSION",
    "PactCard",
    "PactCardError",
    "PactDelegation",
    "PactError",
    "PactPersonalAgent",
    "PactScope",
    "Reply",
    "SignIn",
    "StepUp",
    "read_card",
    "sign_personal_agent_jwt",
    "verify_delegation_token",
    "verify_personal_agent_jwt",
    "verify_receipt",
]
