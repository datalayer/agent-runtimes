# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an environment costs, remembered between commands for an hour.

`AgentClient.create_runtime` prices a launch from the environments listing:
the credits it reserves are the environment's burning rate times the minutes
asked for. Every `datalayer sandboxes create` listed every environment for
that one number before asking for its runtime: a second request, 0.7 to 1 s
on r1, on every create.

The listing's prices are kept here, per Runtimes address, and a create naming
an environment priced in the last hour asks for its runtime at once. Whether
the environment can still be launched is the platform's answer to that
request: a refused launch forgets the price, and the next create lists again.
Only names and prices are kept — no token, nothing about the caller.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable, Optional

#: How long a listed price is used without listing again.
PRICES_TTL_SECONDS = 3600.0


def prices_path() -> Path:
    """The file the prices are kept in, under the user's cache directory."""
    root = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(root) / "datalayer" / "environment-prices.json"


def _read() -> dict[str, Any]:
    try:
        data = json.loads(prices_path().read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(data: dict[str, Any]) -> None:
    """Replace the file whole, so a reader never sees half of it."""
    path = prices_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", dir=path.parent, prefix=".environment-prices.", delete=False
        ) as handle:
            json.dump(data, handle)
        os.replace(handle.name, path)
    except OSError:
        # The prices are a shortcut: without them a create lists, as it
        # always did.
        return


def remember(runtimes_url: str, environments: Iterable[Any]) -> None:
    """Keep the prices of a whole listing, as of now."""
    prices = {
        str(env.name): {
            "burning_rate": float(env.burning_rate or 0.0),
            "size_class": env.size_class or None,
        }
        for env in environments
        if getattr(env, "name", None)
    }
    data = _read()
    data[runtimes_url] = {"at": time.time(), "environments": prices}
    _write(data)


def recall(
    runtimes_url: str, environment: str
) -> Optional[tuple[float, Optional[str]]]:
    """The burning rate and size class listed for that environment within the hour, or `None`."""
    entry = _read().get(runtimes_url)
    if not isinstance(entry, dict):
        return None
    at = entry.get("at")
    if (
        not isinstance(at, (int, float))
        or not 0 <= time.time() - at < PRICES_TTL_SECONDS
    ):
        return None
    price = (entry.get("environments") or {}).get(environment)
    if not isinstance(price, dict):
        return None
    rate = price.get("burning_rate")
    if isinstance(rate, bool) or not isinstance(rate, (int, float)):
        return None
    return float(rate), price.get("size_class") or None


def forget(runtimes_url: str) -> None:
    """Drop every price of that address: a launch was refused, so list again."""
    data = _read()
    if data.pop(runtimes_url, None) is not None:
        _write(data)
