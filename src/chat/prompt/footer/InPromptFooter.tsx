/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The region inside the prompt box, below the input.
 *
 * Its last band is the one the prompt always has: a left slot for dropdowns
 * and indicators, and the submit / stop button on the right. Bands declared by
 * the caller are stacked above it, so a host can put something between the
 * input and the send button without this component knowing what it is.
 *
 * What sits *under* the box is `BelowPromptFooter`, which is a different
 * region with different rules — see `chat/prompt/stack`.
 *
 * @module chat/prompt/footer/InPromptFooter
 */

import type { ReactNode } from 'react';
import { IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  PaperAirplaneIcon,
  SquareCircleIcon,
  PauseIcon,
} from '@primer/octicons-react';
import { PromptStacks, type PromptStack } from '../stack';

export interface InPromptFooterProps {
  /** Bands above the control band. */
  stacks?: readonly PromptStack[];
  /** Content on the left of the control band (dropdowns, indicators). */
  children?: ReactNode;
  /** Content on the right, just before the send / stop button. */
  rightContent?: ReactNode;
  /** Whether the agent is loading / streaming. */
  isLoading?: boolean;
  /** Whether the send button should be disabled. */
  sendDisabled?: boolean;
  /** Whether the connected kernel is currently busy. */
  isKernelBusy?: boolean;
  /** Callback when the send button is clicked. */
  onSend: () => void;
  /** Callback when the stop button is clicked. */
  onStop?: () => void;
}

export function InPromptFooter({
  stacks,
  children,
  rightContent,
  isLoading = false,
  sendDisabled = false,
  isKernelBusy = false,
  onSend,
  onStop,
}: InPromptFooterProps) {
  return (
    <>
      {stacks && stacks.length > 0 ? <PromptStacks stacks={stacks} /> : null}

      <Box
        data-prompt-stack="controls"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          pt: 1,
          pb: 2,
        }}
      >
        {/* Left slot — dropdowns / indicators */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {children}
        </Box>

        {/* Right — indicators + submit / stop */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {rightContent}
          {isLoading ? (
            <IconButton
              icon={SquareCircleIcon}
              aria-label="Stop"
              onClick={onStop}
              size="small"
              variant="invisible"
            />
          ) : isKernelBusy ? (
            <IconButton
              icon={PauseIcon}
              aria-label="Pause (kernel busy)"
              onClick={onStop}
              size="small"
              variant="invisible"
              disabled={!onStop}
            />
          ) : (
            <IconButton
              icon={PaperAirplaneIcon}
              aria-label="Send"
              onClick={onSend}
              disabled={sendDisabled}
              size="small"
              variant="invisible"
            />
          )}
        </Box>
      </Box>
    </>
  );
}

export default InPromptFooter;
