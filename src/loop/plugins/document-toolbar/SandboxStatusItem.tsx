/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the document's code blocks run on, on the document's toolbar.
 *
 * The prose equivalent of the notebook's kernel light. A document with a
 * Jupyter cell in it is running code, and someone whose cell does nothing
 * should be able to see whether there is anything to run it on without leaving
 * the document.
 *
 * Read through the sandbox service's signal rather than the workspace snapshot
 * so it tracks the sandbox itself, including while it is starting.
 *
 * @module loop/plugins/document-toolbar/SandboxStatusItem
 */

import type { JSX } from 'react';
import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { useOptionalSandboxService } from '../agents';
import { IDLE_SANDBOX_SNAPSHOT_SIGNAL } from '../../core';

/** How each state reads, and what colour it reads in. */
const APPEARANCE: Record<string, { label: string; color: string }> = {
  idle: { label: 'No sandbox', color: 'fg.muted' },
  starting: { label: 'Sandbox starting', color: 'attention.fg' },
  running: { label: 'Sandbox ready', color: 'success.fg' },
  stopping: { label: 'Sandbox stopping', color: 'attention.fg' },
  error: { label: 'Sandbox failed', color: 'danger.fg' },
};

export function SandboxStatusItem({
  iconOnly = false,
}: {
  /**
   * Dot only, no words — set inside the "..." overflow menu, where this
   * item sits in a column of icons and its own label was the one thing
   * still forcing the whole menu wide. The dot's colour still says which
   * state it is; the full sentence moves to `title`/`aria-label` instead of
   * disappearing.
   */
  iconOnly?: boolean;
} = {}): JSX.Element | null {
  // Optional: the document is usable without the sandbox plugin, and a status
  // item is the last thing that should insist on it.
  const service = useOptionalSandboxService();
  const snapshot = useSignalValue(
    service?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );

  if (!service) {
    return null;
  }
  const appearance = APPEARANCE[snapshot.state] ?? APPEARANCE.idle;

  return (
    <Box
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? appearance.label : undefined}
      title={iconOnly ? appearance.label : undefined}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2 }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bg: appearance.color,
          flexShrink: 0,
        }}
      />
      {iconOnly ? null : (
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{appearance.label}</Text>
      )}
    </Box>
  );
}

export default SandboxStatusItem;
