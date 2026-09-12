/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How long a new Code Sandbox may be reserved for, and whether it may start.
 *
 * Separated from the control that renders it so it can be read and tested as
 * what it is: arithmetic over a balance, a plan's run allowance and the
 * burning rate of an environment. The launcher and the picker both ask it,
 * and must get the same answer.
 */

/** What the account allows for a new sandbox of a given burning rate. */
export interface INewCodeSandboxAllowance {
  /** Minutes the available credits pay for; undefined without a usable rate. */
  maxFromCredits?: number;
  /** The ceiling offered by the reservation control. */
  effectiveMaxMinutes: number;
  /** Whether a paid start is impossible: no runs left and no credits. */
  outOfCredits: boolean;
  hasKnownCredits: boolean;
  hasKnownRunAllowance: boolean;
  hasRemainingRuns: boolean;
}

/** What a reservation is offered before any credits are known. */
export const DEFAULT_MINUTES_FLOOR = 10;

export interface ICodeSandboxAllowanceInput {
  /** Credits the account can still commit. */
  available?: number;
  /** Runs the plan includes, when it counts runs. */
  includedRuns?: number;
  /** Runs already taken from that allowance. */
  currentRuns?: number;
  /** Credits per second of the chosen environment. */
  burningRate?: number;
}

export function codeSandboxAllowance({
  available,
  includedRuns,
  currentRuns,
  burningRate,
}: ICodeSandboxAllowanceInput): INewCodeSandboxAllowance {
  const hasKnownRunAllowance = typeof includedRuns === 'number';
  const hasRemainingRuns =
    hasKnownRunAllowance &&
    typeof currentRuns === 'number' &&
    includedRuns > 0 &&
    currentRuns < includedRuns;
  /*
   * Finite, not merely a number: `NaN` is a `number`, and reading it as a
   * known balance is how an account holding thousands of credits was offered
   * the ten-minute floor. Unknown is unknown, and says so.
   */
  const hasKnownCredits = Number.isFinite(available);
  const maxFromCredits =
    burningRate && burningRate > 0 && hasKnownCredits
      ? Math.floor((available ?? 0) / burningRate / 60.0)
      : undefined;
  const effectiveMaxMinutes =
    hasKnownCredits && hasKnownRunAllowance && !hasRemainingRuns
      ? Math.max(1, maxFromCredits ?? 0)
      : Math.max(
          DEFAULT_MINUTES_FLOOR,
          maxFromCredits && maxFromCredits > 0 ? maxFromCredits : 0,
        );
  const outOfCredits =
    hasKnownCredits &&
    hasKnownRunAllowance &&
    !hasRemainingRuns &&
    ((available ?? 0) <= 0 || (maxFromCredits ?? 0) < Number.EPSILON);
  return {
    maxFromCredits,
    effectiveMaxMinutes,
    outOfCredits,
    hasKnownCredits,
    hasKnownRunAllowance,
    hasRemainingRuns,
  };
}
