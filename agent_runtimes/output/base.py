# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Base output generator.

Defines the abstract interface for output generators and common
data structures (OutputArtifact, AgentResult).
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AgentResult:
    """The structured result of an agent run, ready for output generation."""

    agent_id: str
    final_output: str
    """Markdown-formatted final output from the agent."""
    structured_data: dict[str, Any] = field(default_factory=dict)
    """Optional structured data (tables, metrics) for template rendering."""
    charts: list[dict[str, Any]] = field(default_factory=list)
    """Chart specifications (e.g., echarts options) embedded in the output."""
    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata about the agent run."""
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class OutputArtifact:
    """A generated output artifact."""

    type: str  # "pdf", "html", "csv", "notebook"
    url: str = ""
    """URL or file path where the artifact is stored."""
    filename: str = ""
    size_bytes: int = 0
    content_type: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "url": self.url,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "content_type": self.content_type,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


class BaseOutputGenerator(ABC):
    """Abstract base class for output generators."""

    @abstractmethod
    async def generate(self, agent_result: AgentResult) -> OutputArtifact:
        """Generate output from an agent result.

        Parameters
        ----------
        agent_result : AgentResult
            The structured result from an agent run.

        Returns
        -------
        OutputArtifact
            The generated artifact with URL/path and metadata.
        """
        ...

    async def cleanup(self) -> None:
        """Clean up temporary resources."""
        pass
