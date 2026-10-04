/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's page, drawn beside its conversation: its A2UI surface on
 * the workspace's own renderer (`InlineSurface`), fed by the chat's current
 * turn, its buttons answered through the chat's controls.
 *
 * @module loop/plugins/app-page/AppPage
 */

import type { JSX } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import type { AppSpec } from '../../../types/agentspecs';
import {
  LoopChatTurn,
  type ChatTurnSnapshot,
  type LoopWorkspaceContext,
} from '../../core';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
  type InlineSurfaceModel,
} from '../a2ui-surface/InlineSurface';
import { appPageAction, appPageData, appPageMessages } from './appPage';

/** No chat in the workspace: the page reads a turn that never starts. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

export type AppPageProps = {
  app: AppSpec;
  workspace: LoopWorkspaceContext;
};

export function AppPage({ app, workspace }: AppPageProps): JSX.Element {
  const entries = useContributions(LoopChatTurn);
  const turn = useSignalValue(entries[0]?.value.turn ?? NO_TURN);
  const messages = useMemo(
    () => appPageMessages(app, SURFACE_CATALOG_ID) as A2uiMessage[],
    [app],
  );
  const data = useMemo(() => appPageData(app, turn), [app, turn]);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The workspace changes as the chat reports itself; the handler reads the latest.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // The inputs in words as last sent: a chat's message carries them when they change.
  const lastInputs = useRef('');

  const onAction = useCallback(
    (action: A2uiClientAction, surface?: InlineSurfaceModel) => {
      const outcome = appPageAction(
        app,
        { name: action.name, context: action.context ?? {} },
        path => surface?.dataModel.get(path),
        lastInputs.current,
      );
      const controls = workspaceRef.current.viewControls;
      if ('refused' in outcome) {
        setRefusal(outcome.refused);
        return;
      }
      setRefusal(null);
      if ('stop' in outcome) {
        controls.stop?.();
      } else if ('newChat' in outcome) {
        controls.newChat?.();
      } else {
        // The chat's own send, as a surface in the transcript submits; the
        // prompt channel when the chat has not reported itself yet.
        if (controls.send) {
          controls.send(outcome.send);
        } else {
          workspaceRef.current.prompts.submit(outcome.send);
        }
        lastInputs.current = outcome.inputs;
        for (const path of outcome.clear) {
          surface?.dataModel.set(path, '');
        }
      }
    },
    [app],
  );

  return (
    <Box
      data-testid="app-page"
      sx={{ height: '100%', minHeight: 0, overflow: 'auto', p: 3 }}
    >
      <InlineSurface
        messages={messages}
        data={data}
        onAction={onAction}
        validationError={refusal}
      />
    </Box>
  );
}

export default AppPage;
