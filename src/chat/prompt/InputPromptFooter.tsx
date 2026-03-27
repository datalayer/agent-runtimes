/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptFooter — Footer area of the InputPrompt component.
 *
 * Renders a horizontal bar below the input area with a left slot
 * for dropdowns / indicators and submit / stop buttons on the right.
 *
 * @module chat/prompt/InputPromptFooter
 */

import type { ReactNode } from 'react';
import { IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { PaperAirplaneIcon, SquareCircleIcon } from '@primer/octicons-react';

export interface InputPromptFooterProps {
  /** Content to render on the left side (dropdowns, indicators, etc.) */
  children?: ReactNode;
  /** Whether the agent is loading / streaming */
  isLoading?: boolean;
  /** Whether the send button should be disabled */
  sendDisabled?: boolean;
  /** Callback when the send button is clicked */
  onSend: () => void;
  /** Callback when the stop button is clicked */
  onStop?: () => void;
}

export function InputPromptFooter({
  children,
  isLoading = false,
  sendDisabled = false,
  onSend,
  onStop,
}: InputPromptFooterProps) {
  return (
    <Box
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

      {/* Right — submit / stop */}
      {isLoading ? (
        <IconButton
          icon={SquareCircleIcon}
          aria-label="Stop"
          onClick={onStop}
          size="small"
        />
      ) : (
        <IconButton
          icon={PaperAirplaneIcon}
          aria-label="Send"
          onClick={onSend}
          disabled={sendDisabled}
          size="small"
        />
      )}
    </Box>
  );
}

export default InputPromptFooter;
