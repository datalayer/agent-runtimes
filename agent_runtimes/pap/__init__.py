# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Personal Agent Protocol capabilities: a personal agent and a company, with model-safe result boundaries."""

from .capability import (
    PapAgentIdentitySummary,
    PapAnswer,
    PapCapabilityError,
    PapCompanySummary,
    PapConfirmSummary,
    PapOperationSummary,
    PapPersonalAgentCapability,
    PapSignInSummary,
)
from .company import A2AApplication, PapCompanyCapability

__all__ = [
    "A2AApplication",
    "PapCompanyCapability",
    "PapAgentIdentitySummary",
    "PapAnswer",
    "PapCapabilityError",
    "PapCompanySummary",
    "PapConfirmSummary",
    "PapOperationSummary",
    "PapPersonalAgentCapability",
    "PapSignInSummary",
]
