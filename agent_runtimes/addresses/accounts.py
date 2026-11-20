# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Whose account a person signs in to at a company's agent host: their Datalayer account.

``pap.company.accounts``: no password is ever typed into an agent (no Mediated
Sign-In); the person approves a personal agent's sign-in on Datalayer, which
names their account (``PapCompanyCapability.approve_device``).

For a deployment, it also says the SDK whose sign-ins are over
(``AccountSignOuts.signed_out_before``): those of an account its deployment no
longer admits — somebody its owner removed from "People I invite", anybody but
them once a public one turned private. The SDK asks it on every signed-in
request, then refuses and revokes that sign-in's tokens (a personal agent's,
another MCP client's), and its Sessions go on signed out.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


class DatalayerAccounts:
    """Datalayer accounts, signed in to through Datalayer alone."""

    def __init__(self, access: Any = None) -> None:
        """``access``: the access check of the company's addresses (an
        ``AddressAccess``), whose deployment says who may still be signed in."""
        self.access = access

    async def authenticate(
        self, credentials: dict[str, Any], context: Any = None
    ) -> None:
        """Never with credentials typed into an agent."""
        return None

    async def check_code(self, code_reference: str, code: Any) -> bool:
        """No code sent to the person by the company."""
        return False

    async def signed_out_before(self, account_id: str) -> Optional[datetime]:
        """A moment after every sign-in, when the deployment's record last read admits
        ``account_id`` no more: every sign-in of theirs ends, whatever clock it was
        stamped with. ``None`` while it admits them, and always for an
        agent served without a deployment (its configuration's policy is fixed).

        The last record *read* decides, not the owner-only policy a private deployment
        falls back to when ai-agents does not answer: an outage refuses the people
        allowed at its addresses for a while, it never ends their sign-ins.
        """
        access = self.access
        if access is None or getattr(access, "source", None) is None:
            return None
        await access.refresh()
        if access.last_read.admits(str(account_id)):
            return None
        return datetime.max.replace(tzinfo=timezone.utc)


__all__ = ["DatalayerAccounts"]
