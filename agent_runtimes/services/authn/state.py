# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Authentication state management for Agent Runtimes."""

from __future__ import annotations

from typing import Optional

SERVER_PORT: Optional[int] = None

USER_HANDLE: Optional[str] = None

USER_TOKEN: Optional[str] = None


def set_server_port(server_port: int) -> None:
    """
    Set the global server port.

    Parameters
    ----------
    server_port : int
        Port number to set for the server.
    """
    global SERVER_PORT
    SERVER_PORT = server_port


def get_server_port() -> Optional[int]:
    """
    Get the current server port.

    Returns
    -------
    Optional[int]
        The current server port number, or None if not set.
    """
    global SERVER_PORT
    return SERVER_PORT
