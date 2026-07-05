# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for FastAPI sklearn example."""

from pydantic import BaseModel


class Iris(BaseModel):
    """Pydantic model for Iris dataset features."""

    sepal_length: float
    sepal_width: float
    petal_length: float
    petal_width: float
