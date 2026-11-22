/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where the example runs — Browser, Local, Jupyter, Datalayer — in the
 * examples' header, on every example (the user, 22 November 2026: "every
 * example must show the runtime selector"). One control for the page: an
 * example reads the choice (`useRuntimeTargetStore`) and brings none of its
 * own. A target the example cannot run on is shown disabled, why in its
 * tooltip (`ExampleEntry.unavailableTargets`); one that needs an account is
 * disabled until the person signs in.
 *
 * @module examples/components/ExampleRuntimeSelector
 */

import type { JSX } from 'react';
import { SegmentedControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  RUNTIME_TARGETS,
  runtimeTargetCapabilities,
  type ExampleRuntimeTarget,
} from '../utils/runtimeTargetStore';

export type ExampleRuntimeSelectorProps = {
  /** The target chosen. */
  target: ExampleRuntimeTarget;
  /** Whether the person is signed in: the targets that need it are disabled otherwise. */
  signedIn: boolean;
  /** The targets this example cannot run on, each with why. */
  unavailable?: Partial<Record<ExampleRuntimeTarget, string>>;
  /** Every target off (the home page, an example still loading). */
  disabled?: boolean;
  /** Dimmed while nothing can be chosen. */
  dimmed?: boolean;
  onChange: (target: ExampleRuntimeTarget) => void;
};

/** Why a target cannot be chosen here, or none. */
export function unavailableReason(
  target: ExampleRuntimeTarget,
  {
    signedIn,
    unavailable,
  }: Pick<ExampleRuntimeSelectorProps, 'signedIn' | 'unavailable'>,
): string | undefined {
  const capabilities = runtimeTargetCapabilities(target);
  if (unavailable?.[target]) {
    return `Not for this example: ${unavailable[target]}`;
  }
  if (capabilities.requiresAuth && !signedIn) {
    return 'Sign in to use it.';
  }
  return undefined;
}

export function ExampleRuntimeSelector({
  target,
  signedIn,
  unavailable,
  disabled = false,
  dimmed = false,
  onChange,
}: ExampleRuntimeSelectorProps): JSX.Element {
  return (
    <Box
      minWidth="320px"
      opacity={dimmed ? 0.6 : 1}
      data-example-runtime-selector=""
    >
      <SegmentedControl
        aria-label="Where the example runs"
        fullWidth
        size="small"
      >
        {RUNTIME_TARGETS.map(each => {
          const capabilities = runtimeTargetCapabilities(each);
          const reason = unavailableReason(each, { signedIn, unavailable });
          const off = disabled || Boolean(reason);
          return (
            <SegmentedControl.Button
              key={each}
              selected={target === each}
              disabled={off}
              title={
                reason ? `${capabilities.hint} ${reason}` : capabilities.hint
              }
              data-example-runtime-target={each}
              onClick={() => {
                if (!off) {
                  onChange(each);
                }
              }}
            >
              {capabilities.label}
            </SegmentedControl.Button>
          );
        })}
      </SegmentedControl>
    </Box>
  );
}

export default ExampleRuntimeSelector;
