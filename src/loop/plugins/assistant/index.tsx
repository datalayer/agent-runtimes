/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant in the LOOP workspace (LOOP T-24): the character a
 * page draws over its workspace, chosen from what the enabled plugins
 * contribute to `loop.assistant.character` — the application's own
 * (`interface.assistant`) when its Appspec names one, else the person's
 * choice from their settings, else the paper clip. It acts out the chat's
 * turn (T-22), says the agent's newest words in its balloon while the
 * conversation is out of sight (T-23), opens the conversation when clicked,
 * is dragged about and sent away as the chat's own assistant is (T-27).
 *
 * The workspace's chat is the conversation: on a page layout, its side panel
 * is opened and closed; where the conversation is always on screen, a click
 * takes the person to its composer.
 *
 * @module loop/plugins/assistant
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { definePlugin, signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  pageLayoutPanelOpen,
  togglePagePanel,
} from '@datalayer/primer-addons/lib/reactor';
import { AssistantStage } from '../../../chat/assistant/AssistantStage';
import {
  assistantStateOf,
  keepAway,
  keptAway,
  latestSaying,
  type AssistantAway,
  type AssistantState,
} from '../../../chat/assistant/state';
import type { PresenceState } from '../../../chat/presence/presenceStatus';
import { useViewportDrag } from '../../../chat/useViewportDrag';
import {
  LoopAssistantCharacter,
  LoopChatLayout,
  LoopChatTurn,
  LoopSlots,
  type ChatTurnSnapshot,
} from '../../core';
import { assistantCharacterFor } from '../assistant-characters';

export const LOOP_ASSISTANT_PLUGIN_NAME = '@datalayer/loop-plugin-assistant';

export type LoopAssistantConfig = {
  /** The character the application's Appspec names; it wins. */
  app?: string;
  /** The character the person chose in their settings. */
  person?: string;
};

/** The character's size, in pixels, as the chat's own assistant. */
const SIZE = 88;

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

/**
 * What the character acts out, from the workspace's chat turn (T-22): it
 * thinks while the agent thinks, works while a tool runs (the turn's
 * `activity`), speaks while the answer is written, and idles otherwise.
 */
export function assistantStateOfTurn(
  turn: ChatTurnSnapshot,
  moment: { arriving?: boolean; leaving?: boolean } = {},
): AssistantState {
  const busy = turn.status === 'thinking' || turn.status === 'streaming';
  const presence: PresenceState = !busy
    ? 'idle'
    : turn.activity
      ? 'working'
      : 'thinking';
  return assistantStateOf(presence, {
    ...moment,
    speaking: turn.status === 'streaming' && !turn.activity,
  });
}

/** Take the person to the workspace's composer. */
function focusComposer(): void {
  const composer = document.querySelector<HTMLElement>(
    '[data-chat-composer] textarea, [data-chat-composer] [contenteditable="true"]',
  );
  composer?.focus();
}

export function LoopAssistant({
  app,
  person,
}: LoopAssistantConfig): JSX.Element | null {
  const contributed = useContributions(LoopAssistantCharacter).map(
    entry => entry.value,
  );
  const chosen = assistantCharacterFor(contributed, { app, person });
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
  // On a page layout the conversation is its side panel; elsewhere it is
  // always on screen.
  const onPageLayout = useContributions(LoopChatLayout).some(
    entry => entry.value.id === 'page-layout',
  );
  const panelOpen = useSignalValue(pageLayoutPanelOpen);
  const open = onPageLayout && panelOpen;

  const [away, setAway] = useState<AssistantAway>(keptAway);
  const [arriving, setArriving] = useState(true);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArriving(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  /* The agent's newest words, said in the balloon until heard (T-23). */
  const saying = turn.assistant
    ? latestSaying([
        { id: String(turn.id), role: 'assistant', content: turn.assistant },
      ])
    : undefined;
  const [heardId, setHeardId] = useState<string | undefined>();
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!saying || open) {
      return;
    }
    setFresh(true);
    const timer = setTimeout(() => setFresh(false), 12000);
    return () => clearTimeout(timer);
  }, [saying?.id, saying?.text, open]);
  useEffect(() => {
    if (open && saying) {
      setHeardId(saying.id);
    }
  }, [open, saying?.id]);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useViewportDrag(stageRef, { whole: true });

  if (away !== 'none') {
    return null;
  }
  if ('problem' in chosen) {
    // Not replaced by another: what was named is said, where it would stand.
    return (
      <Box
        role="status"
        data-assistant-problem={chosen.saidBy}
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 1000,
          maxWidth: 320,
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'attention.muted',
          bg: 'attention.subtle',
          boxShadow: 'shadow.medium',
        }}
      >
        <Text sx={{ fontSize: 1 }}>{chosen.problem}</Text>
      </Box>
    );
  }

  const state = assistantStateOfTurn(turn, { arriving, leaving });
  const unheard = !!saying && saying.id !== heardId;
  const balloon =
    unheard && saying
      ? { text: saying.text, more: saying.more }
      : { text: 'Click me to open the conversation.' };
  const insist =
    state === 'greeting' || (unheard && (state === 'speaking' || fresh));
  const onToggle = () => {
    if (onPageLayout) {
      togglePagePanel();
    } else {
      focusComposer();
    }
  };
  const onDismiss = (next: AssistantAway) => {
    keepAway(next);
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      setAway(next);
    }, 600);
  };
  return (
    <AssistantStage
      character={chosen.character}
      state={state}
      size={SIZE}
      place={
        drag.position
          ? { left: `${drag.position.left}px`, top: `${drag.position.top}px` }
          : { right: '24px', bottom: '24px' }
      }
      stageRef={stageRef}
      onDragStart={drag.onHandlePointerDown}
      open={open}
      onToggle={onToggle}
      balloon={balloon}
      insist={insist}
      onDismiss={onDismiss}
    />
  );
}

export const LoopAssistantPlugin = definePlugin<LoopAssistantConfig>({
  name: LOOP_ASSISTANT_PLUGIN_NAME,
  config: { app: undefined, person: undefined },
  displayName: 'Floating assistant',
  description:
    'The chat as a character on the page: the application’s own, or the one the person chose, from the characters the enabled plugins contribute.',
  octicon: 'paperclip',
  build: ({ config }) => {
    const Configured = (): JSX.Element | null => (
      <LoopAssistant app={config.app} person={config.person} />
    );
    return {
      components: [
        { id: 'loop-assistant', slot: LoopSlots.root, Component: Configured },
      ],
    };
  },
});

export default LoopAssistantPlugin;
