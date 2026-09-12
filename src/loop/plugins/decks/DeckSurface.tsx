/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The deck beside the chat: the decks plugin's own view, in the editor column.
 *
 * It shows whichever deck the store says is open — the agent's `decks_open`,
 * a click in the sidebar list, the composer menu — and an invitation to make
 * one when none is.
 */

import type { JSX } from 'react';
import { Box } from '@primer/react';
import { DecksView } from '@datalayer/decks/plugin';
import type { ChatSurfaceProps } from '../../core';

export default function DeckSurface(_: ChatSurfaceProps): JSX.Element {
  return (
    <Box sx={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <DecksView />
    </Box>
  );
}
