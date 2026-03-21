# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Checkpoint configuration."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field

_DEFAULT_CHECKPOINTS_DIR = os.path.join(tempfile.gettempdir(), "agent-checkpoints")


@dataclass
class CheckpointConfig:
    """Configuration for conversation checkpointing.

    Parameters
    ----------
    enabled : bool
        Whether checkpointing is active.
    frequency : str
        When to auto-checkpoint: "every_tool", "every_turn", or "manual_only".
    max_checkpoints : int
        Rolling window — oldest pruned when exceeded.
    store : str
        Storage backend: "in_memory", "file", or "s3".
    file_dir : str
        Directory for file-based storage.
    """

    enabled: bool = False
    frequency: str = "every_turn"  # "every_tool" | "every_turn" | "manual_only"
    max_checkpoints: int = 20
    store: str = "in_memory"  # "in_memory" | "file" | "s3"
    file_dir: str = _DEFAULT_CHECKPOINTS_DIR
    metadata: dict = field(default_factory=dict)

    @classmethod
    def from_spec(cls, spec_checkpoints: dict | None) -> "CheckpointConfig":
        """Create from AgentSpec ``checkpoints`` section."""
        if not spec_checkpoints:
            return cls()
        return cls(
            enabled=spec_checkpoints.get("enabled", False),
            frequency=spec_checkpoints.get("frequency", "every_turn"),
            max_checkpoints=spec_checkpoints.get("max_checkpoints", 20),
            store=spec_checkpoints.get("store", "in_memory"),
            file_dir=spec_checkpoints.get("file_dir", _DEFAULT_CHECKPOINTS_DIR),
        )

    @classmethod
    def from_env(cls) -> "CheckpointConfig":
        """Create from environment variables."""
        enabled = os.environ.get("AGENT_CHECKPOINTS_ENABLED", "").lower() in (
            "1",
            "true",
        )
        return cls(
            enabled=enabled,
            frequency=os.environ.get("AGENT_CHECKPOINTS_FREQUENCY", "every_turn"),
            max_checkpoints=int(os.environ.get("AGENT_CHECKPOINTS_MAX", "20")),
            store=os.environ.get("AGENT_CHECKPOINTS_STORE", "in_memory"),
            file_dir=os.environ.get("AGENT_CHECKPOINTS_DIR", _DEFAULT_CHECKPOINTS_DIR),
        )
