/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a hosted or embedded application keeps, said under its prompt before
 * the first message (LOOP R-31) — in every layout, since the composer draws
 * what is hung on `LoopPromptPanel` wherever it stands. Gone once a message
 * is sent: what it keeps was said before anything was.
 *
 * `AppRenderer` adds the plugin for an application that runs as a
 * deployment — at its address, embedded — not for its builder's Preview.
 *
 * @module loop/apps/AppKept
 */

import type { JSX } from 'react';
import { Text } from '@primer/react';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import type { AppSpec } from '../../types/agentspecs';
import { LoopChatTurn, LoopPromptPanel, type ChatTurnSnapshot } from '../core';
import { beforeFirstMessage } from './kept';

export const APP_KEPT_PLUGIN_NAME = '@datalayer/loop-plugin-app-kept';

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

export function AppKept({ says }: { says: string }): JSX.Element | null {
  const turns = useContributions(LoopChatTurn);
  const turn = useSignalValue(turns[0]?.value.turn ?? NO_TURN);
  if (!beforeFirstMessage(turn)) {
    return null;
  }
  return (
    <div role="note" style={{ padding: '4px 8px' }}>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{says}</Text>
    </div>
  );
}

/**
 * The plugin, for one application: what it keeps, under its prompt. Made
 * once per application and sentence — a new plugin rebuilds the workspace.
 */
export function defineAppKeptPlugin(
  app: Pick<AppSpec, 'id' | 'name'>,
  says: string,
) {
  function Panel(): JSX.Element | null {
    return <AppKept says={says} />;
  }
  return definePlugin({
    name: `${APP_KEPT_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: what it keeps`,
    description: `What ${app.name} keeps of a conversation, and for how long, said before the first message.`,
    octicon: 'archive',
    emoji: '\u{1F5C4}',
    contributes: [
      contribution(
        LoopPromptPanel,
        { id: 'app-kept', placement: 'below', order: 30, Component: Panel },
        { id: 'app-kept' },
      ),
    ],
  });
}
