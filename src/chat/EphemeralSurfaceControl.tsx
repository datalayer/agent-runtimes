/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which companion surface is on screen: the chat alone, a notebook, or a
 * document.
 *
 * It lives in the chat's header, and it also has to live on the surface's own
 * toolbar: a page drawn without a conversation — a Code Sandbox, where nothing
 * is listening — has no header to put it in, and without it the reader is
 * stuck in whichever surface opened first. One component in both places, so
 * the switch is the same thing wherever it is found.
 */

import type { JSX } from 'react';
import { Box, Tooltip } from '@primer/react';
import { CircleSlashIcon, FileIcon, RowsIcon } from '@primer/octicons-react';
import type { EphemeralSurfaceMode } from '../types';

export type EphemeralSurfaceControlProps = {
  /** The surface on screen. */
  mode: EphemeralSurfaceMode;
  onChange?: (mode: EphemeralSurfaceMode) => void;
  /** Whether a notebook is on offer at all. */
  enableNotebook?: boolean;
  /** Whether a document is on offer at all. */
  enableDocument?: boolean;
  /**
   * Whether "chat only" is one of the choices.
   *
   * Not where there is no chat: closing the surface would leave the page
   * empty, which is not a state anyone is asking for.
   */
  enableChatOnly?: boolean;
};

export function EphemeralSurfaceControl({
  mode,
  onChange,
  enableNotebook = false,
  enableDocument = false,
  enableChatOnly = true,
}: EphemeralSurfaceControlProps): JSX.Element | null {
  const choices = (
    [
      {
        mode: 'none' as const,
        icon: CircleSlashIcon,
        label: 'Chat only',
        enabled: enableChatOnly,
      },
      {
        mode: 'notebook' as const,
        icon: RowsIcon,
        label: 'Notebook',
        enabled: enableNotebook,
      },
      {
        mode: 'document' as const,
        icon: FileIcon,
        label: 'Document',
        enabled: enableDocument,
      },
    ] as const
  ).filter(({ enabled }) => enabled);

  // One choice is not a choice.
  if (choices.length < 2) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        bg: 'neutral.muted',
        borderRadius: '6px',
        p: '2px',
        gap: '1px',
      }}
    >
      {choices.map(({ mode: choice, icon: ModeIcon, label }) => (
        <Tooltip key={choice} text={label} direction="n">
          <Box
            as="button"
            aria-label={label}
            onClick={() => onChange?.(choice)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 24,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              bg: mode === choice ? 'canvas.default' : 'transparent',
              boxShadow: mode === choice ? 'shadow.small' : 'none',
              color: mode === choice ? 'fg.default' : 'fg.muted',
              transition: 'all 0.15s ease',
              '&:hover': {
                color: 'fg.default',
                bg: mode === choice ? 'canvas.default' : 'neutral.subtle',
              },
            }}
          >
            <ModeIcon size={14} />
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

export default EphemeralSurfaceControl;
