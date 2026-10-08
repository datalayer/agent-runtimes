/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's page, drawn beside its conversation: its A2UI surface on
 * the workspace's own renderer (`InlineSurface`), fed by the chat's current
 * turn and its conversation, its buttons — and a Chat block's message, a File
 * upload's files — answered through the chat's controls, what the page did
 * going with the chat's run to the application's session (LOOP R-04).
 *
 * It draws the blocks the workspace's plugins contribute to the Canvas's
 * palette (`loop.canvas.block`, R-01b) and nothing else, so that what the
 * Canvas can place and what the page can draw are one list: a page that
 * uses a block no enabled plugin contributes says so, in place of the page.
 * The components its developer wrote (LOOP P-17) are among them, contributed
 * by its own plugin (`app-components`) with their renderers.
 *
 * A widget's page written in its code (LOOP P-05) runs in a session of its
 * own, beside the conversation: as an input changes, the page sends them all
 * to the session's `page` action and shows what its code answered at
 * `/outputs/<name>`, in place — no message is sent (`./pageRun`).
 *
 * @module loop/plugins/app-page/AppPage
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import { Box } from '@datalayer/primer-addons';
import { signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import type { AppSpec } from '../../../types/agentspecs';
import { catalogOfBlocks } from '../../../components/a2ui';
import { useChatWords } from '../../../chat/ChatLanguage';
import {
  LoopCanvasBlock,
  LoopChatTurn,
  agentServerOf,
  noRuntimeSaid,
  type ChatTurnSnapshot,
  type ConversationEntry,
  type LoopWorkspaceContext,
} from '../../core';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
  type InlineSurfaceModel,
} from '../a2ui-surface/InlineSurface';
import { useOwnComponents } from '../a2ui-surface/ownComponents';
import {
  appPageAction,
  appPageData,
  appPageMessages,
  pageInputsOf,
  pageOf,
} from './appPageModel';
import {
  openPageSession,
  outputsData,
  runPageIn,
  type PageRunContext,
} from './pageRun';

/** How long the page waits after an input changed before it runs (P-05). */
export const PAGE_RUN_DELAY_MS = 300;

/** No chat in the workspace: the page reads a turn that never starts. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });
const NO_CONVERSATION = signal<ConversationEntry[]>([]);

/** The components a page's messages place, each once. */
export function componentsOnPage(messages: readonly unknown[]): string[] {
  const names = new Set<string>();
  for (const message of messages) {
    const update = (
      message as {
        updateComponents?: { components?: Array<{ component?: unknown }> };
      }
    ).updateComponents;
    for (const node of update?.components ?? []) {
      names.add(String(node.component));
    }
  }
  return [...names];
}

/**
 * Why a page is not drawn with the blocks contributed, or null: the blocks it
 * places that no enabled plugin contributes.
 */
export function blocksMissing(
  placed: readonly string[],
  contributed: readonly string[],
): string | null {
  const have = new Set(contributed);
  const missing = placed.filter(name => !have.has(name));
  if (missing.length === 0) {
    return null;
  }
  return `This page places ${missing.join(', ')}, which no enabled plugin contributes: ${missing.length === 1 ? 'it is' : 'they are'} drawn once the plugin that contributes ${missing.length === 1 ? 'it' : 'them'} is on.`;
}

export type AppPageProps = {
  app: AppSpec;
  workspace: LoopWorkspaceContext;
};

