/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What launching a NEW code sandbox asks of the user, in one place.
 *
 * The launcher dialog and the picker both offer to start a sandbox, and both
 * used to carry their own copy of the same questions — how long to reserve,
 * whether to mount the home folder — and of the same arithmetic over the
 * credits of the account. This module is the single copy: the hook computes
 * what the account allows, the component renders the two controls, and the
 * helper turns a time limit into the credits reservation.
 *
 * @module components/code-sandboxes/NewCodeSandboxControls
 */

import type { JSX } from 'react';
import { FormControl, Link, TextInput, ToggleSwitch } from '@primer/react';
import { InfoIcon } from '@primer/octicons-react';
import { useCoreStore, useIAMStore } from '../../state/substates';
import {
  CodeSandboxReservationControl,
  MAXIMAL_CODE_SANDBOX_TIME_RESERVATION_MINUTES,
} from './CodeSandboxReservationControl';
import {
  codeSandboxAllowance,
  type INewCodeSandboxAllowance,
} from './codeSandboxAllowance';

export type { INewCodeSandboxAllowance };

/**
 * The credits arithmetic both the launcher and the picker ask.
 *
 * The arithmetic itself lives in `codeSandboxAllowance`, free of React and of
 * this module's Primer imports, so it can be read and tested on its own.
 *
 * @param burningRate Credits per second of the chosen environment
 */
export function useNewCodeSandboxAllowance(
  burningRate: number | undefined,
): INewCodeSandboxAllowance {
  const { credits, user } = useIAMStore();
  return codeSandboxAllowance({
    available: credits?.available,
    includedRuns:
      user?.subscription?.usage?.included_runs ??
      user?.subscription?.included_runs,
    currentRuns:
      user?.subscription?.usage?.current_runs ??
      user?.subscription?.current_runs ??
      user?.subscription?.used_runs,
    burningRate,
  });
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
  homeFolder: boolean;
  onHomeFolderToggle: () => void;
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
  withHomeFolder?: boolean;
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
    onHomeFolderToggle,
    storageDisabled,
    timeLimit,
    homeFolder,
    withHomeFolder = true,
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
      {withHomeFolder && !configuration.whiteLabel && (
        <FormControl disabled={storageDisabled} layout="horizontal">
          <FormControl.Label id="new-sandbox-home-folder-label">
            Mount Home Folder
            <Link
              href="/docs/contents/home-folder"
              target="_blank"
              rel="noopener noreferrer"
              // The label is a <label> for the toggle; a click on the link
              // must open the doc, not flip the switch.
              onClick={event => event.stopPropagation()}
              muted
              sx={{
                marginLeft: 2,
                fontWeight: 'normal',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <InfoIcon size={14} />
              Read more on Home Content
            </Link>
          </FormControl.Label>
          <ToggleSwitch
            disabled={storageDisabled}
            checked={homeFolder}
            size="small"
            onClick={event => {
              event.preventDefault();
              onHomeFolderToggle();
            }}
            aria-labelledby="new-sandbox-home-folder-label"
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
