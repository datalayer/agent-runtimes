# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Whose account a person signs in to at a company's agent host: their Datalayer account.

``pap.company.accounts``: no password is ever typed into an agent (no Mediated
Sign-In); the person approves a personal agent's sign-in on Datalayer, which
names their account (``PapCompanyCapability.approve_device``).
"""

from __future__ import annotations

from typing import Any


class DatalayerAccounts:
    """Datalayer accounts, signed in to through Datalayer alone."""

    async def authenticate(
        self, credentials: dict[str, Any], context: Any = None
    ) -> None:
        """Never with credentials typed into an agent."""
        return None

    async def check_code(self, code_reference: str, code: Any) -> bool:
        """No code sent to the person by the company."""
        return False


__all__ = ["DatalayerAccounts"]
