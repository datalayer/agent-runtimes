# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the CLI signs its calls to its local runtime with.

The runtime's loopback is no proof of anybody (agent-runtimes 1.8.9): a
runtime the CLI starts on this machine takes the token the CLI draws for it
before it starts (``AGENT_RUNTIMES_TOKEN``, inherited by the server's
process), and the CLI sends it on every call to that runtime.
"""

from __future__ import annotations

import os
import secrets
from typing import Dict

#: Where the local runtime's token is said (`apps.callers.RUNTIME_TOKEN_ENV`).
RUNTIME_TOKEN_ENV = "AGENT_RUNTIMES_TOKEN"


def ensure_runtime_token() -> str:
    """The token of the runtime the CLI starts: the one said, else one drawn now.

    Set in this process's environment before the server's process starts, so
    that the server takes it as its own and the CLI's calls carry it.
    """
    said = (os.environ.get(RUNTIME_TOKEN_ENV) or "").strip()
    if not said:
        said = secrets.token_urlsafe(32)
        os.environ[RUNTIME_TOKEN_ENV] = said
    return said


def runtime_headers() -> Dict[str, str]:
    """The headers of a call to the local runtime; none when no token is held."""
    token = (os.environ.get(RUNTIME_TOKEN_ENV) or "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}
