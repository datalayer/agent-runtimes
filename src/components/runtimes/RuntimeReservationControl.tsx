/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { FormControl, IconButton, Text, TextInput } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { PlusIcon } from '@primer/octicons-react';
import { Slider } from '@datalayer/primer-addons';

/**
 * Maximal time reservable for a runtime in minutes.
 *
 * TODO this should be configurable
 */
export const MAXIMAL_RUNTIME_TIME_RESERVATION_MINUTES = 24 * 60;

/**
 * Time control properties
 */
export interface IKernelReservationControlProps {
  /**
   * Callback on add credits button
   */
  addCredits?: () => void;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Control error message
   */
  error?: string;
  /**
   * Control label
   */
  label: string;
  /**
   * Maximal time
   */
  max: number;
  /**
   * Callback when time value changes
   */
  onTimeChange: (value: number) => void;
  /**
   * Time control value
   */
  time: number;
  /**
   * Burning rate
   */
  burningRate?: number;
}

/**
 * Runtime reservation control
 */
export function RuntimeReservationControl(
  props: IKernelReservationControlProps,
): JSX.Element {
  const {
    addCredits,
    burningRate,
    disabled,
    error,
    label,
    max: maxProps,
    onTimeChange,
    time,
  } = props;
  const max = Math.max(
    1,
    Math.min(maxProps, MAXIMAL_RUNTIME_TIME_RESERVATION_MINUTES),
  );
  const displayedTime = Number.isFinite(time)
    ? Math.min(max, Math.max(1, time))
    : 1;
  const handleTimeChange = (valueOrEvent: any) => {
    const rawValue =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : parseFloat(valueOrEvent?.target?.value);
    if (Number.isFinite(rawValue)) {
      onTimeChange(Math.min(max, Math.max(1, rawValue)));
    }
  };
  // Temporary workaround to not show disabled components.
  const hidden = disabled;
  return !hidden ? (
    <FormControl
      disabled={disabled}
      sx={{ paddingBottom: 'var(--stack-padding-condensed)' }}
    >
      <FormControl.Label>{label}</FormControl.Label>
      <Box
        style={{
          alignItems: 'center',
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr max-content max-content',
          gridGap: 'var(--stack-gap-condensed)',
          width: '100%',
        }}
      >
        <Slider
          step={1}
          min={1}
          max={max}
          value={displayedTime}
          onChange={handleTimeChange}
          disabled={disabled}
          label=""
          displayValue={false}
        />
        <TextInput
          type="number"
          step="1"
          min="1"
          max={max}
          disabled={disabled}
          value={displayedTime.toFixed(2)}
          onChange={handleTimeChange}
        />
        {(max === 0 || max > Number.EPSILON) && (
          <>
            <Text>out of {maxProps} available minutes</Text>
            {addCredits && (
              <IconButton
                icon={PlusIcon}
                aria-label="Add credits"
                onClick={() => addCredits()}
              />
            )}
          </>
        )}
      </Box>
      <FormControl.Caption>
        Maximum execution time that can be consumed by the runtime. It must be
        less than {(MAXIMAL_RUNTIME_TIME_RESERVATION_MINUTES / 60).toFixed(0)}{' '}
        hours.
        {burningRate && (
          <>
            <br />
            {`With the current value, the runtime execution will consume at most ${(time * burningRate * 60).toFixed(2)} credits.`}
          </>
        )}
      </FormControl.Caption>
      {error && (
        <FormControl.Validation variant="error">{error}</FormControl.Validation>
      )}
    </FormControl>
  ) : (
    <></>
  );
}
