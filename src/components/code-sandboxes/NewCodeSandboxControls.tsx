/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What launching a NEW code sandbox asks of the user, in one place.
 *
 * The launcher dialog and the picker both offer to start a sandbox, and both
 * used to carry their own copy of the same questions — how long to reserve,
 * whether to mount the user storage — and of the same arithmetic over the
 * credits of the account. This module is the single copy: the hook computes
 * what the account allows, the component renders the two controls, and the
 * helper turns a time limit into the credits reservation.
 *
 * @module components/code-sandboxes/NewCodeSandboxControls
 */

import {
  FormControl,
  IconButton,
  TextInput,
  ToggleSwitch,
  Tooltip,
} from '@primer/react';
import { AlertIcon } from '@primer/octicons-react';
import { useCoreStore, useIAMStore } from '../../state/substates';
import {
  CodeSandboxReservationControl,
  MAXIMAL_CODE_SANDBOX_TIME_RESERVATION_MINUTES,
} from './CodeSandboxReservationControl';

/** What the account allows for a new sandbox of a given burning rate. */
export interface INewCodeSandboxAllowance {
  /** Minutes the available credits pay for; undefined without a rate. */
  maxFromCredits?: number;
  /** The ceiling offered by the reservation control. */
  effectiveMaxMinutes: number;
  /** Whether a paid start is impossible: no runs left and no credits. */
  outOfCredits: boolean;
  hasKnownCredits: boolean;
  hasKnownRunAllowance: boolean;
  hasRemainingRuns: boolean;
}

/**
 * The credits arithmetic both the launcher and the picker ask.
 *
 * @param burningRate Credits per second of the chosen environment
 */
export function useNewCodeSandboxAllowance(
  burningRate: number | undefined,
): INewCodeSandboxAllowance {
  const { credits, user } = useIAMStore();
  const includedRuns =
    user?.subscription?.usage?.included_runs ??
    user?.subscription?.included_runs;
  const currentRuns =
    user?.subscription?.usage?.current_runs ??
    user?.subscription?.current_runs ??
    user?.subscription?.used_runs;
  const hasKnownRunAllowance = typeof includedRuns === 'number';
  const hasRemainingRuns =
    hasKnownRunAllowance &&
    typeof currentRuns === 'number' &&
    includedRuns > 0 &&
    currentRuns < includedRuns;
  const hasKnownCredits = typeof credits?.available === 'number';
  const maxFromCredits = burningRate
    ? Math.floor((credits?.available ?? 0) / burningRate / 60.0)
    : undefined;
  const effectiveMaxMinutes =
    hasKnownCredits && hasKnownRunAllowance && !hasRemainingRuns
      ? Math.max(1, maxFromCredits ?? 0)
      : Math.max(10, maxFromCredits && maxFromCredits > 0 ? maxFromCredits : 0);
  const outOfCredits =
    hasKnownCredits &&
    hasKnownRunAllowance &&
    !hasRemainingRuns &&
    ((credits?.available ?? 0) <= 0 || (maxFromCredits ?? 0) < Number.EPSILON);
  return {
    maxFromCredits,
    effectiveMaxMinutes,
    outOfCredits,
    hasKnownCredits,
    hasKnownRunAllowance,
    hasRemainingRuns,
  };
}

/** The credits a time reservation stands for. */
export function creditsLimitFor(
  timeLimitMinutes: number,
  burningRate: number,
): number {
  return (
    Math.min(timeLimitMinutes, MAXIMAL_CODE_SANDBOX_TIME_RESERVATION_MINUTES) *
    burningRate *
    60
  );
}

export interface INewCodeSandboxControlsProps {
  /** Whether the time reservation is offered; it is by default. */
  withReservation?: boolean;
  /** Credits per second of the chosen environment. */
  burningRate?: number;
  timeLimit: number;
  onTimeChange: (minutes: number) => void;
  /** The ceiling of the reservation control. */
  max: number;
  disabled?: boolean;
  error?: string;
  /** Offered next to the error when credits can be added from here. */
  addCredits?: () => void;
  userStorage: boolean;
  onUserStorageToggle: () => void;
  storageDisabled?: boolean;
  /**
   * The name the sandbox is given, when the caller asks for that question.
   *
   * A sandbox of the platform is named through `given_name`; one of a server
   * or of the browser has the name held for it by `CodeSandboxNames`. The
   * question is the same either way, so it is asked in one place.
   */
  givenName?: string;
  onGivenNameChange?: (givenName: string) => void;
  /**
   * Whether the storage of the user is offered.
   *
   * A sandbox of this Jupyter Server runs on this machine, with the files of
   * this machine: it reserves no time and mounts no storage of the platform,
   * so neither question applies to it.
   */
  withUserStorage?: boolean;
}

/**
 * The two questions of a new sandbox: the time reservation, and the storage.
 * The storage is withheld on white-label deployments, as it always was.
 */
export function NewCodeSandboxControls(
  props: INewCodeSandboxControlsProps,
): JSX.Element {
  const {
    addCredits,
    burningRate,
    withReservation = true,
    disabled,
    error,
    givenName,
    max,
    onGivenNameChange,
    onTimeChange,
    onUserStorageToggle,
    storageDisabled,
    timeLimit,
    userStorage,
    withUserStorage = true,
  } = props;
  const { configuration } = useCoreStore();
  return (
    <>
      {withReservation && (
        <CodeSandboxReservationControl
          addCredits={addCredits}
          disabled={disabled}
          label={'Time reservation'}
          max={max}
          time={timeLimit}
          burningRate={burningRate}
          onTimeChange={onTimeChange}
          error={error}
        />
      )}
      {withUserStorage && !configuration.whiteLabel && (
        <FormControl disabled={storageDisabled} layout="horizontal">
          <FormControl.Label id="new-sandbox-user-storage-label">
            User storage
            <Tooltip
              text="The runtime will be slower to start."
              direction="e"
              style={{ marginLeft: 3 }}
            >
              <IconButton icon={AlertIcon} aria-label="" variant="invisible" />
            </Tooltip>
          </FormControl.Label>
          <ToggleSwitch
            disabled={storageDisabled}
            checked={userStorage}
            size="small"
            onClick={event => {
              event.preventDefault();
              onUserStorageToggle();
            }}
            aria-labelledby="new-sandbox-user-storage-label"
          />
        </FormControl>
      )}
      {/*
        Last of the controls, as in the launcher, which renders its own name
        field after this block. What the sandbox will be CALLED is the least
        of the choices — the environment and the time reserved decide what it
        costs — and asking it first pushed them below the fold of the dialog.
      */}
      {onGivenNameChange && (
        <FormControl disabled={disabled}>
          <FormControl.Label>Given Name</FormControl.Label>
          <TextInput
            block
            name="given-name"
            value={givenName ?? ''}
            onChange={event => onGivenNameChange(event.target.value)}
          />
          <FormControl.Caption>
            What this sandbox is called, wherever it is listed.
          </FormControl.Caption>
        </FormControl>
      )}
    </>
  );
}
