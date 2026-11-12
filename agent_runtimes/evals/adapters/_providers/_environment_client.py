# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The client of a task's environment, inside the adapter's sandbox.

Standard library only: it runs under whichever framework's interpreter. It holds
no address but the sandbox's loopback and no credential: what it reaches is the
one environment the relay on the runtime was given for this execution.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

__all__ = ["EnvironmentError_", "available", "exec_command", "read_file", "write_file"]

URL_VARIABLE = "DATALAYER_ENVIRONMENT_URL"


class EnvironmentError_(RuntimeError):
    """The task's environment did not answer."""


def available() -> bool:
    """Whether this execution has a task environment."""
    return bool(os.environ.get(URL_VARIABLE))


def _post(
    operation: str, body: dict[str, Any], *, timeout: float | None
) -> dict[str, Any]:
    """One operation on the environment; its answer."""
    request = urllib.request.Request(
        f"{os.environ[URL_VARIABLE]}/{operation}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as answer:  # nosec B310 - the sandbox's own loopback
            return json.loads(answer.read())
    except urllib.error.HTTPError as error:
        said = json.loads(error.read() or b"{}").get("error") or {}
        message = str(said.get("message") or error)
        if error.code == 404:
            raise FileNotFoundError(message) from None
        if error.code == 403:
            raise PermissionError(message) from None
        raise EnvironmentError_(message) from None


def exec_command(
    argv: list[str],
    *,
    stdin: bytes = b"",
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    timeout: float | None = None,
    user: str | None = None,
) -> dict[str, Any]:
    """Run one command in the environment; `{returncode, stdout, stderr}`."""
    body = {
        "argv": argv,
        "stdin": base64.b64encode(stdin).decode(),
        "cwd": cwd,
        "env": env or {},
        "timeout": timeout,
        "user": user,
    }
    return _post("exec", body, timeout=(timeout + 60.0) if timeout else None)


def write_file(path: str, content: bytes) -> None:
    """Write one file in the environment."""
    _post(
        "write",
        {"path": path, "content": base64.b64encode(content).decode()},
        timeout=120.0,
    )


def read_file(path: str) -> bytes:
    """Read one file of the environment."""
    return base64.b64decode(_post("read", {"path": path}, timeout=120.0)["content"])
