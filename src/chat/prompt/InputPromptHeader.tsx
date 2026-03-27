/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputPromptHeader — Header area of the InputPrompt component.
 *
 * Renders a horizontal slot above the input area for hosting
 * dropdowns, indicators, or other controls.
 *
 * @module chat/prompt/InputPromptHeader
 */

import type { ReactNode } from 'react';
import { Box } from '@datalayer/primer-addons';

export interface InputPromptHeaderProps {
  /** Content to render in the header (dropdowns, indicators, etc.) */
  children?: ReactNode;
}

export function InputPromptHeader({ children }: InputPromptHeaderProps) {
  if (!children) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        pt: 2,
        pb: 1,
      }}
    >
      {children}
    </Box>
  );
}

export default InputPromptHeader;
