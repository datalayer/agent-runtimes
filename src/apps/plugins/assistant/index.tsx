/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant in the LOOP workspace (LOOP T-24): the character a
 * page draws over its workspace, chosen from what the enabled plugins
 * contribute to `loop.assistant.character` — the application's own
 * (`interface.assistant`) when its Appspec names one, else the person's
 * choice from their settings, else the paper clip. It acts out what the
 * application is doing as its chat says it — paused too, when its deployment
 * is — and the turn (T-22), says the agent's newest words in its balloon
 * while the conversation is out of sight, holds there the approval it waits
 * on, answered with *Approve* or *Deny* on the path every approval of it is
 * answered on (T-23, U-19), opens the conversation when clicked, and is
 * dragged about and sent away as the chat's own assistant is (T-27). Given
 * the runtime to ask (`decisions`), its balloon offers *Ask a decision*: a
 * typed decision asked of Jev through the runtime, answered there.
 *
 * Its balloon shows the conversation as `balloon` says (LOOP T-23; the
 * Appspec's `interface.balloon`): a peek of the newest words (`history`, the
 * default), or the one thing being said or done now (`current`). Either way
 * what the agent is doing while a tool runs — the turn's `activity` — is said
 * there, and heard once as it starts.
 *
 * The workspace's chat is the conversation: on a page layout, its side panel
 * is opened and closed; where the conversation is always on screen, a click
 * takes the person to its composer.
 *
 * @module apps/plugins/assistant
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { definePlugin, signal } from '@datalayer/reactor';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import {
  pageLayoutPanelOpen,
  togglePagePanel,
} from '@datalayer/primer-addons/lib/reactor';
import { AssistantStage } from '../../../chat/assistant/AssistantStage';
import { decisionsAskerAt } from '../../../chat/assistant/decisions';
import { peekLine } from '../../../chat/assistant/ConversationBalloon';
import {
  assistantStateOf,
  keepAway,
  keptAway,
  latestSaying,
  type AssistantAway,
  type AssistantState,
  type BalloonApproval,
} from '../../../chat/assistant/state';
import {
  useApproveToolRequest,
  useRejectToolRequest,
  useToolApprovalsQuery,
} from '../../../hooks/useToolApprovals';
import { approvalsOfApp, ruleOfApproval } from '../app-rules/AppRulesCard';
import type { PresenceState } from '../../../chat/presence/presenceStatus';
import { useViewportDrag } from '../../../chat/useViewportDrag';
import {
  LoopAssistantCharacter,
  LoopAssistantMenu,
  LoopChatLayout,
  LoopChatTurn,
  LoopSlots,
  IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  IDLE_SANDBOX_TARGET_SIGNAL,
  type ChatTurnSnapshot,
  type LoopWorkspaceContext,
} from '../../core';
import { assistantCharacterFor } from '../assistant-characters';
import { useOptionalSandboxService } from '../agents/useSandboxService';
import { TARGET_SPECS } from '../agents/switchable';
import type {
  AssistantSandbox,
  AssistantSandboxKind,
} from '../../../chat/assistant/assistantDetails';
import type { AssistantAbout } from '../../../chat/assistant/AssistantStage';
import type {
  BalloonDisplay,
  BalloonToolLine,
} from '../../../chat/assistant/toolLine';
import { useChatWords } from '../../../chat/ChatLanguage';

export const LOOP_ASSISTANT_PLUGIN_NAME = '@datalayer/loop-plugin-assistant';

export type LoopAssistantConfig = {
  /** The character the application's Appspec names; it wins. */
  app?: string;
  /** The character the person chose in their settings. */
  person?: string;
  /**
   * The application's id: the approvals it waits on are read and answered
   * in the balloon (T-23), as its rules card reads them (U-19). Without it,
   * the balloon says an approval waits and the conversation answers it.
   */
  appId?: string;
  /**
   * The runtime decisions are asked at — its
   * `/api/v1/configure/inference/decisions`, as the `decide` tool asks — and
   * the token to ask with, if it needs one: the balloon offers *Ask a
   * decision*. Without it, it does not.
   */
  decisions?: { serverUrl: string; token?: string };
  /**
   * How the balloon shows the conversation (T-23): a peek of the newest
   * words (`history`, the default), or only what is said or done now
   * (`current`). The Appspec's `interface.balloon`.
   */
  balloon?: BalloonDisplay;
  /**
   * The workspace it is drawn over (the root slot's): its agent and
   * server, for *Agent Details…* and *Code Sandbox Details…*.
   */
  workspace?: LoopWorkspaceContext;
};

