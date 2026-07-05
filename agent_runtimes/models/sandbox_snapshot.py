# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Runtime snapshot model for Datalayer.

Provides data structures for code sandbox snapshot management in Datalayer environments.
"""

from typing import Any, Dict

from pydantic import BaseModel, Field


class SandboxSnapshotModel(BaseModel):
    """
    Pydantic model representing a snapshot of a Datalayer runtime state.

    This model contains all the data fields and configuration parameters
    for a code sandbox snapshot, separate from the service logic.
    """

    uid: str = Field(..., description="Unique identifier for the snapshot")
    name: str = Field(..., description="Name of the snapshot")
    description: str = Field(..., description="Description of the snapshot")
    environment: str = Field(
        ..., description="Environment associated with the snapshot"
    )
    metadata: Dict[str, Any] = Field(
        ..., description="Metadata related to the snapshot"
    )

    def __repr__(self) -> str:
        return (
            f"SandboxSnapshotModel(uid='{self.uid}', name='{self.name}', "
            f"description='{self.description}', environment='{self.environment}')"
        )
