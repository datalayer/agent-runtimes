/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's guardrails: the entries of an agent spec's `guardrails` list.
 *
 * What is typed here is what the runtime enforces of an entry
 * (`agent_runtimes.capabilities.factory`) and what the components read of it
 * (the cost budget). What may be *done* is not here: that is the Policy a
 * Guard extends (`PolicySpec`, `agentspecs/policies`).
 */

/**
 * Each section names the keys the runtime reads; what a spec writes beside
 * them is carried as written, as the Python type (`List[Dict[str, Any]]`)
 * carries it, and read by nothing.
 */

/** The money an agent may spend: read by the runtime and shown by the cost tracker. */
export interface AgentCostBudget {
  per_run_usd?: number;
  cumulative_usd?: number;
  /** What happens past the budget: `stop` when unsaid. */
  on_budget_exceeded?: string;
  [key: string]: unknown;
}

/** The tokens an agent may use. */
export interface AgentTokenLimits {
  per_run?: string | number;
  per_day?: string | number;
  per_month?: string | number;
  request_limit?: number;
  tool_calls_limit?: number;
  [key: string]: unknown;
}

/** Which systems and objects it may reach, and which fields it may not name. */
export interface AgentDataScope {
  allowed_systems?: string[];
  allowed_objects?: string[];
  denied_objects?: string[];
  denied_fields?: string[];
  [key: string]: unknown;
}

/** How rows and personal data leave. */
export interface AgentDataHandling {
  allow_row_level_output?: boolean;
  max_rows_in_output?: number;
  pii_detection?: boolean;
  /** `warn`, `redact` or `block`. */
  pii_action?: string;
  [key: string]: unknown;
}

/** Untrusted text and instructions found in data. */
export interface AgentContentSafety {
  treat_crm_text_fields_as_untrusted?: boolean;
  do_not_follow_instructions_from_data?: boolean;
  [key: string]: unknown;
}

/** How one priced tool is billed: by a unit of the price table, or by what it reads. */
export interface AgentApiBudgetTool {
  unit?: string;
  /** The unit of a post carrying a link (`create_post_with_url`). */
  with_url?: string;
  /** The argument saying what is read (`what`). */
  by?: string;
  reads?: Record<
    string,
    { unit: string; per_result?: boolean; fewest?: number }
  >;
  [key: string]: unknown;
}

/**
 * What a paid API costs Datalayer, held to budgets (the X budget of the
 * Marketer, `x-api-budget`, 15 November 2026): its price table, its budgets,
 * the most results a read asks for, and how each tool is priced. The runtime's
 * `ApiBudgetCapability` enforces it; the counters live in the agent-memories
 * PostgreSQL (protocol-state kind `guardrail.api_budget`).
 */
export interface AgentApiBudget {
  id: string;
  provider: string;
  currency?: string;
  prices: Record<string, number>;
  budgets?: {
    per_person_daily?: number;
    per_person_monthly?: number;
    platform_monthly?: number;
  };
  results?: { argument?: string; default?: number; most?: number };
  counted_by?: string;
  tools?: Record<string, AgentApiBudgetTool>;
  [key: string]: unknown;
}

/** One entry of an agent spec's `guardrails`. */
export interface AgentGuardrail {
  name?: string;
  cost_budget?: AgentCostBudget;
  /** What a paid API costs, held to budgets per person and for the platform. */
  api_budget?: AgentApiBudget;
  token_limits?: AgentTokenLimits;
  /** Permission flags, `read:data` and the like, each true or false. */
  permissions?: Record<string, boolean>;
  data_scope?: AgentDataScope;
  data_handling?: AgentDataHandling;
  content_safety?: AgentContentSafety;
  /** The shield-style sections the runtime builds a capability from, each by its own keys. */
  prompt_injection?: Record<string, unknown> | boolean;
  secret_redaction?: Record<string, unknown> | boolean;
  blocked_keywords?: Record<string, unknown> | boolean;
  no_refusals?: Record<string, unknown> | boolean;
  tool_guard?: Record<string, unknown> | boolean;
  async_guardrail?: Record<string, unknown> | boolean;
  tool_approval?: Record<string, unknown> | boolean;
  /** What a spec writes beyond this is carried as written, as the Python type (`List[Dict[str, Any]]`) carries it. */
  [key: string]: unknown;
}

/** The `api_budget` of an agent's guardrails with this id (`x-api-budget`), if it declares one. */
export function apiBudgetOf(
  guardrails: readonly unknown[] | undefined | null,
  id: string,
): AgentApiBudget | undefined {
  for (const entry of guardrails ?? []) {
    const budget = (entry as AgentGuardrail | null)?.api_budget;
    if (budget && budget.id === id) {
      return budget;
    }
  }
  return undefined;
}
