# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Configuration module for agent-runtimes.

Provides frontend configuration services that can be used by both
Jupyter and FastAPI servers.
"""

from .frontend_config import get_frontend_config

__all__ = [
    "get_frontend_config",
]