export function AppPage({ app, workspace }: AppPageProps): JSX.Element {
  const entries = useContributions(LoopChatTurn);
  const turn = useSignalValue(entries[0]?.value.turn ?? NO_TURN);
  const conversation = useSignalValue(
    entries[0]?.value.conversation ?? NO_CONVERSATION,
  );
  const messages = useMemo(
    () => appPageMessages(app, SURFACE_CATALOG_ID) as A2uiMessage[],
    [app],
  );
  // The blocks the enabled plugins contribute: what this page may draw.
  const blocks = useContributions(LoopCanvasBlock);
  const contributed = [...new Set(blocks.map(entry => entry.value.id))].sort();
  const drawnWith = contributed.join(',');
  // The renderers of the components its developer wrote (P-17).
  const own = useOwnComponents();
  const drawing = useMemo(():
    { catalog: ReturnType<typeof catalogOfBlocks> } | { problem: string } => {
    const missing = blocksMissing(componentsOnPage(messages), contributed);
    if (missing) {
      return { problem: missing };
    }
    try {
      return { catalog: catalogOfBlocks(contributed, own) };
    } catch (error) {
      return {
        problem: error instanceof Error ? error.message : String(error),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, drawnWith, own]);
  const [refusal, setRefusal] = useState<string | null>(null);
  // A widget's page written in its code (P-05): its outputs, as last answered.
  const page = pageOf(app);
  const [outputs, setOutputs] = useState<Record<string, unknown>>({});
  const data = useMemo(
    () => ({
      ...appPageData(app, turn, conversation),
      ...outputsData(outputs),
    }),
    [app, turn, conversation, outputs],
  );
  const token = useIAMStore(state => state.token) ?? '';
  const chatText = useChatWords();
  /*
   * Where its page runs: the runtime its agent is on, or nothing while none
   * is assigned — then a run is not sent and the page says why, rather than
   * reaching for the host's server (on a hosted page, the page's own origin).
   */
  const pageServer = agentServerOf(workspace.sandbox, workspace.serverUrl);
  const pageContext = useRef<PageRunContext | null>(null);
  pageContext.current =
    pageServer === undefined
      ? null
      : {
          serverUrl: pageServer,
          agentId: workspace.agentId || app.id,
          token: token || undefined,
        };
  const noRuntime = useRef('');
  noRuntime.current =
    pageServer === undefined ? noRuntimeSaid(workspace.sandbox, chatText) : '';
  const pageSession = useRef<Promise<string> | null>(null);
  const pageRunning = useRef(false);
  const pageNext = useRef<Record<string, unknown> | null>(null);
  const pageSent = useRef('');
  const alive = useRef(true);
  // The latest inputs win: one run at a time, the last ones written next.
  const runPage = useCallback((inputs: Record<string, unknown>) => {
    pageNext.current = inputs;
    if (pageRunning.current) {
      return;
    }
    pageRunning.current = true;
    void (async () => {
      while (pageNext.current && alive.current) {
        const next = pageNext.current;
        pageNext.current = null;
        const context = pageContext.current;
        if (!context) {
          setRefusal(noRuntime.current);
          continue;
        }
        try {
          pageSession.current ??= openPageSession(context);
          const turn = await runPageIn(
            context,
            await pageSession.current,
            next,
          );
          if (!alive.current) break;
          if ('refused' in turn) {
            setRefusal(turn.refused);
          } else {
            setRefusal(null);
            setOutputs(turn.outputs);
          }
        } catch (error) {
          // No session: the next change opens one again.
          pageSession.current = null;
          if (alive.current) {
            setRefusal(error instanceof Error ? error.message : String(error));
          }
        }
      }
      pageRunning.current = false;
    })();
  }, []);
  // A live page runs as its inputs change, from the start (their defaults).
  const unwatch = useRef<(() => void) | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      unwatch.current?.();
    };
  }, []);
  const onSurface = useCallback(
    (surface: InlineSurfaceModel) => {
      if (!page?.live) {
        return;
      }
      unwatch.current?.();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = (value: Record<string, unknown> | undefined) => {
        const inputs = pageInputsOf(app, value);
        const said = JSON.stringify(inputs);
        if (said === pageSent.current) {
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          pageSent.current = said;
          runPage(inputs);
        }, PAGE_RUN_DELAY_MS);
      };
      const watching = surface.dataModel.subscribe<Record<string, unknown>>(
        '/inputs',
        changed,
      );
      changed(watching.value);
      unwatch.current = () => {
        clearTimeout(timer);
        watching.unsubscribe();
      };
    },
    [app, page?.live, runPage],
  );
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
      if ('runPage' in outcome) {
        runPage(outcome.runPage);
      } else if ('stop' in outcome) {
        controls.stop?.();
      } else if ('newChat' in outcome) {
        controls.newChat?.();
      } else {
        // The chat's own send, with what the page did besides — the block's
        // action, its files, the settings — for the application's session
        // (R-04); the prompt channel when the chat has not reported itself
        // yet, which carries words only.
        if (controls.send) {
          const refused = controls.send(outcome.send, { loop: outcome.loop });
          if (refused) {
            setRefusal(refused);
            return;
          }
        } else if (outcome.loop.files) {
          setRefusal(
            'The conversation is not ready for a file yet: try again.',
          );
          return;
        } else {
          workspaceRef.current.prompts.submit(outcome.send);
        }
        lastInputs.current = outcome.inputs;
        for (const path of outcome.clear) {
          surface?.dataModel.set(path, '');
        }
      }
    },
    [app, runPage],
  );

  return (
    <Box
      data-testid="app-page"
      height="100%"
      minHeight={0}
      overflow="auto"
      p={3}
    >
      {'problem' in drawing ? (
        <Box role="status" color="fg.muted" fontSize={1}>
          {drawing.problem}
        </Box>
      ) : (
        <InlineSurface
          // A new list of blocks is a new surface, drawn with it.
          key={drawnWith}
          messages={messages}
          data={data}
          onAction={onAction}
          validationError={refusal}
          catalog={drawing.catalog}
          {...(page ? { onSurface } : {})}
        />
      )}
    </Box>
  );
}

export default AppPage;
