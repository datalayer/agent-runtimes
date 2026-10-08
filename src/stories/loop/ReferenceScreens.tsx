/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The four reference screens of the `loop` theme (LOOP T-01), and the
 * floating assistant's states (T-27), drawn from the real chat components
 * with fixed data: no agent, no network, no clock.
 *
 * - a conversation;
 * - a conversation beside its work;
 * - the activity of a worker;
 * - an approval.
 *
 * Each renders in any theme of the registry and in either mode, so the same
 * screen is the design reference (the stories) and the picture a token change
 * is compared against (`pictures/`, T-16).
 *
 * @module stories/loop/ReferenceScreens
 */

import React, { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Button, Heading, Text } from '@primer/react';
import {
  Box,
  DatalayerThemeProvider,
  setupPrimerPortals,
  themeAccentVars,
  themeConfigs,
  type ThemeVariant,
} from '@datalayer/primer-addons';
import { ChatBaseHeader } from '../../chat/header/ChatHeaderBase';
import { ChatMessageList } from '../../chat/messages/ChatMessageList';
import { InputPrompt } from '../../chat/prompt/InputPrompt';
import { PresenceFace, PresenceLine } from '../../chat/presence/Presence';
import type { PresenceState } from '../../chat/presence/presenceStatus';
import {
  AssistantStage,
  type AssistantStageProps,
} from '../../chat/assistant/AssistantStage';
import {
  ASSISTANT_WORDS,
  type AssistantState,
} from '../../chat/assistant/state';
import {
  CONVERSATION_BALLOON_WIDTH,
  ConversationBalloonClose,
  balloonTailAt,
  conversationBalloonHeight,
  conversationBalloonSx,
  peekLine,
} from '../../chat/assistant/ConversationBalloon';
import { DecisionAsk } from '../../chat/assistant/DecisionAsk';
import { ConversationBalloonHeader } from '../../chat/assistant/BalloonParts';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import {
  AssistantCharactersPlugin,
  assistantCharacterNamed,
} from '../../apps/plugins/assistant-characters';
import { OwlCharacterPlugin } from '../../examples/utils/owlCharacterPlugin';
import type { DisplayItem } from '../../types/chat';

/** The screens, by the name a picture and a story take. */
export const REFERENCE_SCREENS = [
  'conversation',
  'beside-work',
  'worker-activity',
  'approval',
  'tool-marks',
] as const;
export type ReferenceScreen = (typeof REFERENCE_SCREENS)[number];

/**
 * The floating assistant's pictures (T-27): its states — closed, a peek
 * where it has something to say — stepped aside, and open, the conversation
 * as its balloon (T-23).
 */
export const ASSISTANT_PICTURES = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'paused',
  'speaking',
  'aside',
  'open',
  'current',
] as const;
export type AssistantPicture = (typeof ASSISTANT_PICTURES)[number];

/**
 * The characters pictured idle, each in light and dark (T-25, T-24):
 * Datalayer's wizard, cat and L👀P eyes — the paper clip's idle is
 * `assistant-idle` — and the owl an example plugin contributes, drawn
 * through `loop.assistant.character`.
 */
export const CHARACTER_PICTURES = ['wizard', 'cat', 'eyes', 'owl'] as const;
export type CharacterPicture = (typeof CHARACTER_PICTURES)[number];

export type ReferenceMode = 'light' | 'dark';

/** Every theme of the registry, in its order. */
export const REFERENCE_THEMES = Object.keys(themeConfigs) as ThemeVariant[];

// ---------------------------------------------------------------------------
// The theme around a screen
// ---------------------------------------------------------------------------

/**
 * A screen in a theme and a mode, on its stage: the flat tint of the accent
 * in `loop` (mint, the default), the muted canvas in every other theme.
 */
export function ReferenceTheme({
  theme,
  mode,
  children,
}: {
  theme: ThemeVariant;
  mode: ReferenceMode;
  children: ReactNode;
}): JSX.Element {
  const config = themeConfigs[theme] ?? themeConfigs.loop;
  useEffect(() => {
    setupPrimerPortals();
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-reference-theme', theme);
    document.documentElement.setAttribute('data-reference-mode', mode);
  }, [theme, mode]);
  return (
    <DatalayerThemeProvider
      colorMode={mode}
      theme={config.primerTheme}
      themeStyles={config.themeStyles}
      baseStyles={
        theme === 'loop'
          ? (themeAccentVars('green', mode) as React.CSSProperties)
          : undefined
      }
    >
      <Box
        data-reference-stage=""
        position="fixed"
        inset={0}
        p={4}
        bg={theme === 'loop' ? 'var(--theme-stage)' : 'var(--bgColor-muted)'}
        color="fg.default"
        display="flex"
      >
        {children}
      </Box>
    </DatalayerThemeProvider>
  );
}

