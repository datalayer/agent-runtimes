/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Output Catalog
 *
 * Predefined output format configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { OutputSpec } from '../types';

// ============================================================================
// Output Definitions
// ============================================================================

export const API_PUSH_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'api-push',
  version: '0.0.1',
  name: 'API Push',
  description:
    'Push results to an external API endpoint via HTTP POST. Useful for integrating with downstream services, data warehouses, or event-driven architectures.',
  icon: 'upload',
  supports_template: false,
  supports_storage: false,
  mime_types: ['application/json'],
};

export const CSV_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'csv',
  version: '0.0.1',
  name: 'CSV',
  description:
    'Deliver results as a CSV file for easy import into spreadsheets, data pipelines, or other analysis tools.',
  icon: 'table',
  supports_template: false,
  supports_storage: true,
  mime_types: ['text/csv'],
};

export const DASHBOARD_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'dashboard',
  version: '0.0.1',
  name: 'Dashboard',
  description:
    'Deliver results as an interactive dashboard with charts, tables, and filter controls rendered in the browser.',
  icon: 'graph',
  supports_template: true,
  supports_storage: true,
  mime_types: ['text/html', 'application/json'],
};

export const DOCUMENT_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'document',
  version: '0.0.1',
  name: 'Document',
  description:
    'Deliver results as a structured document (PDF, DOCX, or Markdown) suitable for sharing, archiving, or regulatory compliance.',
  icon: 'file',
  supports_template: true,
  supports_storage: true,
  mime_types: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
  ],
};

export const EMAIL_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'email',
  version: '0.0.1',
  name: 'Email',
  description:
    'Send results as an email attachment or inline HTML body. Supports rich formatting with embedded tables and charts.',
  icon: 'mail',
  supports_template: true,
  supports_storage: false,
  mime_types: ['text/html', 'application/pdf'],
};

export const JSON_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'json',
  version: '0.0.1',
  name: 'JSON',
  description:
    'Deliver results as structured JSON data, suitable for programmatic consumption by APIs, pipelines, or dashboards.',
  icon: 'code',
  supports_template: false,
  supports_storage: true,
  mime_types: ['application/json'],
};

export const NOTEBOOK_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'notebook',
  version: '0.0.1',
  name: 'Notebook',
  description:
    'Deliver results as a Jupyter notebook with executable cells, inline visualizations, and rich markdown narrative.',
  icon: 'file-code',
  supports_template: true,
  supports_storage: true,
  mime_types: ['application/x-ipynb+json'],
};

export const SPREADSHEET_OUTPUT_SPEC_0_0_1: OutputSpec = {
  id: 'spreadsheet',
  version: '0.0.1',
  name: 'Spreadsheet',
  description:
    'Deliver results as an Excel spreadsheet with formatted tables, charts, and multiple sheets for structured analysis.',
  icon: 'table',
  supports_template: true,
  supports_storage: true,
  mime_types: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

// ============================================================================
// Output Catalog
// ============================================================================

export const OUTPUT_CATALOG: Record<string, OutputSpec> = {
  'api-push': API_PUSH_OUTPUT_SPEC_0_0_1,
  csv: CSV_OUTPUT_SPEC_0_0_1,
  dashboard: DASHBOARD_OUTPUT_SPEC_0_0_1,
  document: DOCUMENT_OUTPUT_SPEC_0_0_1,
  email: EMAIL_OUTPUT_SPEC_0_0_1,
  json: JSON_OUTPUT_SPEC_0_0_1,
  notebook: NOTEBOOK_OUTPUT_SPEC_0_0_1,
  spreadsheet: SPREADSHEET_OUTPUT_SPEC_0_0_1,
};

export function getOutputSpecs(): OutputSpec[] {
  return Object.values(OUTPUT_CATALOG);
}

function resolveOutputId(outputId: string): string {
  if (outputId in OUTPUT_CATALOG) return outputId;
  const idx = outputId.lastIndexOf(':');
  if (idx > 0) {
    const base = outputId.slice(0, idx);
    if (base in OUTPUT_CATALOG) return base;
  }
  return outputId;
}

export function getOutputSpec(outputId: string): OutputSpec | undefined {
  return OUTPUT_CATALOG[resolveOutputId(outputId)];
}
