/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Decisions Catalog
 *
 * How an agent decides: the model asked typed decisions, the question
 * types it answers, the limits of one call. An agent has the capability
 * when its spec names one of these.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { DecisionsSpec } from '../types';

// ============================================================================
// Decisions Definitions
// ============================================================================

export const JEV_DECISIONS_0_0_1: DecisionsSpec = {
  id: 'jev',
  version: '0.0.1',
  name: 'Jev',
  description:
    "Typed decisions about a text, asked of Jev at Cloudflare Workers AI: does a statement hold (yes or no, with its probability), which of named options fits, or where something sits on a scale — each answered with calibrated probabilities and paid from the account's credits.",
  enabled: true,
  model: 'cloudflare:wrk/typesafe/jev',
  questions: ['noul', 'choice', 'score'],
  maxQuestions: 10,
  maxTextLength: 20000,
  tags: ['decisions', 'jev', 'cloudflare'],
  icon: '@primer/octicons-react:law',
  emoji: '⚖️',
};

// ============================================================================
// Decisions Catalog
// ============================================================================

export const DECISIONS_CATALOGUE: Record<string, DecisionsSpec> = {
  jev: JEV_DECISIONS_0_0_1,
};

function resolveDecisionsId(decisionsId: string): string {
  if (decisionsId in DECISIONS_CATALOGUE) return decisionsId;
  const idx = decisionsId.lastIndexOf(':');
  if (idx > 0) {
    const base = decisionsId.slice(0, idx);
    if (base in DECISIONS_CATALOGUE) return base;
  }
  return decisionsId;
}

/**
 * Get a decisions specification by ID (`id` or `id:version`).
 */
export function getDecisions(decisionsId: string): DecisionsSpec | undefined {
  return DECISIONS_CATALOGUE[resolveDecisionsId(decisionsId)];
}

/**
 * List all decisions specifications.
 */
export function listDecisions(): DecisionsSpec[] {
  return Object.values(DECISIONS_CATALOGUE);
}