/** One rounded surface on the stage: the theme's frame. */
function Frame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box
      flex={1}
      minWidth={0}
      display="flex"
      overflow="hidden"
      bg="canvas.default"
      borderRadius="var(--theme-radius-frame, 12px)"
      border="var(--theme-hairline, 1px) solid"
      borderColor="border.muted"
      boxShadow="var(--theme-shadow, none)"
    >
      {children}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Fixed data
// ---------------------------------------------------------------------------

const AT = new Date('2026-10-04T09:30:00Z');

function said(
  id: string,
  role: 'user' | 'assistant',
  content: string,
): DisplayItem {
  return { id, role, content, createdAt: AT } as DisplayItem;
}

function tool(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  status: 'inProgress' | 'executing' | 'complete' | 'error',
  result?: unknown,
): DisplayItem {
  return {
    id,
    type: 'tool-call',
    toolCallId: id,
    toolName,
    args,
    status,
    result,
  } as DisplayItem;
}

const CONVERSATION: DisplayItem[] = [
  said('m1', 'user', 'Which customers wrote about late deliveries this week?'),
  said(
    'm2',
    'assistant',
    'Three of them: **Ada Lovelace** (order 1042, four days late), ' +
      '**Grace Hopper** (order 1057, asks for a refund) and **Alan Turing** ' +
      '(order 1061, no tracking number). The details are in the ' +
      '[support log](https://example.com/log).',
  ),
  said('m3', 'user', 'Draft a reply to Ada.'),
  said(
    'm4',
    'assistant',
    'Here is a draft, beside the conversation. It apologises, gives the new ' +
      'date and offers free shipping on her next order.',
  ),
];

const BESIDE_WORK: DisplayItem[] = CONVERSATION.slice(2);

const WORKER_ACTIVITY: DisplayItem[] = [
  said('w1', 'assistant', 'Morning run: 12 new messages in the inbox.'),
  tool('w2', 'read_inbox', { since: '2026-10-04T06:00:00Z' }, 'complete', {
    messages: 12,
  }),
  tool('w3', 'label_message', { id: 'msg-881', label: 'Refund' }, 'complete', {
    ok: true,
  }),
  tool(
    'w4',
    'label_message',
    { id: 'msg-884', label: 'Delivery' },
    'complete',
    { ok: true },
  ),
  said(
    'w5',
    'assistant',
    'Nine labelled, two answered from the help centre, one left for you: a ' +
      'refund above the limit.',
  ),
  tool('w6', 'draft_reply', { id: 'msg-887' }, 'executing'),
];

const APPROVAL: DisplayItem[] = [
  said('a1', 'user', 'Send the reply to Ada.'),
  said('a2', 'assistant', 'Sending is a rule you keep: I ask first.'),
  tool(
    'a3',
    'send_email',
    { to: 'ada@example.com', subject: 'Your order 1042' },
    'inProgress',
    { pending_approval: true, approval_id: 'approval-1' },
  ),
];

/*
 * Whose tools: an MCP server's (the Odoo accounting server's, its icon the
 * Datalayer icons' Odoo), a skill's and a frontend tool set's, each call led
 * by its mark.
 */
const TOOL_MARKS: DisplayItem[] = [
  said(
    't1',
    'user',
    'What is still open on the books, and does my notebook agree?',
  ),
  tool(
    't2',
    'odoo_accounting_list_open_balances',
    { account: '400000' },
    'complete',
    { partners: 7 },
  ),
  tool(
    't3',
    'run_skill_script',
    { skill_name: 'accounting', script: 'variance' },
    'complete',
    { variance: 0 },
  ),
  tool('t4', 'readCell', { index: 3 }, 'complete', { source: 'balances' }),
  said(
    't5',
    'assistant',
    'Seven customers owe you, and your notebook says the same total.',
  ),
];

