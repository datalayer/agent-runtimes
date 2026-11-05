/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Guard Catalog.
 *
 * Reusable checks: a Guard extends a Policy — the rules it verifies.
 * Every Guard is resolved: `policy` names that Policy, `id:version`, and
 * `policy_of` gives it from the policies catalogue.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { GuardSpec, PolicySpec } from '../types/agentspecs';
import { POLICY_CATALOGUE } from './policies';

export const CONFIDENCE_GUARD_0_0_1: GuardSpec = {
  id: 'confidence-guard',
  version: '0.0.1',
  name: 'Confidence Guard',
  description:
    'Collects the confidence each Cog reports on its result, and the lowest of them for the run, so that a Gate can route unsure work to a person.',
  category: 'algorithmic',
  stages: ['in_flight', 'post_run'],
  method: 'algorithmic',
  check:
    'Each Cog result carries a confidence between 0 and 1; the Guard reports the lowest, and fails when a result carries none.',
  signals: [
    {
      name: 'confidence',
      type: 'number',
      description: 'The lowest confidence a Cog reported, between 0 and 1.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['confidence'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const CONSENSUS_GUARD_0_0_1: GuardSpec = {
  id: 'consensus-guard',
  version: '0.0.1',
  name: 'Consensus Guard',
  description:
    'Recomputes the key figures by an independent path — another Cog, or the same Cog on another model — and measures how far the two disagree.',
  category: 'consensus',
  stages: ['post_run'],
  method: 'cog',
  check:
    'The key figures of the output are recomputed independently; the Guard reports the share of them on which the two paths disagree.',
  signals: [
    {
      name: 'consensus_disagreement',
      type: 'number',
      description:
        'The share of key figures on which independent paths disagree, between 0 and 1.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['consensus', 'verification'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const DATA_SOURCE_AUTHORIZATION_GUARD_0_0_1: GuardSpec = {
  id: 'data-source-authorization-guard',
  version: '0.0.1',
  name: 'Data Source Authorization Guard',
  description:
    'Checks that each system the Op is about to read is one the Policy lends it, and that reading what it reads is not something the Policy denies.',
  category: 'policy-safety',
  stages: ['preflight'],
  method: 'algorithmic',
  check:
    "Every MCP server the run connects to is among those the Policy lends (`mcp.allow`; a Policy lending none by name lends every one), and reading each document and Space the run names is not denied by the Policy's rules.",
  signals: [
    {
      name: 'unauthorized_source',
      type: 'boolean',
      description: 'A data source outside the allowed scope is requested.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['data', 'authorization'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const EXPERT_SAMPLING_GUARD_0_0_1: GuardSpec = {
  id: 'expert-sampling-guard',
  version: '0.0.1',
  name: 'Expert Sampling Guard',
  description:
    'Routes the output — every one of a high-risk Op, a sample of the others — to a named expert, and records what they decided.',
  category: 'expert',
  stages: ['post_run'],
  method: 'human',
  check:
    'An expert in the subject reads the output and its evidence, and approves it, edits it or sends it back.',
  signals: [
    {
      name: 'expert_approved',
      type: 'boolean',
      description: 'The expert approved the output.',
    },
    {
      name: 'high_risk',
      type: 'boolean',
      description:
        'The output is of a kind every instance of which is reviewed.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['expert', 'review'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const OUTCOME_GUARD_0_0_1: GuardSpec = {
  id: 'outcome-guard',
  version: '0.0.1',
  name: 'Outcome Guard',
  description:
    "Measures, over time, whether the Op's outputs are used as intended: accepted without rework, on time, with the decision they were made for taken.",
  category: 'outcome',
  stages: ['continuous'],
  method: 'human',
  check:
    "Over the review period, the share of outputs accepted without rework by the people they were produced for meets the Op's goal.",
  signals: [
    {
      name: 'outcome_met',
      type: 'boolean',
      description: 'The Op met its outcome goal over the review period.',
    },
  ],
  required: false,
  enabled: true,
  tags: ['outcome', 'value'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const PERMISSION_GUARD_0_0_1: GuardSpec = {
  id: 'permission-guard',
  version: '0.0.1',
  name: 'Permission Guard',
  description:
    "Checks that the person or the system launching the Op may do what the Op's Cogs do, by the rules of the Policy it extends.",
  category: 'policy-safety',
  stages: ['preflight'],
  method: 'algorithmic',
  check:
    "Each class of action the Op's Cogs take — read, write, delete, execute, send, buy — is one the Policy's rules allow or ask about for the launching identity; none is a class the Policy denies, or needs an authorization the identity does not hold.",
  signals: [
    {
      name: 'permission_denied',
      type: 'boolean',
      description: 'A permission the Op needs is not granted.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['permissions', 'identity'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const REGRESSION_GUARD_0_0_1: GuardSpec = {
  id: 'regression-guard',
  version: '0.0.1',
  name: 'Regression Guard',
  description:
    'Replays a golden set of past runs after a model, a Frame, a Cog or the Op itself changes, and compares the results with the validated ones.',
  category: 'regression-drift',
  stages: ['continuous'],
  method: 'algorithmic',
  check:
    "On the golden set, the share of runs whose output departs from the validated one stays under the threshold the Op's owner set.",
  signals: [
    {
      name: 'regression_rate',
      type: 'number',
      description:
        'The share of golden runs whose output changed, between 0 and 1.',
    },
  ],
  required: false,
  enabled: true,
  tags: ['regression', 'drift'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const REQUIRED_FRAME_GUARD_0_0_1: GuardSpec = {
  id: 'required-frame-guard',
  version: '0.0.1',
  name: 'Required Frame Guard',
  description:
    "Checks, before any work starts, that every Frame the Op and its Cogs declare exists, is enabled and has been applied to the Cogs' context.",
  category: 'policy-safety',
  stages: ['preflight'],
  method: 'algorithmic',
  check:
    'Every Frame named by the Op and by its Cogs resolves, is enabled, and appears in the context each Cog was given.',
  signals: [
    {
      name: 'frames_missing',
      type: 'boolean',
      description: 'A declared Frame is absent, disabled or was not applied.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['frames', 'configuration'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const SCHEMA_GUARD_0_0_1: GuardSpec = {
  id: 'schema-guard',
  version: '0.0.1',
  name: 'Schema Guard',
  description:
    "Validates the structure of the output against the schema the Op's output declares: required sections, fields, types.",
  category: 'algorithmic',
  stages: ['post_run'],
  method: 'algorithmic',
  check:
    'The output validates against its declared schema: every required section and field is present and of the declared type.',
  signals: [
    {
      name: 'schema_valid',
      type: 'boolean',
      description: 'The output conforms to its schema.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['schema', 'structure'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const SENSITIVE_DATA_GUARD_0_0_1: GuardSpec = {
  id: 'sensitive-data-guard',
  version: '0.0.1',
  name: 'Sensitive Data Guard',
  description:
    'Detects credentials and personal data in what a Cog is about to send out, and in the final output.',
  category: 'policy-safety',
  stages: ['in_flight', 'post_run'],
  method: 'algorithmic',
  check:
    'No output, tool argument or outbound message contains a credential or personal data.',
  signals: [
    {
      name: 'sensitive_data_detected',
      type: 'boolean',
      description: 'Sensitive data was found where it must not be.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['privacy', 'pii', 'secrets'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'organization-baseline:0.0.1',
};

export const SOURCE_GROUNDING_GUARD_0_0_1: GuardSpec = {
  id: 'source-grounding-guard',
  version: '0.0.1',
  name: 'Source Grounding Guard',
  description:
    'Checks each claim and each figure of the output against the sources and the computations the run used: a figure traces to the code that produced it.',
  category: 'source-grounding',
  stages: ['post_run'],
  method: 'cog',
  check:
    'Every factual claim cites a source that supports it, and every figure equals the value computed in the sandbox from the authorized data.',
  signals: [
    {
      name: 'unsupported_claims',
      type: 'number',
      description:
        'How many claims or figures have no supporting source or computation.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['sources', 'evidence'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const TOOL_USE_POLICY_GUARD_0_0_1: GuardSpec = {
  id: 'tool-use-policy-guard',
  version: '0.0.1',
  name: 'Tool Use Policy Guard',
  description:
    "Watches each tool call a Cog makes: the tool is one the Cog declares, and the calls stay within the Policy's limits.",
  category: 'policy-safety',
  stages: ['in_flight'],
  method: 'algorithmic',
  check:
    "Every tool called is declared by the calling Cog; the number of calls stays within the Policy's `tool_calls` limit.",
  signals: [
    {
      name: 'tool_violation',
      type: 'boolean',
      description:
        'An undeclared tool was called, or a tool limit was exceeded.',
    },
  ],
  required: true,
  enabled: true,
  tags: ['tools', 'limits'],
  icon: 'shield-check',
  emoji: '🛡️',
  policy: 'default:0.0.1',
};

export const GUARD_CATALOGUE: Record<string, GuardSpec> = {
  'confidence-guard': CONFIDENCE_GUARD_0_0_1,
  'consensus-guard': CONSENSUS_GUARD_0_0_1,
  'data-source-authorization-guard': DATA_SOURCE_AUTHORIZATION_GUARD_0_0_1,
  'expert-sampling-guard': EXPERT_SAMPLING_GUARD_0_0_1,
  'outcome-guard': OUTCOME_GUARD_0_0_1,
  'permission-guard': PERMISSION_GUARD_0_0_1,
  'regression-guard': REGRESSION_GUARD_0_0_1,
  'required-frame-guard': REQUIRED_FRAME_GUARD_0_0_1,
  'schema-guard': SCHEMA_GUARD_0_0_1,
  'sensitive-data-guard': SENSITIVE_DATA_GUARD_0_0_1,
  'source-grounding-guard': SOURCE_GROUNDING_GUARD_0_0_1,
  'tool-use-policy-guard': TOOL_USE_POLICY_GUARD_0_0_1,
};

/** A Guard, by `id` or `id:version`, or undefined. */
export function getGuard(ref: string): GuardSpec | undefined {
  // Own entries only: `constructor` and `toString` are not Guards.
  const own = (id: string): GuardSpec | undefined =>
    Object.prototype.hasOwnProperty.call(GUARD_CATALOGUE, id)
      ? GUARD_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

export function listGuards(): GuardSpec[] {
  return Object.values(GUARD_CATALOGUE);
}

/**
 * The Policy a Guard extends, from the policies catalogue. Thrown when the
 * catalogue does not hold it: a Guard names a Policy that exists, at the
 * version the catalogue has.
 */
export function policyOf(guard: GuardSpec): PolicySpec {
  const at = guard.policy.lastIndexOf(':');
  const id = at > 0 ? guard.policy.slice(0, at) : guard.policy;
  const version = at > 0 ? guard.policy.slice(at + 1) : '';
  const policy = Object.prototype.hasOwnProperty.call(POLICY_CATALOGUE, id)
    ? POLICY_CATALOGUE[id]
    : undefined;
  if (policy === undefined || policy.version !== version) {
    throw new Error(
      `Guard '${guard.id}' extends '${guard.policy}', which is not a Policy of the catalogue`,
    );
  }
  return policy;
}
