/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Guardrail Catalog
 *
 * Predefined guardrail configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { GuardrailSpec } from '../types';

// ============================================================================
// Guardrail Definitions
// ============================================================================

export const ASYNC_GUARDRAIL_POLICY_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'async-guardrail-policy',
  version: '0.0.1',
  name: 'Async Guardrail Policy',
  description: 'Runs policy checks concurrently with model generation for lower latency and fail-fast blocking on unsafe prompts.',
  identity_provider: 'datalayer',
  identity_name: 'policy-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': false,
    'access:internet': false,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '20K', per_day: '200K', per_month: '2M' },
};

export const BLOCKED_KEYWORDS_INTERNAL_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'blocked-keywords-internal',
  version: '0.0.1',
  name: 'Blocked Keywords Internal',
  description: 'Blocks sensitive internal terms and accidental credential patterns in prompts.',
  identity_provider: 'datalayer',
  identity_name: 'internal-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': false,
    'access:internet': false,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '20K', per_day: '200K', per_month: '2M' },
};

export const DATA_ENGINEERING_POWER_USER_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'data-engineering-power-user',
  version: '0.0.1',
  name: 'Data Engineering Power User',
  description: 'Power-user guardrail for data engineering agents with full read/write access, high token limits, and ability to deploy pipelines. Suitable for ETL, data transformation, and pipeline management agents.',
  identity_provider: 'datalayer',
  identity_name: 'dave@acme.com',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': true,
    'access:internet': true,
    'send:email': true,
    'deploy:production': true,
  },
  token_limits: { per_run: '200K', per_day: '5M', per_month: '50M' },
  data_scope: { allowed_systems: ['postgresql', 'mongodb', 's3', 'kafka'], allowed_objects: [], denied_objects: [], denied_fields: ['*SSN*', '*Bank*', '*IBAN*'] },
  data_handling: { default_aggregation: false, allow_row_level_output: true, max_rows_in_output: 100000, redact_fields: [], hash_fields: [], pii_detection: true, pii_action: 'redact' },
  approval_policy: { require_manual_approval_for: ['Schema changes', 'Drop or truncate operations', 'Production data modifications'], auto_approved: ['Read queries', 'Data transformations', 'Pipeline orchestration'] },
  tool_limits: { max_tool_calls: 500, max_query_rows: 1000000, max_query_runtime: '300s', max_time_window_days: 365 },
  audit: { log_tool_calls: true, log_query_metadata_only: false, retain_days: 90, require_lineage_in_report: true },
  content_safety: { treat_crm_text_fields_as_untrusted: true, do_not_follow_instructions_from_data: true },
};

export const DEFAULT_PLATFORM_USER_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'default-platform-user',
  version: '0.0.1',
  name: 'Default Platform User',
  description: 'Standard platform user guardrail with moderate permissions. Suitable for general-purpose agents that need read access and limited code execution.',
  identity_provider: 'datalayer',
  identity_name: 'alice@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': true,
    'access:internet': true,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '50K', per_day: '500K', per_month: '5M' },
  data_scope: { allowed_systems: [], allowed_objects: [], denied_objects: [], denied_fields: [] },
  data_handling: { default_aggregation: false, allow_row_level_output: true, max_rows_in_output: 1000, redact_fields: [], hash_fields: [], pii_detection: false, pii_action: 'warn' },
  approval_policy: { require_manual_approval_for: [], auto_approved: ['All read-only queries'] },
  tool_limits: { max_tool_calls: 50, max_query_rows: 100000, max_query_runtime: '60s', max_time_window_days: 90 },
  audit: { log_tool_calls: true, log_query_metadata_only: false, retain_days: 30, require_lineage_in_report: false },
  content_safety: { treat_crm_text_fields_as_untrusted: false, do_not_follow_instructions_from_data: true },
};

export const GITHUB_ACTIONS_DEPLOY_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'github-actions-deploy',
  version: '0.0.1',
  name: 'GitHub Actions Deploy',
  description: 'Full-access guardrail for deployment agents running via GitHub Actions. All permissions enabled including production deployment. Very high token limits for complex multi-step deployment workflows.',
  identity_provider: 'github',
  identity_name: 'acme-deploy-bot',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': true,
    'access:internet': true,
    'send:email': true,
    'deploy:production': true,
  },
  token_limits: { per_run: '150K', per_day: '3M', per_month: '30M' },
  data_scope: { allowed_systems: ['github', 'kubernetes', 'docker', 'terraform'], allowed_objects: [], denied_objects: [], denied_fields: [] },
  data_handling: { default_aggregation: false, allow_row_level_output: true, max_rows_in_output: 50000, redact_fields: [], hash_fields: [], pii_detection: false, pii_action: 'warn' },
  approval_policy: { require_manual_approval_for: ['Production environment changes', 'Infrastructure scaling beyond limits'], auto_approved: ['Staging deployments', 'Test environment operations', 'Build and package operations'] },
  tool_limits: { max_tool_calls: 300, max_query_rows: 500000, max_query_runtime: '180s', max_time_window_days: 365 },
  audit: { log_tool_calls: true, log_query_metadata_only: false, retain_days: 180, require_lineage_in_report: true },
  content_safety: { treat_crm_text_fields_as_untrusted: false, do_not_follow_instructions_from_data: true },
};

