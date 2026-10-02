/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Track Catalog.
 *
 * What evidence a run keeps, for how long, and who may read it.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { TrackSpec } from '../types/agentspecs';

export const FINANCIAL_REPORTING_TRACK_0_0_1: TrackSpec = {
  id: 'financial-reporting',
  version: '0.0.1',
  name: 'Financial Reporting Track',
  description:
    'The complete record of an Op that produces financial reporting: every input and source, every model and setting, every Guard result, Gate decision, approval and edit. Kept seven years, readable by Finance and by audit, and fed back to Organizational Memory.',
  retainFor: '7_years',
  include: [
    'op',
    'frames_used',
    'cogs_invoked',
    'input_data',
    'source_documents',
    'model_versions',
    'configuration',
    'guard_results',
    'gate_decisions',
    'human_approvals',
    'human_edits',
    'final_output',
    'actions_taken',
    'timestamps',
    'user_identity',
    'permissions',
    'environment',
    'memory_links',
  ],
  readers: ['finance', 'internal-audit'],
  redact: ['*Password*', '*Secret*', '*Token*', '*IBAN*'],
  feedsMemory: true,
  exchangeable: false,
  enabled: true,
  tags: ['finance', 'audit'],
  icon: 'log',
  emoji: '🧾',
  retentionDays: 2555,
};

export const STANDARD_TRACK_0_0_1: TrackSpec = {
  id: 'standard',
  version: '0.0.1',
  name: 'Standard Track',
  description:
    'The record of an ordinary Op: what ran, under which Frames, what the Guards found and the Gates decided, and what was produced. Kept one year.',
  retainFor: '1_years',
  include: [
    'op',
    'frames_used',
    'cogs_invoked',
    'model_versions',
    'guard_results',
    'gate_decisions',
    'human_approvals',
    'final_output',
    'timestamps',
    'user_identity',
  ],
  readers: [],
  redact: ['*Password*', '*Secret*', '*Token*'],
  feedsMemory: false,
  exchangeable: false,
  enabled: true,
  tags: ['default'],
  icon: 'log',
  emoji: '🧾',
  retentionDays: 365,
};

export const TRACK_CATALOGUE: Record<string, TrackSpec> = {
  'financial-reporting': FINANCIAL_REPORTING_TRACK_0_0_1,
  standard: STANDARD_TRACK_0_0_1,
};

/** A Track, by `id` or `id:version`, or undefined. */
export function getTrack(ref: string): TrackSpec | undefined {
  // Own entries only: `constructor` and `toString` are not Tracks.
  const own = (id: string): TrackSpec | undefined =>
    Object.prototype.hasOwnProperty.call(TRACK_CATALOGUE, id)
      ? TRACK_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

export function listTracks(): TrackSpec[] {
  return Object.values(TRACK_CATALOGUE);
}
