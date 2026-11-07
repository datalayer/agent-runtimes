# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What day it is, told to an agent on every run.

A model has no clock: asked for the current fiscal year, one took its training
year and found no invoice. An agent on a kept runtime lives for days, so this
is read per run, never written into its prompt once.
"""

from __future__ import annotations

from datetime import datetime, timezone


def today_instruction() -> str:
    """Say today's date, for a pydantic-ai agent's instructions.

    Returns
    -------
    str
        One sentence with the date in UTC.
    """
    return f"Today is {datetime.now(timezone.utc):%A %d %B %Y} (UTC)."
