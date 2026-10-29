# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What agent protocols this runtime speaks (PR-50).

``GET {prefix}/protocols``: each protocol plugin's description, as it
contributed it to ``protocols.description`` — its id, name, layer, the
version it implements, its roles, its state, its specification and its
contribution points. Studio and ``loop apps protocols`` read it; nothing is
listed that no plugin contributed.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter

from ..protocols import list_protocols, protocols_platform

router = APIRouter(prefix="/protocols", tags=["protocols"])


def protocols_payload() -> dict[str, Any]:
    """The runtime's protocols, as the route answers them."""
    return {
        "protocols": [
            asdict(protocol) for protocol in list_protocols(protocols_platform())
        ]
    }


@router.get("")
async def get_protocols() -> dict[str, Any]:
    """The agent protocols this runtime speaks."""
    return protocols_payload()
