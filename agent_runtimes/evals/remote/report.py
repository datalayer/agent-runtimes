# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Backward-compatible shim for report helpers.

The report engine moved to ``agent_runtimes.evals.report`` because it is shared
across evals integrations and is not remote-specific.
"""

from agent_runtimes.evals.report import *  # noqa: F401,F403
