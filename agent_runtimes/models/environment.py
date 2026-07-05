# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Environment models for Datalayer.

Provides data structures for environment management in Datalayer environments.
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from datalayer_core.utils.types import CreditsPerSecond


class EnvironmentModel(BaseModel):
    """
    Pydantic model representing a Datalayer environment.

    Provides information about available computing environments
    including resources, packages, and configuration details.
    """

    name: str = Field(..., description="Name of the environment")
    title: str = Field(..., description="Title of the environment")
    burning_rate: CreditsPerSecond = Field(
        ..., description="The cost of running the environment per hour"
    )
    language: str = Field(..., description="Programming language for the environment")
    owner: str = Field(..., description="Owner of the environment")
    visibility: str = Field(..., description="Environment visibility (public/private)")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional metadata for the environment"
    )

    def __repr__(self) -> str:
        return f"EnvironmentModel(name='{self.name}', title='{self.title}')"
