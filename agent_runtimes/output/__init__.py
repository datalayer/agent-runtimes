# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Output generation module for agent-runtimes.

Provides structured output generation from agent results, with built-in
support for PDF generation via the Jupyter sandbox.
"""

from .base import AgentResult, BaseOutputGenerator, OutputArtifact
from .pdf_generator import PDFOutputGenerator
from .registry import OutputRegistry, create_output_generator

__all__ = [
    "AgentResult",
    "BaseOutputGenerator",
    "OutputArtifact",
    "OutputRegistry",
    "PDFOutputGenerator",
    "create_output_generator",
]
