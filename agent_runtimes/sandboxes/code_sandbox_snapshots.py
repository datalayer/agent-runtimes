# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Snapshot services for Datalayer code sandboxes."""

import uuid
from typing import Any, Optional, Tuple

from agent_runtimes.models.sandbox_snapshot import SandboxSnapshotModel


def create_snapshot(name: Optional[str], description: Optional[str]) -> Tuple[str, str]:
    """Create snapshot name and description with defaults."""
    uid = uuid.uuid4()
    if name is None:
        name = f"snapshot-{uid}"

    if description is None:
        description = f"snapshot-{uid}"

    return name, description


def as_code_sandbox_snapshots(
    response: dict[str, Any],
) -> list[SandboxSnapshotModel]:
    """Parse API response and create SandboxSnapshotModel objects."""
    snapshot_objects: list[SandboxSnapshotModel] = []
    if response["success"]:
        snapshots = response["snapshots"]
        for snapshot in snapshots:
            snapshot_objects.append(
                SandboxSnapshotModel(
                    uid=snapshot["uid"],
                    name=snapshot["name"],
                    description=snapshot["description"],
                    environment=snapshot["environment"],
                    metadata=snapshot["metadata"],
                )
            )
    return snapshot_objects