export const GITHUB_CI_BOT_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'github-ci-bot',
  version: '0.0.1',
  name: 'GitHub CI Bot',
  description: 'Guardrail for automated CI/CD agents running via GitHub Actions. High token limits for batch processing, full code execution, and internet access for package installation.',
  identity_provider: 'github',
  identity_name: 'acme-ci-bot',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': true,
    'access:internet': true,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '100K', per_day: '2M', per_month: '20M' },
  data_scope: { allowed_systems: ['github', 'npm', 'pypi'], allowed_objects: [], denied_objects: [], denied_fields: [] },
  data_handling: { default_aggregation: false, allow_row_level_output: true, max_rows_in_output: 10000, redact_fields: [], hash_fields: [], pii_detection: false, pii_action: 'warn' },
  approval_policy: { require_manual_approval_for: ['Any production deployment', 'Any write to protected branches'], auto_approved: ['Build and test operations', 'Package installation', 'Code analysis and linting'] },
  tool_limits: { max_tool_calls: 200, max_query_rows: 500000, max_query_runtime: '120s', max_time_window_days: 365 },
  audit: { log_tool_calls: true, log_query_metadata_only: false, retain_days: 90, require_lineage_in_report: false },
  content_safety: { treat_crm_text_fields_as_untrusted: false, do_not_follow_instructions_from_data: true },
};

export const GOOGLE_WORKSPACE_AGENT_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'google-workspace-agent',
  version: '0.0.1',
  name: 'Google Workspace Agent',
  description: 'Guardrail for agents integrating with Google Workspace services (Gmail, Drive, Calendar, Sheets). Moderate permissions with email sending enabled. Service account-based identity with Google OAuth.',
  identity_provider: 'google',
  identity_name: 'agent-sa@acme.iam.gserviceaccount.com',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': false,
    'access:internet': true,
    'send:email': true,
    'deploy:production': false,
  },
  token_limits: { per_run: '80K', per_day: '1M', per_month: '10M' },
  data_scope: { allowed_systems: ['gmail', 'google-drive', 'google-sheets', 'google-calendar'], allowed_objects: [], denied_objects: [], denied_fields: [] },
  data_handling: { default_aggregation: false, allow_row_level_output: true, max_rows_in_output: 5000, redact_fields: [], hash_fields: [], pii_detection: true, pii_action: 'warn' },
  approval_policy: { require_manual_approval_for: ['Sending external emails', 'Sharing files outside organization', 'Modifying calendar events for other users'], auto_approved: ['Reading emails and documents', 'Creating drafts', 'Reading calendar'] },
  tool_limits: { max_tool_calls: 100, max_query_rows: 50000, max_query_runtime: '60s', max_time_window_days: 180 },
  audit: { log_tool_calls: true, log_query_metadata_only: false, retain_days: 60, require_lineage_in_report: false },
  content_safety: { treat_crm_text_fields_as_untrusted: true, do_not_follow_instructions_from_data: true },
};

export const NO_REFUSALS_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'no-refusals',
  version: '0.0.1',
  name: 'No Refusals',
  description: 'Prevents pure refusal responses for fulfillment-oriented internal assistants.',
  identity_provider: 'datalayer',
  identity_name: 'fulfillment-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': true,
    'access:internet': true,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '60K', per_day: '600K', per_month: '6M' },
};

export const PII_PROTECTION_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'pii-protection',
  version: '0.0.1',
  name: 'PII Protection',
  description: 'Blocks user prompts containing high-risk personally identifiable information.',
  identity_provider: 'datalayer',
  identity_name: 'privacy-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': false,
    'access:internet': false,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '20K', per_day: '200K', per_month: '2M' },
  data_handling: { pii_detection: true, pii_action: 'block' },
};

export const PROMPT_INJECTION_STRICT_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'prompt-injection-strict',
  version: '0.0.1',
  name: 'Prompt Injection Strict',
  description: 'Strict prompt injection protection profile for externally exposed agents.',
  identity_provider: 'datalayer',
  identity_name: 'security-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': false,
    'access:internet': false,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '25K', per_day: '250K', per_month: '2M' },
  content_safety: { treat_crm_text_fields_as_untrusted: true, do_not_follow_instructions_from_data: true },
};