const TOOL_MARKS_SERVERS = [
  {
    id: 'odoo-accounting',
    tools: [{ name: 'odoo_accounting_list_open_balances' }],
  },
];

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

const AVATARS = {
  userAvatar: 'me',
  assistantAvatar: 'ai',
  showAvatars: false,
  avatarSize: 24,
  userAvatarBg: 'accent.subtle',
  assistantAvatarBg: 'accent.emphasis',
};

/** A chat as an application shows it: its presence, its words, its composer. */
function Conversation({
  name,
  face,
  presence,
  items,
  composer = true,
  mcpServers,
}: {
  name: string;
  face: string;
  presence: PresenceState;
  items: DisplayItem[];
  composer?: boolean;
  mcpServers?: { id: string; tools: { name: string }[] }[];
}): JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  return (
    <Box
      flex={1}
      minWidth={0}
      display="flex"
      flexDirection="column"
      height="100%"
    >
      <ChatBaseHeader
        title={name}
        brandIcon={<PresenceFace face={face} size={20} state={presence} />}
        headerContent={<PresenceLine state={presence} />}
        padding={3}
        messageCount={items.length}
        onNewChat={() => undefined}
        onClear={() => undefined}
      />
      <Box flex={1} minHeight={0} overflow="hidden">
        <ChatMessageList
          displayItems={items}
          isLoading={false}
          isStreaming={false}
          showLoadingIndicator={false}
          hideMessagesAfterToolUI={false}
          avatarConfig={AVATARS}
          padding={3}
          emptyContent={null}
          messagesEndRef={endRef as never}
          onRespond={async () => undefined}
          mcpServers={mcpServers}
        />
      </Box>
      {composer && (
        <InputPrompt
          input={input}
          setInput={setInput}
          isLoading={false}
          connectionConfirmed
          placeholder="Send a message"
          autoFocus={false}
          padding={3}
          onSend={() => undefined}
          onStop={() => undefined}
          showTokenUsage={false}
          showModelSelector={false}
          showToolsMenu={false}
          showSkillsMenu={false}
          codemodeEnabled={false}
          hasConfigData={false}
          hasSkillsData={false}
          isA2AProtocol={false}
        />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The four screens
// ---------------------------------------------------------------------------

/** A conversation. */
export function ConversationScreen(): JSX.Element {
  return (
    <Frame>
      <Box flex={1} display="flex" justifyContent="center">
        <Box width="100%" maxWidth={640} display="flex">
          <Conversation
            name="Support desk"
            face="🦊"
            presence="idle"
            items={CONVERSATION}
          />
        </Box>
      </Box>
    </Frame>
  );
}

/** A conversation beside its work: the split, one hairline between them. */
export function BesideWorkScreen(): JSX.Element {
  return (
    <Frame>
      <Box width={400} flexShrink={0} display="flex">
        <Conversation
          name="Support desk"
          face="🦊"
          presence="idle"
          items={BESIDE_WORK}
        />
      </Box>
      <Box
        width="var(--theme-hairline, 1px)"
        bg="border.muted"
        flexShrink={0}
      />
      <Box
        data-reference-work=""
        flex={1}
        minWidth={0}
        p={4}
        display="flex"
        flexDirection="column"
        gap={3}
      >
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>Draft · reply</Text>
        <Heading as="h2" sx={{ fontSize: 3, fontWeight: 600 }}>
          Your order 1042
        </Heading>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>To ada@example.com</Text>
        <Box display="flex" flexDirection="column" gap={2}>
          <Text as="p" sx={{ m: 0 }}>
            Dear Ada,
          </Text>
          <Text as="p" sx={{ m: 0 }}>
            We are sorry your order arrived four days late. It left our
            warehouse on Monday and is with you by Thursday, 8 October.
          </Text>
          <Text as="p" sx={{ m: 0 }}>
            Your next order ships free, with no code to enter.
          </Text>
          <Text as="p" sx={{ m: 0 }}>
            The support desk
          </Text>
        </Box>
        <Box display="flex" gap={2} mt="auto">
          <Button variant="primary">Send</Button>
          <Button>Edit</Button>
        </Box>
      </Box>
    </Frame>
  );
}

/** The activity of a worker: what it did on its own, as it did it. */
export function WorkerActivityScreen(): JSX.Element {
  return (
    <Frame>
      <Box flex={1} display="flex" justifyContent="center">
        <Box width="100%" maxWidth={680} display="flex">
          <Conversation
            name="Inbox triage"
            face="📬"
            presence="working"
            items={WORKER_ACTIVITY}
            composer={false}
          />
        </Box>
      </Box>
    </Frame>
  );
}

/** An approval: the action, the rule that asks, and the one decision. */
export function ApprovalScreen(): JSX.Element {
  return (
    <Frame>
      <Box flex={1} display="flex" justifyContent="center">
        <Box width="100%" maxWidth={640} display="flex">
          <Conversation
            name="Support desk"
            face="🦊"
            presence="waiting"
            items={APPROVAL}
          />
        </Box>
      </Box>
    </Frame>
  );
}

/** Tool calls, each led by the mark of whoever the tool belongs to. */
export function ToolMarksScreen(): JSX.Element {
  return (
    <Frame>
      <Box flex={1} display="flex" justifyContent="center">
        <Box width="100%" maxWidth={680} display="flex">
          <Conversation
            name="Bookkeeper"
            face="🧮"
            presence="idle"
            items={TOOL_MARKS}
            composer={false}
            mcpServers={TOOL_MARKS_SERVERS}
          />
        </Box>
      </Box>
    </Frame>
  );
}

export const REFERENCE_SCREEN_COMPONENTS: Record<
  ReferenceScreen,
  () => JSX.Element
> = {
  conversation: ConversationScreen,
  'beside-work': BesideWorkScreen,
  'worker-activity': WorkerActivityScreen,
  approval: ApprovalScreen,
  'tool-marks': ToolMarksScreen,
};

// ---------------------------------------------------------------------------
// The floating assistant (T-27)
// ---------------------------------------------------------------------------

const BALLOONS: Partial<
  Record<AssistantPicture, AssistantStageProps['balloon']>
> = {
  // A new message, peeked by its first words (T-23).
  speaking: {
    ...peekLine(
      'Three customers wrote about late deliveries this week: Ada, Grace and Alan.',
    ),
    onDismiss: () => undefined,
  },
  // An approval it waits on, answered in the balloon (T-23).
  waiting: {
    text: ASSISTANT_WORDS.approval,
    approval: {
      id: 'picture',
      asks: 'send_reply',
      why: 'Send a reply to a customer: ask me first',
      others: 1,
      onApprove: () => undefined,
      onDeny: () => undefined,
    },
  },
  paused: { text: ASSISTANT_WORDS.paused },
  // Current (T-23): only what it does now — the tool it calls.
  current: {
    text: 'Using list_invoices…',
    tool: {
      id: 'picture-tool',
      tool: 'list_invoices',
      name: 'list_invoices',
      phase: 'running',
    },
    busy: true,
  },
};

/**
 * The paper clip in one state, in the page's corner. `aside` puts a dialog
 * over it: the real `useKeepClear` steps it aside, and the picture shows the
 * dialog alone.
 */
export function AssistantScreen({
  picture,
}: {
  picture: AssistantPicture;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const state: AssistantState =
    picture === 'aside' || picture === 'open'
      ? 'idle'
      : picture === 'current'
        ? 'working'
        : picture;
  const balloon = BALLOONS[picture];
  return (
    <Box flex={1} position="relative">
      {picture === 'open' && <OpenConversation />}
      {picture === 'aside' && (
        <Box
          role="dialog"
          aria-label="A dialog over the assistant"
          position="fixed"
          right={24}
          bottom={24}
          width={280}
          height={160}
          p={3}
          zIndex={2000}
          bg="canvas.overlay"
          border="var(--theme-hairline, 1px) solid"
          borderColor="border.default"
          borderRadius="var(--theme-radius-card, 6px)"
          boxShadow="var(--theme-shadow, none)"
        >
          <Text sx={{ fontWeight: 600 }}>A dialog</Text>
          <Text as="p" sx={{ color: 'fg.muted', fontSize: 1 }}>
            The assistant steps aside while this is open.
          </Text>
        </Box>
      )}
      <AssistantStage
        character="paperclip"
        state={state}
        place={{ right: 48, bottom: 48 }}
        stageRef={stageRef}
        onDragStart={() => undefined}
        open={picture === 'open'}
        onToggle={() => undefined}
        balloon={balloon}
        balloonDisplay={picture === 'current' ? 'current' : 'history'}
        insist={!!balloon}
        onDismiss={() => undefined}
      />
    </Box>
  );
}

/** What the open picture's conversation holds. */
const OPEN_CONVERSATION: DisplayItem[] = [
  said('w', 'assistant', 'Hello! Ask me anything about this page.'),
  said('o1', 'user', 'Which customers wrote about late deliveries this week?'),
  said(
    'o2',
    'assistant',
    'Three of them: **Ada**, **Grace** and **Alan**. Ada’s parcel is two days late; the other two are waiting for a reply.',
  ),
];

/**
 * The conversation open, as the assistant's balloon (T-23): over the
 * character in the page's corner, its tail toward it, the history with the
 * welcome first, *Ask a decision* beside the composer, the Lexical composer
 * last, and its close in the corner — no header, no footer.
 */
function OpenConversation(): JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const height = conversationBalloonHeight(window.innerHeight);
  const left = window.innerWidth - 48 - CONVERSATION_BALLOON_WIDTH;
  return (
    <Box
      data-conversation-balloon=""
      position="fixed"
      right="48px"
      bottom={`${48 + 88 + 16}px`}
      width={`${CONVERSATION_BALLOON_WIDTH}px`}
      height={`${height}px`}
      zIndex={1001}
      display="flex"
      flexDirection="column"
      bg="canvas.default"
      border="1px solid"
      borderColor="border.default"
      boxShadow="shadow.extra-large"
      sx={conversationBalloonSx(
        {
          edge: 'bottom',
          at: balloonTailAt(window.innerWidth - 48 - 44, left),
        },
        'canvas.subtle',
      )}
    >
      <ConversationBalloonClose onClose={() => undefined} />
      <ConversationBalloonHeader count={OPEN_CONVERSATION.length - 1} />
      <Box
        flex={1}
        minHeight={0}
        display="flex"
        flexDirection="column"
        borderRadius="var(--theme-radius-bubble, 16px)"
        overflow="hidden"
      >
        <Box flex={1} minHeight={0} overflow="auto">
          <ChatMessageList
            displayItems={OPEN_CONVERSATION}
            isLoading={false}
            isStreaming={false}
            showLoadingIndicator={false}
            hideMessagesAfterToolUI={false}
            avatarConfig={{ ...AVATARS, showAvatars: true }}
            padding={2}
            emptyContent={null}
            messagesEndRef={endRef as never}
            onRespond={async () => undefined}
          />
        </Box>
        <Box
          px={3}
          pb={1}
          display="flex"
          justifyContent="flex-end"
          fontSize={0}
        >
          <DecisionAsk ask={async () => ({})} />
        </Box>
        <InputPrompt
          input={input}
          setInput={setInput}
          isLoading={false}
          connectionConfirmed
          placeholder="Type a message..."
          autoFocus={false}
          padding={2}
          promptVariant="lexical"
          onSend={() => undefined}
          onStop={() => undefined}
          showTokenUsage={false}
          showModelSelector={false}
          showToolsMenu={false}
          showSkillsMenu={false}
          showAgentsMenu={false}
          codemodeEnabled={false}
          hasConfigData={false}
          hasSkillsData={false}
          isA2AProtocol={false}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The characters (T-25, T-24)
// ---------------------------------------------------------------------------

/** Datalayer's characters and the example plugin's owl, as contributed. */
const characterReactor = buildReactorFromPlugins([
  AssistantCharactersPlugin,
  OwlCharacterPlugin,
]);
characterReactor.start();

/**
 * One character idle in the page's corner, read from what the enabled
 * plugins contribute; `ready` is drawn with it.
 */
export function CharacterScreen({
  character,
  ready,
}: {
  character: CharacterPicture;
  ready?: ReactNode;
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const drawn = assistantCharacterNamed(characterReactor, character);
  return (
    <Box flex={1} position="relative">
      <AssistantStage
        character={drawn}
        state="idle"
        place={{ right: 48, bottom: 48 }}
        stageRef={stageRef}
        onDragStart={() => undefined}
        open={false}
        onToggle={() => undefined}
        onDismiss={() => undefined}
      />
      {ready}
    </Box>
  );
}
