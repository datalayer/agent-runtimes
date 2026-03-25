/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Permission flags for a guardrail identity.
 */
export interface GuardrailPermissions {
  'read:data': boolean;
  'write:data': boolean;
  'execute:code': boolean;
  'access:internet': boolean;
  'send:email': boolean;
  'deploy:production': boolean;
}

/**
 * Token usage limits for a guardrail.
 */
export interface GuardrailTokenLimits {
  per_run: string;
  per_day: string;
  per_month: string;
}

/**
 * Data scope restrictions — which systems/objects are accessible.
 */
export interface GuardrailDataScope {
  allowed_systems: string[];
  allowed_objects: string[];
  denied_objects: string[];
  denied_fields: string[];
}

/**
 * Data handling policies — aggregation, row-level, PII, redaction.
 */
export interface GuardrailDataHandling {
  default_aggregation: boolean;
  allow_row_level_output: boolean;
  max_rows_in_output: number;
  redact_fields: string[];
  hash_fields: string[];
  pii_detection: boolean;
  pii_action: string;
}

/**
 * Approval policy for sensitive operations.
 */
export interface GuardrailApprovalPolicy {
  require_manual_approval_for: string[];
  auto_approved: string[];
}

/**
 * Tool invocation limits.
 */
export interface GuardrailToolLimits {
  max_tool_calls: number;
  max_query_rows: number;
  max_query_runtime: string;
  max_time_window_days: number;
}

/**
 * Audit trail configuration.
 */
export interface GuardrailAudit {
  log_tool_calls: boolean;
  log_query_metadata_only: boolean;
  retain_days: number;
  require_lineage_in_report: boolean;
}

/**
 * Content safety settings.
 */
export interface GuardrailContentSafety {
  treat_crm_text_fields_as_untrusted: boolean;
  do_not_follow_instructions_from_data: boolean;
}

/**
 * Full guardrail specification.
 */
export interface GuardrailSpec {
  /** Unique guardrail identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the guardrail */
  description: string;
  /** Identity provider (e.g., 'datalayer', 'github', 'azure-ad', 'google') */
  identity_provider: string;
  /** Identity name within the provider */
  identity_name: string;
  /** Permission flags */
  permissions: GuardrailPermissions;
  /** Token usage limits */
  token_limits: GuardrailTokenLimits;
  /** Data scope restrictions */
  data_scope?: GuardrailDataScope;
  /** Data handling policies */
  data_handling?: GuardrailDataHandling;
  /** Approval policy */
  approval_policy?: GuardrailApprovalPolicy;
  /** Tool invocation limits */
  tool_limits?: GuardrailToolLimits;
  /** Audit trail configuration */
  audit?: GuardrailAudit;
  /** Content safety settings */
  content_safety?: GuardrailContentSafety;
}
