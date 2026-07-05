# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for the Streamlit sklearn example application."""

from pydantic import BaseModel


class Iris(BaseModel):
    """
    Pydantic model for Iris flower measurements.

    Attributes
    ----------
    sepal_length : float
        Length of the sepal in centimeters.
    sepal_width : float
        Width of the sepal in centimeters.
    petal_length : float
        Length of the petal in centimeters.
    petal_width : float
        Width of the petal in centimeters.
    """

    sepal_length: float
    sepal_width: float
    petal_length: float
    petal_width: float
