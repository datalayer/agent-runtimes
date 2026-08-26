/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINUTES_FLOOR,
  codeSandboxAllowance,
} from '../codeSandboxAllowance';

/** A cheap environment: 0.0008 credits per second. */
const RATE = 0.0008;

describe('codeSandboxAllowance', () => {
  it('offers what the credits actually pay for', () => {
    const allowance = codeSandboxAllowance({
      available: 13495.734,
      burningRate: RATE,
    });

    expect(allowance.maxFromCredits).toBe(Math.floor(13495.734 / RATE / 60));
    expect(allowance.effectiveMaxMinutes).toBe(allowance.maxFromCredits);
    expect(allowance.effectiveMaxMinutes).toBeGreaterThan(DEFAULT_MINUTES_FLOOR);
  });

  it('does not read an unusable balance as a known one', () => {
    /*
     * The bug the launcher showed. `NaN` is a `number`, so a balance that had
     * gone bad upstream was read as known, floored to zero, and the slider
     * fell back to ten minutes for an account holding thousands of credits.
     */
    const allowance = codeSandboxAllowance({
      available: Number.NaN,
      burningRate: RATE,
    });

    expect(allowance.hasKnownCredits).toBe(false);
    expect(allowance.maxFromCredits).toBeUndefined();
  });

  it('offers nothing from credits until a rate is known', () => {
    expect(
      codeSandboxAllowance({ available: 1000 }).maxFromCredits,
    ).toBeUndefined();
    expect(
      codeSandboxAllowance({ available: 1000, burningRate: 0 }).maxFromCredits,
    ).toBeUndefined();
  });

  it('keeps the floor while the credits are still unknown', () => {
    expect(
      codeSandboxAllowance({ burningRate: RATE }).effectiveMaxMinutes,
    ).toBe(DEFAULT_MINUTES_FLOOR);
  });

  it('drops to what the credits pay for once the included runs are spent', () => {
    const allowance = codeSandboxAllowance({
      available: 1,
      includedRuns: 5,
      currentRuns: 5,
      burningRate: RATE,
    });

    // No free run left, so the floor no longer applies: the ceiling is the
    // balance, which here is under ten minutes.
    expect(allowance.hasRemainingRuns).toBe(false);
    expect(allowance.effectiveMaxMinutes).toBe(Math.floor(1 / RATE / 60));
    expect(allowance.effectiveMaxMinutes).toBeLessThan(DEFAULT_MINUTES_FLOOR);
  });

  it('is out of credits only with no runs left and nothing to spend', () => {
    expect(
      codeSandboxAllowance({
        available: 0,
        includedRuns: 5,
        currentRuns: 5,
        burningRate: RATE,
      }).outOfCredits,
    ).toBe(true);
    // A run still included is a start, whatever the balance says.
    expect(
      codeSandboxAllowance({
        available: 0,
        includedRuns: 5,
        currentRuns: 1,
        burningRate: RATE,
      }).outOfCredits,
    ).toBe(false);
    // A plan that does not count runs never blocks on them.
    expect(
      codeSandboxAllowance({ available: 0, burningRate: RATE }).outOfCredits,
    ).toBe(false);
  });
});