/** The character's size, in pixels, as the chat's own assistant. */
const SIZE = 88;

/* Signals to read when no chat contributed a turn: the hooks need one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });
const NO_PRESENCE = signal<PresenceState>('idle');

/**
 * What the character acts out (T-22), from what the application is doing as
 * its chat says it — idle, thinking, working, waiting for the person, paused
 * — and the turn: it speaks while the answer is written.
 */
export function assistantStateOfTurn(
  turn: ChatTurnSnapshot,
  presence: PresenceState,
  moment: { arriving?: boolean; leaving?: boolean } = {},
): AssistantState {
  return assistantStateOf(presence, {
    ...moment,
    speaking: turn.status === 'streaming' && !turn.activity,
  });
}

const PENDING = { status: 'pending' as const };

/**
 * The approvals an application waits on, read and answered as its rules
 * card does (U-19): over the ai-agents `/ws`, where every decision is
 * broadcast, so one answered here leaves every list. The first is offered
 * to the balloon; none, once all are answered.
 */
function WaitingApprovals({
  appId,
  onWaiting,
}: {
  appId: string;
  onWaiting: (approval: BalloonApproval | undefined) => void;
}): null {
  const query = useToolApprovalsQuery(PENDING);
  const approve = useApproveToolRequest();
  const reject = useRejectToolRequest();
  const waiting = useMemo(
    () => approvalsOfApp(query.data?.approvals ?? [], appId),
    [query.data, appId],
  );
  const first = waiting[0];
  const deciding = approve.isPending || reject.isPending;
  useEffect(() => {
    onWaiting(
      first
        ? {
            id: first.id,
            asks: first.tool_name,
            why: ruleOfApproval(first) || undefined,
            others: waiting.length - 1,
            deciding,
            onApprove: () => approve.mutate({ id: first.id }),
            onDeny: () => reject.mutate({ id: first.id }),
          }
        : undefined,
    );
    // The mutations are new objects each render; the decision they send is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.id, waiting.length, deciding, onWaiting]);
  useEffect(() => () => onWaiting(undefined), [onWaiting]);
  return null;
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
  appId,
  decisions,
  balloon: displayGiven = 'history',
  workspace,
}: LoopAssistantConfig): JSX.Element | null {
  const chatText = useChatWords();
  // The balloon's display, as its menu chose it; the Appspec's until then.
  const [chosenDisplay, setChosenDisplay] = useState<BalloonDisplay>();
  const display = chosenDisplay ?? displayGiven;
  const contributed = useContributions(LoopAssistantCharacter).map(
    entry => entry.value,
  );
  const chosen = assistantCharacterFor(contributed, { app, person });
  // What the enabled plugins add to its menu.
  const menuContributions = useContributions(LoopAssistantMenu).map(
    entry => entry.value,
  );
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);
  const presence = useSignalValue(
    turnEntries[0]?.value.presence ?? NO_PRESENCE,
  );
  const signedIn = Boolean(useIAMStore(state => state.token));
  const [approval, setApproval] = useState<BalloonApproval | undefined>();
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

  // The workspace's sandbox (the agents plugin's), for the menu's *Agent
  // Details…* and *Code Sandbox Details…*.
  const sandboxService = useOptionalSandboxService();
  const snapshot = useSignalValue(
    sandboxService?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );
  const target = useSignalValue(
    sandboxService?.target ?? IDLE_SANDBOX_TARGET_SIGNAL,
  );
  const agentId = workspace?.agentId || undefined;
  const agentAbout = useMemo<AssistantAbout>(
    () => ({
      name: appId,
      spec: appId,
      model: workspace?.model,
      where: target ? TARGET_SPECS[target]?.label : undefined,
      agentId,
      apiBase:
        snapshot.agentBaseUrl ??
        (workspace?.serverUrl || sandboxService?.serverUrl || undefined),
    }),
    [
      appId,
      target,
      agentId,
      workspace?.model,
      workspace?.serverUrl,
      sandboxService,
      snapshot.agentBaseUrl,
    ],
  );
  const agentSandbox = useMemo<AssistantSandbox | undefined>(() => {
    // Offered whenever the workspace has a sandbox, running or not yet.
    if (!sandboxService || !target) {
      return undefined;
    }
    const live = snapshot.state === 'running' || snapshot.state === 'starting';
    const kinds: Record<string, AssistantSandboxKind> = {
      browser: 'browser',
      local: 'local',
      jupyter: 'jupyter',
      datalayer: 'cloud',
    };
    return {
      kind: kinds[target] ?? 'runtime',
      status: live ? snapshot.state : 'not running',
      variant: snapshot.variant,
      url: snapshot.jupyterUrl,
      token: snapshot.jupyterToken,
      kernelId: snapshot.kernelId,
      agentId,
      connection:
        target === 'browser' ? sandboxService.getKernelConnection() : undefined,
      serverUrl: snapshot.agentBaseUrl ?? sandboxService.serverUrl,
    };
  }, [sandboxService, target, snapshot, agentId]);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useViewportDrag(stageRef, { whole: true });
  const decide = useMemo(
    () =>
      decisions?.serverUrl
        ? decisionsAskerAt(decisions.serverUrl, decisions.token)
        : undefined,
    [decisions?.serverUrl, decisions?.token],
  );

  if (away !== 'none') {
    return null;
  }
  if ('problem' in chosen) {
    // Not replaced by another: what was named is said, where it would stand.
    return (
      <Box
        role="status"
        data-assistant-problem={chosen.saidBy}
        position="fixed"
        right={24}
        bottom={24}
        zIndex={1000}
        maxWidth={320}
        p={2}
        borderRadius={2}
        border="1px solid"
        borderColor="attention.muted"
        bg="attention.subtle"
        boxShadow="shadow.medium"
      >
        <Text sx={{ fontSize: 1 }}>{chosen.problem}</Text>
      </Box>
    );
  }

  const state = assistantStateOfTurn(turn, presence, { arriving, leaving });
  const unheard = !!saying && saying.id !== heardId;
  // What the agent does while a tool runs, in its own words (T-23).
  const tool: BalloonToolLine | undefined = turn.activity
    ? {
        id: `${turn.id}:${turn.activity}`,
        tool: '',
        name: '',
        phase: 'running',
        words: turn.activity,
      }
    : undefined;
  const atWork = turn.status === 'streaming' || turn.status === 'thinking';
  const current = display === 'current';
  const balloon =
    state === 'paused'
      ? { text: chatText.paused }
      : approval
        ? { text: chatText.waitingForYou, approval }
        : presence === 'waiting'
          ? { text: chatText.waitingOpen }
          : tool
            ? { text: turn.activity ?? '', tool, busy: true }
            : current && (atWork || unheard)
              ? {
                  text:
                    turn.status === 'thinking'
                      ? chatText.thinking
                      : (saying?.text ?? chatText.thinking),
                  more: saying?.more,
                  speaking: turn.status === 'streaming',
                  busy: atWork,
                }
              : unheard && saying
                ? {
                    // A peek: the first words; the rest is in the conversation.
                    ...peekLine(saying.text),
                    onDismiss: () => {
                      setHeardId(saying.id);
                      setFresh(false);
                    },
                  }
                : { text: 'Click me to open the conversation.' };
  const insist =
    state === 'greeting' ||
    presence === 'waiting' ||
    (!!approval && state !== 'paused') ||
    !!tool ||
    (current && atWork) ||
    (unheard && (state === 'speaking' || fresh));
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
    <>
      {appId && signedIn ? (
        <WaitingApprovals appId={appId} onWaiting={setApproval} />
      ) : null}
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
        balloonDisplay={display}
        insist={insist}
        onDismiss={onDismiss}
        decide={decide}
        onResetPosition={drag.position ? drag.reset : undefined}
        onBalloonDisplayChange={setChosenDisplay}
        about={agentAbout}
        sandbox={agentSandbox}
        contextMenu={menuContributions}
      />
    </>
  );
}

export const LoopAssistantPlugin = definePlugin<LoopAssistantConfig>({
  name: LOOP_ASSISTANT_PLUGIN_NAME,
  config: {
    app: undefined,
    person: undefined,
    appId: undefined,
    decisions: undefined,
    balloon: undefined,
  },
  displayName: 'Floating assistant',
  description:
    'The chat as a character on the page: the application’s own, or the one the person chose, from the characters the enabled plugins contribute.',
  octicon: 'paperclip',
  build: ({ config }) => {
    const Configured = ({
      workspace,
    }: {
      workspace?: LoopWorkspaceContext;
    }): JSX.Element | null => (
      <LoopAssistant
        workspace={workspace}
        app={config.app}
        person={config.person}
        appId={config.appId}
        decisions={config.decisions}
        balloon={config.balloon}
      />
    );
    return {
      components: [
        { id: 'loop-assistant', slot: LoopSlots.root, Component: Configured },
      ],
    };
  },
});

export default LoopAssistantPlugin;
