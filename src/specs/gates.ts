/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Gate Catalog.
 *
 * Decision points: what happens on what the Guards found.
 * Guards check; Gates decide.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { GateSpec } from '../types/agentspecs';

export const CONFIGURATION_CHECK_GATE_0_0_1: GateSpec = {
  id: 'configuration-check',
  version: '0.0.1',
  name: 'Configuration Check',
  description:
    'Stops an Op before it starts when a Frame it requires is missing, a permission is not granted or a data source is not authorized.',
  stage: 'preflight',
  guards: [
    'required-frame-guard:0.0.1',
    'permission-guard:0.0.1',
    'data-source-authorization-guard:0.0.1',
  ],
  when: 'frames_missing or permission_denied or unauthorized_source',
  then: 'stop_and_escalate',
  otherwise: 'proceed',
  reviewers: ['op-owner'],
  maxRetries: 0,
  enabled: true,
  tags: ['preflight'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['frames_missing', 'permission_denied', 'unauthorized_source'],
};

export const CONSENSUS_DISAGREEMENT_REVIEW_GATE_0_0_1: GateSpec = {
  id: 'consensus-disagreement-review',
  version: '0.0.1',
  name: 'Consensus Disagreement Review',
  description:
    'Escalates to an expert when independent recomputations disagree on more than a quarter of the key figures.',
  stage: 'post_run',
  guards: ['consensus-guard:0.0.1'],
  when: 'consensus_disagreement > 0.25',
  then: 'expert_review_required',
  otherwise: 'proceed',
  reviewers: ['subject-matter-expert'],
  maxRetries: 0,
  enabled: true,
  tags: ['consensus'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['consensus_disagreement'],
};

export const LOW_CONFIDENCE_REVIEW_GATE_0_0_1: GateSpec = {
  id: 'low-confidence-review',
  version: '0.0.1',
  name: 'Low Confidence Review',
  description:
    'Routes the output to human review when the lowest confidence a Cog reported is under 0.80. Low confidence is not a failure: it is where the autonomy granted to the Op ends.',
  stage: 'post_run',
  guards: ['confidence-guard:0.0.1'],
  when: 'confidence < 0.80',
  then: 'human_review_required',
  otherwise: 'proceed',
  reviewers: ['op-owner'],
  maxRetries: 0,
  enabled: true,
  tags: ['confidence', 'human-in-the-loop'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['confidence'],
};

export const QUALITY_DRIFT_REVIEW_GATE_0_0_1: GateSpec = {
  id: 'quality-drift-review',
  version: '0.0.1',
  name: 'Quality Drift Review',
  description:
    'Puts the Op before an expert when more than one golden run in ten changed after an update, or when the Op missed its outcome goal over the review period.',
  stage: 'continuous',
  guards: ['regression-guard:0.0.1', 'outcome-guard:0.0.1'],
  when: 'regression_rate > 0.10 or outcome_met == false',
  then: 'expert_review_required',
  otherwise: 'proceed',
  reviewers: ['op-owner', 'subject-matter-expert'],
  maxRetries: 0,
  enabled: true,
  tags: ['drift', 'outcome'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['regression_rate', 'outcome_met'],
};

export const RELEASE_APPROVAL_GATE_0_0_1: GateSpec = {
  id: 'release-approval',
  version: '0.0.1',
  name: 'Release Approval',
  description:
    "Requires a person to approve the output before it is released to its audience, whatever the Guards found. The expert's review is recorded beside the approval.",
  stage: 'post_run',
  guards: ['expert-sampling-guard:0.0.1'],
  when: 'always',
  then: 'human_approval_required',
  otherwise: 'stop',
  reviewers: ['op-owner', 'finance'],
  maxRetries: 0,
  enabled: true,
  tags: ['approval', 'human-in-the-loop'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: [],
};

export const SENSITIVE_DATA_STOP_GATE_0_0_1: GateSpec = {
  id: 'sensitive-data-stop',
  version: '0.0.1',
  name: 'Sensitive Data Stop',
  description:
    'Stops the Op and tells the data protection officer when sensitive data is detected in what a Cog is about to send out, or in the output.',
  stage: 'in_flight',
  guards: ['sensitive-data-guard:0.0.1'],
  when: 'sensitive_data_detected',
  then: 'stop_and_escalate',
  otherwise: 'proceed',
  reviewers: ['data-protection-officer'],
  maxRetries: 0,
  enabled: true,
  tags: ['privacy'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['sensitive_data_detected'],
};

export const TOOL_VIOLATION_RETRY_GATE_0_0_1: GateSpec = {
  id: 'tool-violation-retry',
  version: '0.0.1',
  name: 'Tool Violation Retry',
  description:
    'Sends a step back to its Cog when it called a tool it does not declare or exceeded a tool limit; after the retries are used up the Op stops.',
  stage: 'in_flight',
  guards: ['tool-use-policy-guard:0.0.1'],
  when: 'tool_violation',
  then: 'retry',
  otherwise: 'proceed',
  reviewers: [],
  maxRetries: 2,
  enabled: true,
  tags: ['tools'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['tool_violation'],
};

export const UNSUPPORTED_CLAIMS_REVISION_GATE_0_0_1: GateSpec = {
  id: 'unsupported-claims-revision',
  version: '0.0.1',
  name: 'Unsupported Claims Revision',
  description:
    'Pauses the Op and asks for a revision when the output is not valid against its schema or carries a claim or a figure its sources do not support.',
  stage: 'post_run',
  guards: ['schema-guard:0.0.1', 'source-grounding-guard:0.0.1'],
  when: 'schema_valid == false or unsupported_claims > 0',
  then: 'pause',
  otherwise: 'proceed',
  reviewers: [],
  maxRetries: 0,
  enabled: true,
  tags: ['evidence'],
  icon: 'git-branch',
  emoji: '🚦',
  signals: ['schema_valid', 'unsupported_claims'],
};

export const GATE_CATALOGUE: Record<string, GateSpec> = {
  'configuration-check': CONFIGURATION_CHECK_GATE_0_0_1,
  'consensus-disagreement-review': CONSENSUS_DISAGREEMENT_REVIEW_GATE_0_0_1,
  'low-confidence-review': LOW_CONFIDENCE_REVIEW_GATE_0_0_1,
  'quality-drift-review': QUALITY_DRIFT_REVIEW_GATE_0_0_1,
  'release-approval': RELEASE_APPROVAL_GATE_0_0_1,
  'sensitive-data-stop': SENSITIVE_DATA_STOP_GATE_0_0_1,
  'tool-violation-retry': TOOL_VIOLATION_RETRY_GATE_0_0_1,
  'unsupported-claims-revision': UNSUPPORTED_CLAIMS_REVISION_GATE_0_0_1,
};

/** A Gate, by `id` or `id:version`, or undefined. */
export function getGate(ref: string): GateSpec | undefined {
  // Own entries only: `constructor` and `toString` are not Gates.
  const own = (id: string): GateSpec | undefined =>
    Object.prototype.hasOwnProperty.call(GATE_CATALOGUE, id)
      ? GATE_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

export function listGates(): GateSpec[] {
  return Object.values(GATE_CATALOGUE);
}
