/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import { launchFailureReason } from '../launchFailure';

/**
 * The launcher names the error under its sentence: a bare "Failed to create
 * the remote runtime…" stood over a launch the browser had cut while the
 * platform created the runtime (the user, 21 November 2026).
 */
describe('launchFailureReason', () => {
  it('says a request that got no answer as fetch says it', () => {
    const cut = new TypeError('Failed to fetch');
    cut.name = 'NetworkError';
    expect(launchFailureReason(cut)).toBe('Failed to fetch');
  });

  it('puts the status the platform answered before its message', () => {
    const refused = Object.assign(new Error('Environment unknown'), {
      response: { status: 422 },
    });
    expect(launchFailureReason(refused)).toBe('422 Environment unknown');
  });

  it('says nothing of an error that says nothing', () => {
    expect(launchFailureReason(undefined)).toBe('');
    expect(launchFailureReason(new Error(''))).toBe('');
    expect(launchFailureReason('timeout')).toBe('timeout');
  });
});
