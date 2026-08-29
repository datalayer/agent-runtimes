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

import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { useOptionalSandboxService } from '../agents';

/** How each state reads, and what colour it reads in. */
const APPEARANCE: Record<string, { label: string; color: string }> = {
  idle: { label: 'No sandbox', color: 'fg.muted' },
  starting: { label: 'Sandbox starting', color: 'attention.fg' },
  running: { label: 'Sandbox ready', color: 'success.fg' },
  stopping: { label: 'Sandbox stopping', color: 'attention.fg' },
  error: { label: 'Sandbox failed', color: 'danger.fg' },
};

export function SandboxStatusItem(): JSX.Element | null {
  // Optional: the document is usable without the sandbox plugin, and a status
  // item is the last thing that should insist on it.
  const service = useOptionalSandboxService();
  const snapshot = useSignalValue(service?.snapshot ?? FALLBACK);

  if (!service) {
    return null;
  }
  const appearance = APPEARANCE[snapshot.state] ?? APPEARANCE.idle;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2 }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bg: appearance.color,
          flexShrink: 0,
        }}
      />
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{appearance.label}</Text>
    </Box>
  );
}

/** Read when the plugin is absent, so the hook order never changes. */
const FALLBACK = {
  value: { state: 'idle' as const },
  peek: () => ({ state: 'idle' as const }),
} as never;

export default SandboxStatusItem;
