# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Collect health snapshots for the local Agent Node."""

from __future__ import annotations

import os
import platform
import socket
import sys
import time
from typing import Any

from .routes.agent_node import get_agent_node_configuration

try:  # psutil is optional; degrade gracefully when missing.
    import psutil  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001
    psutil = None  # type: ignore[assignment]


_BOOT_TIME = time.time()


def collect_health(reason: str = "periodic") -> dict[str, Any]:
    """Return a health snapshot for the current process and host."""
    configuration = get_agent_node_configuration()
    health: dict[str, Any] = {
        "mode": configuration.mode,
        "hostname": socket.gethostname(),
        "platform": platform.system(),
        "platform_release": platform.release(),
        "python_version": sys.version.split()[0],
        "agent_runtimes_version": os.environ.get("AGENT_RUNTIMES_VERSION", "dev"),
        "cpu_count": os.cpu_count(),
        "uptime_seconds": round(time.time() - _BOOT_TIME, 3),
        "reason": reason,
    }
    try:
        health["load_average"] = list(os.getloadavg())
    except (OSError, AttributeError):
        pass

    if psutil is not None:
        try:
            health["cpu_percent"] = psutil.cpu_percent(interval=None)
            vmem = psutil.virtual_memory()
            health["memory_total_mb"] = int(vmem.total / (1024 * 1024))
            health["memory_available_mb"] = int(vmem.available / (1024 * 1024))
        except Exception:  # noqa: BLE001
            pass

    return health
