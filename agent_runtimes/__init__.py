# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent Runtimes."""

from typing import Any, Dict, List

from agent_runtimes.__version__ import __version__
from agent_runtimes.base.serverapplication import AgentRuntimesExtensionApp


def _jupyter_server_extension_points() -> List[Dict[str, Any]]:
    """
    Get Jupyter server extension points for Datalayer.

    Returns
    -------
    List[Dict[str, Any]]
        List of extension point configurations for Jupyter server.
    """
    return [
        {
            "module": "agent_runtimes",
            "app": AgentRuntimesExtensionApp,
        }
    ]


__all__ = [
    "__version__",
]
