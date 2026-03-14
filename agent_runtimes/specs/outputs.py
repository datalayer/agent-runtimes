# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Output Catalog.

Predefined output format configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from pydantic import BaseModel, Field


class OutputSpec(BaseModel):
    """Output format specification."""

    id: str = Field(..., description="Unique output identifier")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Output description")
    icon: str = Field(default="", description="Icon identifier")
    supports_template: bool = Field(default=False, description="Whether this output supports templating")
    supports_storage: bool = Field(default=False, description="Whether this output can be persisted")
    mime_types: List[str] = Field(default_factory=list, description="Supported MIME types")


# ============================================================================
# Output Definitions
# ============================================================================

API_PUSH_OUTPUT_SPEC = OutputSpec(
    id="api-push",
    name="API Push",
    description="Push results to an external API endpoint via HTTP POST. Useful for integrating with downstream services, data warehouses, or event-driven architectures.",
    icon="upload",
    supports_template=False,
    supports_storage=False,
    mime_types=["application/json"],
)

CSV_OUTPUT_SPEC = OutputSpec(
    id="csv",
    name="CSV",
    description="Deliver results as a CSV file for easy import into spreadsheets, data pipelines, or other analysis tools.",
    icon="table",
    supports_template=False,
    supports_storage=True,
    mime_types=["text/csv"],
)

DASHBOARD_OUTPUT_SPEC = OutputSpec(
    id="dashboard",
    name="Dashboard",
    description="Deliver results as an interactive dashboard with charts, tables, and filter controls rendered in the browser.",
    icon="graph",
    supports_template=True,
    supports_storage=True,
    mime_types=["text/html", "application/json"],
)

DOCUMENT_OUTPUT_SPEC = OutputSpec(
    id="document",
    name="Document",
    description="Deliver results as a structured document (PDF, DOCX, or Markdown) suitable for sharing, archiving, or regulatory compliance.",
    icon="file",
    supports_template=True,
    supports_storage=True,
    mime_types=["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown"],
)

EMAIL_OUTPUT_SPEC = OutputSpec(
    id="email",
    name="Email",
    description="Send results as an email attachment or inline HTML body. Supports rich formatting with embedded tables and charts.",
    icon="mail",
    supports_template=True,
    supports_storage=False,
    mime_types=["text/html", "application/pdf"],
)

JSON_OUTPUT_SPEC = OutputSpec(
    id="json",
    name="JSON",
    description="Deliver results as structured JSON data, suitable for programmatic consumption by APIs, pipelines, or dashboards.",
    icon="code",
    supports_template=False,
    supports_storage=True,
    mime_types=["application/json"],
)

NOTEBOOK_OUTPUT_SPEC = OutputSpec(
    id="notebook",
    name="Notebook",
    description="Deliver results as a Jupyter notebook with executable cells, inline visualizations, and rich markdown narrative.",
    icon="file-code",
    supports_template=True,
    supports_storage=True,
    mime_types=["application/x-ipynb+json"],
)

SPREADSHEET_OUTPUT_SPEC = OutputSpec(
    id="spreadsheet",
    name="Spreadsheet",
    description="Deliver results as an Excel spreadsheet with formatted tables, charts, and multiple sheets for structured analysis.",
    icon="table",
    supports_template=True,
    supports_storage=True,
    mime_types=["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
)

# ============================================================================
# Output Catalog
# ============================================================================

OUTPUT_CATALOG: Dict[str, OutputSpec] = {
    "api-push": API_PUSH_OUTPUT_SPEC,
    "csv": CSV_OUTPUT_SPEC,
    "dashboard": DASHBOARD_OUTPUT_SPEC,
    "document": DOCUMENT_OUTPUT_SPEC,
    "email": EMAIL_OUTPUT_SPEC,
    "json": JSON_OUTPUT_SPEC,
    "notebook": NOTEBOOK_OUTPUT_SPEC,
    "spreadsheet": SPREADSHEET_OUTPUT_SPEC,
}


def get_output_spec(output_id: str) -> OutputSpec | None:
    """Get an output specification by ID."""
    return OUTPUT_CATALOG.get(output_id)


def list_output_specs() -> List[OutputSpec]:
    """List all output specifications."""
    return list(OUTPUT_CATALOG.values())
