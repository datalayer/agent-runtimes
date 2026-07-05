# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Runtime model for Datalayer.

Provides data structures for runtime model in Datalayer.
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from datalayer_core.utils.defaults import (
    DEFAULT_ENVIRONMENT,
    DEFAULT_TIME_RESERVATION,
)
from datalayer_core.utils.types import (
    CreditsPerSecond,
    Minutes,
)
from datalayer_core.utils.urls import DEFAULT_DATALAYER_URL


class RuntimeModel(BaseModel):
    """
    Model representing a Datalayer Runtime configuration and state.

    This model encapsulates both the configuration parameters and runtime state
    for a Datalayer runtime, including resource allocation, time limits,
    service endpoints, and execution state.
    """

    # Core configuration fields
    name: str = Field(description="Name of the runtime (kernel)")
    environment: str = Field(
        default=DEFAULT_ENVIRONMENT, description="The environment name (default: 'env')"
    )
    time_reservation: Minutes = Field(
        default=DEFAULT_TIME_RESERVATION,
        description="Time reservation in minutes (default: 10)",
    )

    # Service URLs
    run_url: str = Field(
        default=DEFAULT_DATALAYER_URL,
        description="Runtime service URL (default: 'https://api.datalayer.run')",
    )
    iam_url: Optional[str] = Field(default=None, description="IAM service URL")

    # Authentication fields
    token: Optional[str] = Field(default=None, description="Authentication token")
    external_token: Optional[str] = Field(
        default=None, description="External authentication token"
    )

    # Runtime configuration fields
    pod_name: Optional[str] = Field(
        default=None, description="Name of the pod running the runtime"
    )
    ingress: Optional[str] = Field(
        default=None, description="Ingress URL for the runtime"
    )
    reservation_id: Optional[str] = Field(
        default=None, description="Reservation ID for the runtime"
    )
    uid: Optional[str] = Field(default=None, description="ID for the runtime")
    burning_rate: Optional[CreditsPerSecond] = Field(
        default=None, description="Burning rate for the runtime"
    )
    jupyter_token: Optional[str] = Field(
        default=None, description="Token for the kernel client"
    )
    started_at: Optional[str] = Field(
        default=None, description="Start time for the runtime"
    )
    expired_at: Optional[str] = Field(
        default=None, description="Expiration time for the runtime"
    )

    # Runtime state fields.
    runtime: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Runtime configuration object"
    )
    kernel_client: Optional[Any] = Field(
        default=None, description="Kernel client instance"
    )
    kernel_id: Optional[str] = Field(default=None, description="Active kernel ID")
    executing: bool = Field(
        default=False, description="Whether code is currently executing"
    )

    # Legacy compatibility (keeping for backward compatibility)
    url: str = Field(
        default=DEFAULT_DATALAYER_URL,
        description="Runtime service URL (alias for run_url)",
    )
    credits_per_second: CreditsPerSecond = Field(
        default=1, description="Credits consumed per second of runtime (default: 1)"
    )
    extra: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional configuration parameters"
    )

    class Config:
        """Pydantic configuration for RuntimeModel."""

        arbitrary_types_allowed = True
        extra = "forbid"

    @property
    def credits_limit(self) -> Optional[float]:
        """
        Calculate the credits limit based on burning rate and time reservation.

        Returns
        -------
        Optional[float]
            The credits limit, or None if burning_rate is not set.
        """
        if self.burning_rate is not None:
            return self.burning_rate * 60.0 * self.time_reservation
        return None

    def __repr__(self) -> str:
        return f"RuntimeModel(uid='{self.uid}', name='{self.name}')"
