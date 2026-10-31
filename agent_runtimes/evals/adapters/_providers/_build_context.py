# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A task's build context, read in the sandbox, for either framework's runner.

Standard library only. Read only when its Dockerfile copies something, because
a project's whole folder is often its Dockerfile's folder, and bounded, because
what is read travels inside the Environment's spec.
"""

from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Any

__all__ = ["MAX_CONTEXT_BYTES", "read_context"]

#: Environments' own bound on a context carried in a spec.
MAX_CONTEXT_BYTES = 1024 * 1024
_COPIES = re.compile(r"^\s*(COPY|ADD)\s", re.IGNORECASE | re.MULTILINE)
_SKIPPED = frozenset({"__pycache__", ".git"})


def read_context(folder: Path, dockerfile: str) -> dict[str, Any]:
    """`{context: [...]}` to hand on, or `{context_too_large: True}`."""
    if not _COPIES.search(dockerfile):
        return {"context": []}
    files = []
    total = 0
    for path in sorted(item for item in folder.rglob("*") if item.is_file()):
        relative = path.relative_to(folder)
        if path.name == "Dockerfile" or _SKIPPED & set(relative.parts):
            continue
        total += path.stat().st_size
        if total > MAX_CONTEXT_BYTES:
            return {"context": [], "context_too_large": True}
        files.append(
            {
                "path": relative.as_posix(),
                "contentBase64": base64.b64encode(path.read_bytes()).decode(),
                "executable": os.access(path, os.X_OK),
            }
        )
    return {"context": files}
