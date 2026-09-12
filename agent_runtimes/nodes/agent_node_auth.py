# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The one identity an Agent Node presents to the control plane.

A node talks to the runtimes service over two connections — the HTTP sync loop
that registers it and sends heartbeats, and the websocket tunnel that carries
its traffic — and the service admits the tunnel only for the user who
registered the node. So the two connections must authenticate as the same
user, which means they must resolve the token in the same order.

They did not. The sync loop preferred ``DATALAYER_API_KEY`` and fell back to
the token the node UI supplies after sign-in; the tunnel preferred the UI
token. A node started with an API key in its environment and then visited in
the browser by someone whose stored session was a different account — or just
stale — registered as one user and dialled the tunnel as another, and was
refused with ``Node ownership required``. Because the service closes such a
websocket before accepting it, the node saw nothing more specific than
``HTTP 403``, and retried it every five seconds for as long as it ran.

Everything that needs the node's credentials reads them from here, in one
order: the environment first, then the UI. The environment is the identity an
operator deliberately gave the node; a browser session is whoever happened to
open the page.
"""

from __future__ import annotations

import os

__all__ = [
    "resolve_auth_token",
    "resolve_runtimes_url",
    "resolve_spacer_url",
    "token_source",
]


def _ui_credentials() -> dict[str, str | None]:
    """The credentials the node UI posted after sign-in, if any.

    Imported lazily: the routes module imports the app, and the app imports
    the node loops that import this.
    """
    try:
        from ..routes.agent_node import get_runtime_credentials

        return get_runtime_credentials()
    except Exception:  # noqa: BLE001 - best effort; absent credentials are a state, not an error
        return {}


def resolve_runtimes_url() -> str:
    """The runtimes service base URL: environment first, then the UI."""
    env_url = (
        (
            os.environ.get("DATALAYER_RUNTIMES_URL")
            or os.environ.get("DATALAYER_AGENT_RUNTIMES_URL")
            or ""
        )
        .strip()
        .rstrip("/")
    )
    if env_url:
        return env_url
    return (_ui_credentials().get("runtimes_url") or "").strip().rstrip("/")


def resolve_spacer_url() -> str:
    """The spacer base URL, where the node provisions its collaboration rooms.

    Falls back to the UI-supplied runtimes URL: in a deployed plane the two
    services share an ingress host.
    """
    env_url = (os.environ.get("DATALAYER_SPACER_URL") or "").strip().rstrip("/")
    if env_url:
        return env_url
    return (_ui_credentials().get("runtimes_url") or "").strip().rstrip("/")


def resolve_auth_token() -> str:
    """The bearer token for every control-plane connection: environment, then UI."""
    env_token = (os.environ.get("DATALAYER_API_KEY") or "").strip()
    if env_token:
        return env_token
    return (_ui_credentials().get("token") or "").strip()


def token_source() -> str:
    """Which of the two the token came from, for a log line that names it.

    A rejected tunnel is far quicker to diagnose when the warning says
    ``token source: ui`` than when it says nothing.
    """
    if (os.environ.get("DATALAYER_API_KEY") or "").strip():
        return "env:DATALAYER_API_KEY"
    if (_ui_credentials().get("token") or "").strip():
        return "ui"
    return "none"