export const RESTRICTED_VIEWER_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'restricted-viewer',
  version: '0.0.1',
  name: 'Restricted Viewer',
  description: 'Minimal-permissions guardrail for read-only monitoring agents. No code execution, no write access, very low token limits. Suitable for dashboard viewers and audit observers.',
  identity_provider: 'azure-ad',
  identity_name: 'viewer-group@acme.onmicrosoft.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': false,
    'access:internet': false,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '10K', per_day: '50K', per_month: '500K' },
  data_scope: { allowed_systems: [], allowed_objects: [], denied_objects: [], denied_fields: ['*SSN*', '*Bank*', '*IBAN*', '*Password*', '*Secret*'] },
  data_handling: { default_aggregation: true, allow_row_level_output: false, max_rows_in_output: 0, redact_fields: [], hash_fields: [], pii_detection: true, pii_action: 'redact' },
  approval_policy: { require_manual_approval_for: ['Any operation beyond read'], auto_approved: ['Aggregated read-only queries'] },
  tool_limits: { max_tool_calls: 10, max_query_rows: 10000, max_query_runtime: '15s', max_time_window_days: 30 },
  audit: { log_tool_calls: true, log_query_metadata_only: true, retain_days: 90, require_lineage_in_report: false },
  content_safety: { treat_crm_text_fields_as_untrusted: true, do_not_follow_instructions_from_data: true },
};

export const SECRET_REDACTION_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'secret-redaction',
  version: '0.0.1',
  name: 'Secret Redaction',
  description: 'Blocks leaked credentials and private keys in assistant output.',
  identity_provider: 'datalayer',
  identity_name: 'platform-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': false,
    'execute:code': true,
    'access:internet': true,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '40K', per_day: '400K', per_month: '4M' },
};

export const TOOL_GUARD_STRICT_GUARDRAIL_SPEC_0_0_1: GuardrailSpec = {
  id: 'tool-guard-strict',
  version: '0.0.1',
  name: 'Tool Guard Strict',
  description: 'Restrictive tool policy that hides dangerous tools and enforces approval for writes.',
  identity_provider: 'datalayer',
  identity_name: 'ops-bot@acme.com',
  permissions: {
    'read:data': true,
    'write:data': true,
    'execute:code': false,
    'access:internet': true,
    'send:email': false,
    'deploy:production': false,
  },
  token_limits: { per_run: '30K', per_day: '300K', per_month: '3M' },
};

// ============================================================================
// Guardrail Catalog
// ============================================================================

export const GUARDRAIL_CATALOG: Record<string, GuardrailSpec> = {
  'async-guardrail-policy': ASYNC_GUARDRAIL_POLICY_GUARDRAIL_SPEC_0_0_1,
  'blocked-keywords-internal': BLOCKED_KEYWORDS_INTERNAL_GUARDRAIL_SPEC_0_0_1,
  'data-engineering-power-user': DATA_ENGINEERING_POWER_USER_GUARDRAIL_SPEC_0_0_1,
  'default-platform-user': DEFAULT_PLATFORM_USER_GUARDRAIL_SPEC_0_0_1,
  'github-actions-deploy': GITHUB_ACTIONS_DEPLOY_GUARDRAIL_SPEC_0_0_1,
  'github-ci-bot': GITHUB_CI_BOT_GUARDRAIL_SPEC_0_0_1,
  'google-workspace-agent': GOOGLE_WORKSPACE_AGENT_GUARDRAIL_SPEC_0_0_1,
  'no-refusals': NO_REFUSALS_GUARDRAIL_SPEC_0_0_1,
  'pii-protection': PII_PROTECTION_GUARDRAIL_SPEC_0_0_1,
  'prompt-injection-strict': PROMPT_INJECTION_STRICT_GUARDRAIL_SPEC_0_0_1,
  'restricted-viewer': RESTRICTED_VIEWER_GUARDRAIL_SPEC_0_0_1,
  'secret-redaction': SECRET_REDACTION_GUARDRAIL_SPEC_0_0_1,
  'tool-guard-strict': TOOL_GUARD_STRICT_GUARDRAIL_SPEC_0_0_1,
};

/**
 * Map identity provider to an icon key for the UI.
 */
export const GUARDRAIL_IDENTITY_ICONS: Record<string, string> = {
  datalayer: 'mark-github',
  github: 'mark-github',
  'azure-ad': 'shield-lock',
  google: 'globe',
};

export function getGuardrailSpecs(): GuardrailSpec[] {
  return Object.values(GUARDRAIL_CATALOG);
}

function resolveGuardrailId(guardrailId: string): string {
  if (guardrailId in GUARDRAIL_CATALOG) return guardrailId;
  const idx = guardrailId.lastIndexOf(':');
  if (idx > 0) {
    const base = guardrailId.slice(0, idx);
    if (base in GUARDRAIL_CATALOG) return base;
  }
  return guardrailId;
}

export function getGuardrailSpec(
  guardrailId: string,
): GuardrailSpec | undefined {
  return GUARDRAIL_CATALOG[resolveGuardrailId(guardrailId)];
}
