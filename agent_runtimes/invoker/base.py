# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Base invoker class for agent triggers."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class InvokerResult:
    """Result returned by an invoker execution."""

    success: bool
    agent_id: str
    trigger_type: str
    started_at: datetime
    ended_at: datetime | None = None
    duration_ms: int | None = None
    outputs: str | None = None
    exit_status: str = "completed"
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseInvoker(ABC):
    """Abstract base class for agent trigger invokers.

    Subclasses implement ``invoke`` to execute the agent's trigger
    logic and emit lifecycle events (AGENT_STARTED, AGENT_ENDED).

    Parameters
    ----------
    agent_id : str
        The runtime agent identifier.
    agent_spec_id : str
        The agent spec identifier.
    token : str
        User JWT token for authenticated API calls.
    base_url : str
        Base URL for the AI Agents events API.
    """

    def __init__(
        self,
        agent_id: str,
        agent_spec_id: str,
        token: str,
        base_url: str = "https://prod1.datalayer.run",
    ) -> None:
        self.agent_id = agent_id
        self.agent_spec_id = agent_spec_id
        self.token = token
        self.base_url = base_url

    @abstractmethod
    async def invoke(self, trigger_config: dict[str, Any]) -> InvokerResult:
        """Execute the trigger and return the result.

        Parameters
        ----------
        trigger_config : dict
            The ``trigger`` block from the agent spec YAML.

        Returns
        -------
        InvokerResult
            Outcome of the invocation.
        """
        ...

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)
