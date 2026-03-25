# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Output Catalog.

Predefined output format configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import OutputSpec


# ============================================================================
# Output Definitions
# ============================================================================

API_PUSH_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="api-push",
    version="0.0.1",
    name="API Push",
    description="Push results to an external API endpoint via HTTP POST. Useful for integrating with downstream services, data warehouses, or event-driven architectures.",
    icon="upload",
    supports_template=False,
    supports_storage=False,
    mime_types=["application/json"],
)

CSV_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="csv",
    version="0.0.1",
    name="CSV",
    description="Deliver results as a CSV file for easy import into spreadsheets, data pipelines, or other analysis tools.",
    icon="table",
    supports_template=False,
    supports_storage=True,
    mime_types=["text/csv"],
)

DASHBOARD_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="dashboard",
    version="0.0.1",
    name="Dashboard",
    description="Deliver results as an interactive dashboard with charts, tables, and filter controls rendered in the browser.",
    icon="graph",
    supports_template=True,
    supports_storage=True,
    mime_types=["text/html", "application/json"],
)

DOCUMENT_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="document",
    version="0.0.1",
    name="Document",
    description="Deliver results as a structured document (PDF, DOCX, or Markdown) suitable for sharing, archiving, or regulatory compliance.",
    icon="file",
    supports_template=True,
    supports_storage=True,
    mime_types=["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown"],
)

EMAIL_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="email",
    version="0.0.1",
    name="Email",
    description="Send results as an email attachment or inline HTML body. Supports rich formatting with embedded tables and charts.",
    icon="mail",
    supports_template=True,
    supports_storage=False,
    mime_types=["text/html", "application/pdf"],
)

JSON_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="json",
    version="0.0.1",
    name="JSON",
    description="Deliver results as structured JSON data, suitable for programmatic consumption by APIs, pipelines, or dashboards.",
    icon="code",
    supports_template=False,
    supports_storage=True,
    mime_types=["application/json"],
)

NOTEBOOK_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="notebook",
    version="0.0.1",
    name="Notebook",
    description="Deliver results as a Jupyter notebook with executable cells, inline visualizations, and rich markdown narrative.",
    icon="file-code",
    supports_template=True,
    supports_storage=True,
    mime_types=["application/x-ipynb+json"],
)

SPREADSHEET_OUTPUT_SPEC_0_0_1 = OutputSpec(
    id="spreadsheet",
    version="0.0.1",
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
    "api-push": API_PUSH_OUTPUT_SPEC_0_0_1,
    "csv": CSV_OUTPUT_SPEC_0_0_1,
    "dashboard": DASHBOARD_OUTPUT_SPEC_0_0_1,
    "document": DOCUMENT_OUTPUT_SPEC_0_0_1,
    "email": EMAIL_OUTPUT_SPEC_0_0_1,
    "json": JSON_OUTPUT_SPEC_0_0_1,
    "notebook": NOTEBOOK_OUTPUT_SPEC_0_0_1,
    "spreadsheet": SPREADSHEET_OUTPUT_SPEC_0_0_1,
}


def get_output_spec(output_id: str) -> OutputSpec | None:
    """Get an output specification by ID (accepts both bare and versioned refs)."""
    spec = OUTPUT_CATALOG.get(output_id)
    if spec is not None:
        return spec
    base, _, ver = output_id.rpartition(':')
    if base and '.' in ver:
        return OUTPUT_CATALOG.get(base)
    return None


def list_output_specs() -> List[OutputSpec]:
    """List all output specifications."""
    return list(OUTPUT_CATALOG.values())
