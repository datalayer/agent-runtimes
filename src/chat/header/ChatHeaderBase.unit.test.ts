/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect } from 'vitest';
import { toRuntimeExecutionState } from './ChatHeaderBase';

describe('toRuntimeExecutionState', () => {
  it('returns undefined when runtime status is missing', () => {
    expect(toRuntimeExecutionState(undefined)).toBeUndefined();
    expect(toRuntimeExecutionState(null)).toBeUndefined();
  });

  it('maps unavailable/error runtime variants to undefined', () => {
    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'unavailable',
        sandbox_running: true,
        is_executing: false,
      }),
    ).toBeUndefined();

    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'error',
        sandbox_running: true,
        is_executing: false,
      }),
    ).toBeUndefined();
  });

  it('maps unavailable sandbox status to undefined', () => {
    expect(
      toRuntimeExecutionState({
        available: false,
        variant: 'idle',
        sandbox_running: true,
        is_executing: false,
      }),
    ).toBeUndefined();
  });

  it('maps stopped sandbox to disconnected', () => {
    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'stopped',
        sandbox_running: false,
        is_executing: false,
      }),
    ).toBe('disconnected');
  });

  it('maps executing sandbox to connected-busy', () => {
    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'executing',
        sandbox_running: true,
        is_executing: true,
      }),
    ).toBe('connected-busy');
  });

  it('maps running non-executing sandbox to connected-idle', () => {
    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'idle',
        sandbox_running: true,
        is_executing: false,
      }),
    ).toBe('connected-idle');
  });

  it('falls back to undefined for incomplete status payloads', () => {
    expect(
      toRuntimeExecutionState({
        available: true,
        variant: 'idle',
      }),
    ).toBeUndefined();
  });
});
