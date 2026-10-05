/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatFloating - A floating chat component.
 *
 * This component provides a floating chat popup that uses ChatBase
 * for all chat functionality (messages, input, protocol support).
 *
 * Supports:
 * 1. AG-UI mode: When `endpoint` is provided
 * 2. Store mode: When `useStore` is true
 * 3. Any protocol supported by ChatBase (AG-UI, A2A, ACP, Vercel AI)
 * 4. A conversation its host draws (`conversation`): the LOOP workspace,
 *    which the embed's bubble, panel and assistant hold (LOOP R-01) — the
 *    floating chrome around it, told by the host what it is doing and what
 *    it last said
 *
 * @module chat/ChatFloating
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconButton, Text, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  XIcon,
  CommentDiscussionIcon,
  GrabberIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { createPortal } from 'react-dom';
import { ChatBase } from './base/ChatBase';
import { ButtonGlow } from './display/ButtonGlow';
import { useViewportDrag } from './useViewportDrag';
import { disabledChatViewModes, resolveMountPoint } from './viewModes';
import { AssistantStage } from './assistant/AssistantStage';
import { decisionsAskerAt } from './assistant/decisions';
import { DecisionAsk } from './assistant/DecisionAsk';
import type { ChatBaseProps } from '../types/chat';
import { ServerSpeaker, type SpeakerState } from '../voice/speaker';
import { useSpokenAnswers } from '../voice/useSpokenAnswers';
import type { ChatVoice } from '../voice';
import {
  BalloonApprovalMessage,
  CONVERSATION_BALLOON_WIDTH,
  ConversationBalloonClose,
  balloonTailAt,
  conversationBalloonHeight,
  conversationBalloonSx,
  CURRENT_BALLOON_HEIGHT,
  peekLine,
  type BalloonTail,
} from './assistant/ConversationBalloon';
import {
  ConversationBalloonHeader,
  CurrentBalloonBody,
} from './assistant/BalloonParts';
import {
  DEFAULT_BALLOON_DISPLAY,
  conversationCount,
  newestToolLine,
  toolLineText,
  type BalloonDisplay,
  type BalloonToolLine,
} from './assistant/toolLine';
import { SpeechBalloon } from './assistant/SpeechBalloon';
import type { BalloonExpandTarget } from './assistant/BalloonVisual';
import {
  DEFAULT_ASSISTANT_CHARACTER,
  type AssistantCharacter,
} from './assistant/characters';
import type { AssistantCharacterData } from './assistant/formats/types';
import {
  assistantStateOf,
  balloonHistoryOf,
  latestSaying,
  newestIsAnswer,
  keepAway,
  keptAway,
  ASSISTANT_WORDS,
  type AssistantAway,
  type AssistantSaying,
  type BalloonApproval,
  type BalloonHistoryMessage,
} from './assistant/state';
import {
  presenceState,
  presenceToolOf,
  type PresenceState,
  type PresenceTool,
} from './presence/presenceStatus';
import {
  useChatOpen,
  useChatMessages,
  useChatStore,
} from '../stores/chatStore';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '@datalayer/core/lib/hooks';
import type { AgentInspectorSink } from '../components/inspector/agentInspector';
import type { AssistantMenuItem } from './assistant/AssistantContextMenu';
import type { AssistantAbout } from './assistant/AssistantStage';
import type { BalloonSuggestion } from './assistant/SpeechBalloon';
import type {
  ChatCommonProps,
  ChatViewMode,
  ProtocolConfig,
  ThemeOverrides,
} from '../types';

/**
 * A conversation the host draws in the floating window, in place of the
 * chat: the LOOP workspace (LOOP R-01). The window keeps its chrome — the
 * button, its blink and its balloon, the panel, the assistant, dragging and
 * dismissing — and is told by the host what the conversation is doing and
 * what it last said, which it would otherwise read from its own chat.
 */
export type FloatingConversation = {
  /** What the window holds, under its header (the face, the title, close). */
  body: React.ReactNode;
  /** What it is doing: idle, thinking, working, waiting for the person, paused. */
  presence: PresenceState;
  /** Its newest words, said in the balloon until heard. */
  saying?: AssistantSaying;
  /** Whether its newest item is the answer being written. */
  answering: boolean;
  /** The tool it is calling now, or just called: said in the balloon. */
  tool?: BalloonToolLine;
};

/**
 * ChatFloating props — extends ChatCommonProps with floating/popup-specific configuration.
 */
export interface ChatFloatingProps extends ChatCommonProps {
  /**
   * AG-UI endpoint URL (e.g., `http://localhost:8000/api/v1/ag-ui/{agentId}/`).
   * When provided with useStore=false, enables AG-UI protocol mode.
   */
  endpoint?: string;

  /** Position of the popup */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Default open state */
  defaultOpen?: boolean;

  /**
   * Properties laid over the theme the conversation wears, by mode — an
   * application's accent (LOOP T-05): the chat sets its theme again inside
   * it, so the accent the page around it set does not reach its bubbles.
   */
  themeOverrides?: ThemeOverrides;

  /** width */
  width?: number | string;

  /** height */
  height?: number | string;

  /** Show the floating button when closed */
  showButton?: boolean;

  /** Enable keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;

  /** Toggle shortcut key */
  toggleShortcut?: string;

  /**
   * Enable click outside to close
   * @default false
   */
  clickOutsideToClose?: boolean;

  /** Enable escape key to close */
  escapeToClose?: boolean;

  /** Custom button icon when closed */
  buttonIcon?: React.ReactNode;

  /** Button tooltip text */
  buttonTooltip?: string;

  /** Brand color override. Defaults to the theme's `accent.emphasis` token. */
  brandColor?: string;

  /**
   * A soft light breathing around the button while the chat is closed, as
   * if it were alive (see `ButtonGlow`). Still, and dimmer, for a reader who
   * asks the system for reduced motion.
   * @default true
   */
  buttonGlow?: boolean;

  /** Offset from edge (in pixels) */
  offset?: number;

  /** Animation duration (in ms) */
  animationDuration?: number;

  /** Initial state (for shared state example) */
  initialState?: Record<string, unknown>;

  /**
   * Default view mode.
   * - 'floating': Full-height floating panel (pinned to right edge with offset)
   * - 'floating-small': Standard floating popup
   * - 'floating-draggable': The popup with a handle, movable about the viewport
   * - 'assistant': A character on the page that speaks in a balloon (LOOP T-21)
   * - 'panel': Full-height side panel (right edge, no floating offset)
   * @default 'floating'
   */
  defaultViewMode?:
    | 'floating'
    | 'floating-small'
    | 'floating-draggable'
    | 'assistant'
    | 'panel';

  /**
   * The character of the floating assistant: one Datalayer ships, by id
   * (`ASSISTANT_CHARACTERS`, LOOP T-25), or one a person loaded from a file
   * they hold the rights to (`readClippyCharacter`, `readAcsCharacter`, T-26).
   * @default 'paperclip'
   */
  assistantCharacter?: string | AssistantCharacter | AssistantCharacterData;

  /**
   * How the floating assistant's balloon shows the conversation (LOOP
   * T-23; an Appspec's `interface.balloon`):
   * - 'history': every message, scrolled, under a header that counts them,
   *   the composer last; closed, the balloon lists the messages too.
   * - 'current': only what it says or does now — the answer being written,
   *   or the tool it calls — in one compact balloon, *Now* on it; open, that
   *   line and the composer, nothing to scroll.
   * Either way a tool call is said in plain words: "Using list_invoices…".
   * @default 'history'
   */
  balloonDisplay?: BalloonDisplay;

  /**
   * Where a large visual the assistant's balloon carries (a notebook) is
   * drawn when expanded: an element of the page, through a portal; unsaid,
   * a large dialog over the page.
   */
  expandTarget?: BalloonExpandTarget;

  /**
   * The runtime the floating assistant asks typed decisions at — its
   * `/api/v1/configure/inference/decisions`, as the `decide` tool asks — and
   * the token to ask with, if it needs one: its balloon offers *Ask a
   * decision*, answered there in plain words with its confidence.
   */
  decisions?: { serverUrl: string; token?: string };

  /**
   * Callback when the user switches view mode via the header toggle.
   * The parent component receives the new ChatViewMode value.
   * When the user selects 'sidebar', the parent should switch to rendering
   * a ChatSidebar instead.
   */
  onViewModeChange?: (mode: ChatViewMode) => void;

  /**
   * Where "Sidebar panel" docks the chat: an element, or a selector for one.
   *
   * The proof there is a sidebar to dock into — without it, the option is
   * shown greyed out in the header. A host that swaps to `<ChatSidebar>`
   * itself on `onViewModeChange('sidebar')` passes the container it renders
   * that sidebar in; a host with no such component passes the element, and
   * the panel is rendered into it from here.
   */
  sidebarMountPoint?: HTMLElement | string | null;

  /**
   * Show backdrop overlay in panel mode.
   * When true, a semi-transparent overlay covers the page behind the panel.
   * @default false
   */
  showPanelBackdrop?: boolean;

  /**
   * A conversation the host draws in the window instead of the chat — the
   * LOOP workspace, as the embed's floating modes do (LOOP R-01). The chat's
   * own props (`protocol`, `suggestions`, …) are then not read.
   */
  conversation?: FloatingConversation;

  /**
   * The Agent Inspector's sink: the chat records its agent's turns and tool
   * calls there, and the assistant's menu offers *Inspect the agent…*.
   */
  inspector?: AgentInspectorSink | null;
  /** The balloon's display, changed from the assistant's menu. */
  onBalloonDisplayChange?: (display: BalloonDisplay) => void;
  /** Opens the host's character picker, from the assistant's menu. */
  onChangeCharacter?: () => void;
  /** What the assistant's menu's *About* says. */
  about?: AssistantAbout;
  /** The host's own entries of the assistant's menu. */
  contextMenu?: readonly AssistantMenuItem[];

  /**
   * Its voice (VOICE.md V1): push-to-talk in the composer, heard on the
   * device; with `output: 'always'`, its answers said by Datalayer's speech
   * service as they are written, the assistant's mouth moving with the sound
   * and its balloon showing the sentence being said.
   */
  voice?: ChatVoice;
}

/**
 * Hook to detect mobile viewport
 */
function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

/**
 * A length in pixels, as a string: a number in `sx` from 0 to 12 is read as
 * the theme's space scale (`left: 8` is 64px).
 */
const px = (value: number): string => `${Math.round(value)}px`;

/** Kept between 8px from the window's start and `max`. */
const clamp = (value: number, max: number): number =>
  Math.max(8, Math.min(value, Math.max(8, max)));

/**
 * ChatFloating component
 * A floating chat window built on ChatBase
 */
export function ChatFloating({
  endpoint,
  protocol: protocolProp,
  useStore: useStoreMode = true,
  title = 'Chat',
  description = 'Start a conversation with the AI agent.',
  position = 'bottom-right',
  defaultOpen = false,
  width = 400,
  height = 550,
  showHeader = true,
  showButton = true,
  showNewChatButton = true,
  showClearButton = true,
  showSettingsButton = false,
  enableKeyboardShortcuts = true,
  toggleShortcut = '/',
  showPoweredBy = true,
  promptVariant,
  mentionableAgents,
  poweredByProps,
  clickOutsideToClose = false,
  escapeToClose = true,
  className,
  onSettingsClick,
  onNewChat,
  onOpen,
  onClose,
  onStateUpdate,
  children,
  brandIcon,
  buttonIcon,
  buttonTooltip = 'Chat with AI',
  brandColor,
  buttonGlow = true,
  offset = 20,
  animationDuration = 200,
  renderToolResult,
  frontendTools,
  initialState: _initialState,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  defaultViewMode = 'floating',
  onViewModeChange,
  sidebarMountPoint = null,
  showPanelBackdrop = false,
  availableModels,
  showModelSelector = false,
  showToolsMenu = false,
  showSkillsMenu = false,
  showTokenUsage = true,
  showContextRing = false,
  themeVariant,
  themeOverrides,
  colorMode,
  runtimeId,
  historyEndpoint,
  authToken,
  historyAuthToken,
  pendingPrompt,
  showInformation = false,
  onInformationClick,
  onToolCallStart,
  onToolCallComplete,
  showToolApprovalBanner,
  pendingApprovals,
  onApproveApproval,
  onRejectApproval,
  panelProps,
  launching = false,
  launchingMessage,
  assistantCharacter = DEFAULT_ASSISTANT_CHARACTER,
  balloonDisplay: balloonDisplayGiven = DEFAULT_BALLOON_DISPLAY,
  expandTarget,
  conversation,
  decisions,
  voice,
  inspector,
  onBalloonDisplayChange,
  onChangeCharacter,
  about,
  contextMenu,
}: ChatFloatingProps) {
  // The chat's own send, once it can: what a suggestion in the balloon sends.
  const chatControls = useRef<{
    send: (message: string) => void;
    stop: () => void;
  } | null>(null);
  const [suggestionPrompt, setSuggestionPrompt] = useState<
    string | undefined
  >();
  const [speechMuted, setSpeechMuted] = useState(false);
  // The balloon's display, as the assistant's menu chose it; the host's
  // until then, and again when the host changes it.
  const [chosenDisplay, setChosenDisplay] = useState<BalloonDisplay>();
  useEffect(() => setChosenDisplay(undefined), [balloonDisplayGiven]);
  const balloonDisplay = chosenDisplay ?? balloonDisplayGiven;
  const changeBalloonDisplay = useCallback(
    (next: BalloonDisplay) => {
      setChosenDisplay(next);
      onBalloonDisplayChange?.(next);
    },
    [onBalloonDisplayChange],
  );
  // Store-based state
  const storeIsOpen = useChatOpen();
  const storeMessages = useChatMessages();
  const setStoreOpen = useChatStore(state => state.setOpen);
  const clearStoreMessages = useChatStore(state => state.clearMessages);

  // Local state for non-store mode
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);

  // Derived state
  const isOpen = useStoreMode ? storeIsOpen : localIsOpen;
  const setIsOpen = useStoreMode ? setStoreOpen : setLocalIsOpen;
  const messages = storeMessages;

  const popupRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [viewMode, setViewMode] = useState<
    'floating' | 'floating-small' | 'floating-draggable' | 'assistant' | 'panel'
  >(defaultViewMode);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [panelInFlow, setPanelInFlow] = useState(false);
  const [panelHostRect, setPanelHostRect] = useState<{
    top: number;
    height: number;
    right: number;
  } | null>(null);

  // Map internal viewMode to ChatViewMode for the header toggle
  const chatViewMode: ChatViewMode =
    viewMode === 'panel' ? 'sidebar' : viewMode;

  /*
   * The host's mount point for a sidebar, resolved each time the chat opens
   * or changes mode: a container may mount after the chat does.
   */
  const [sidebarMount, setSidebarMount] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setSidebarMount(resolveMountPoint(sidebarMountPoint));
  }, [sidebarMountPoint, isOpen, viewMode]);
  const disabledViewModes = disabledChatViewModes({
    sidebarMountPoint: sidebarMount,
    viewMode: chatViewMode,
  });
  const sidebarDisabled = disabledViewModes.includes('sidebar');
  /* Docked into the host's element, rather than measured against it. */
  const dockedInMount = viewMode === 'panel' && !isMobile && !!sidebarMount;

  /*
   * "Floating draggable": the window moves by its handle. Its place is
   * forgotten on leaving the mode, so it comes back where the small popup
   * starts rather than wherever it was last dropped.
   */
  const drag = useViewportDrag(popupRef);
  const resetDrag = drag.reset;
  useEffect(() => {
    if (viewMode !== 'floating-draggable') {
      resetDrag();
    }
  }, [viewMode, resetDrag]);

  /*
   * The floating assistant (LOOP T-21, T-22, T-27): a character that acts out
   * the presence of what answers — read here from the chat's own loading and
   * items — greets when it arrives, says goodbye when sent away, and is
   * dragged about by itself, the conversation following it.
   */
  const ASSISTANT_SIZE = 88;
  const assistantMode = viewMode === 'assistant' && !isMobile;
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTool, setChatTool] = useState<PresenceTool>({
    open: false,
    pendingApproval: false,
  });
  const [ownAnswering, setAnswering] = useState(false);
  // The tool it calls now, and how many messages the history holds (T-23).
  const [ownTool, setOwnTool] = useState<BalloonToolLine | undefined>();
  const [messageCount, setMessageCount] = useState(0);
  // The conversation's messages, listed in the closed `history` balloon.
  const [ownHistory, setOwnHistory] = useState<
    readonly BalloonHistoryMessage[]
  >([]);
  /*
   * Its voice (VOICE.md V1): the answers said by the speech service, as
   * they are written (VO-20), the state following the sound (VO-22).
   */
  const [voiceItems, setVoiceItems] = useState<readonly unknown[]>([]);
  const [speakerState, setSpeakerState] = useState<SpeakerState>({
    speaking: false,
  });
  const speaker = useMemo(
    () =>
      voice && voice.output === 'always' && voice.speechUrl
        ? new ServerSpeaker({
            speechUrl: voice.speechUrl,
            voice: voice.voice,
            language: voice.language,
            token: voice.token,
            onState: setSpeakerState,
          })
        : undefined,
    [voice?.output, voice?.speechUrl],
  );
  useEffect(() => {
    speaker?.update({
      voice: voice?.voice,
      language: voice?.language,
      token: voice?.token,
    });
  }, [speaker, voice?.voice, voice?.language, voice?.token]);
  useEffect(() => () => speaker?.close(), [speaker]);
  // A browser plays only what a gesture allowed: the first one does.
  useEffect(() => {
    if (!speaker) {
      return;
    }
    const unlock = () => speaker.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [speaker]);
  useSpokenAnswers(voiceItems, chatBusy, !!speaker && !speechMuted, speaker);
  const stopSpeaking = useCallback(() => speaker?.stop(), [speaker]);
  const mouthLevel = useMemo(
    () => (speaker ? () => speaker.level() : undefined),
    [speaker],
  );
  const [arriving, setArriving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [assistantAway, setAssistantAway] = useState<AssistantAway>(keptAway);
  const assistantShown = assistantMode && assistantAway === 'none';
  const callAssistantBack = useCallback(() => {
    keepAway('none');
    setAssistantAway('none');
  }, []);
  /*
   * The agent's newest words, said in the balloon until heard (T-23): the
   * chat's own, or what the host's conversation says it said.
   */
  const [ownSaying, setSaying] = useState<AssistantSaying | undefined>();
  const saying = conversation ? conversation.saying : ownSaying;
  const answering = conversation ? conversation.answering : ownAnswering;
  const toolLine = conversation ? conversation.tool : ownTool;
  const showsCurrent = balloonDisplay === 'current';
  const [heardId, setHeardId] = useState<string | undefined>();
  const [freshSaying, setFreshSaying] = useState(false);
  useEffect(() => {
    if (!saying || isOpen) {
      return;
    }
    setFreshSaying(true);
    const timer = setTimeout(() => setFreshSaying(false), 12000);
    return () => clearTimeout(timer);
  }, [saying?.id, saying?.text, isOpen]);
  useEffect(() => {
    if (isOpen && saying) {
      setHeardId(saying.id);
    }
  }, [isOpen, saying?.id]);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageDrag = useViewportDrag(stageRef, { whole: true });
  useEffect(() => {
    if (!assistantShown) {
      return;
    }
    setArriving(true);
    const timer = setTimeout(() => setArriving(false), 1800);
    return () => clearTimeout(timer);
  }, [assistantShown]);
  const assistantState = assistantStateOf(
    conversation ? conversation.presence : presenceState(chatBusy, chatTool),
    {
      arriving,
      leaving,
      speaking: answering,
      voicing: speakerState.speaking,
    },
  );
  const unheard = !!saying && saying.id !== heardId;
  /*
   * The approval it waits on, answered in the balloon (T-23) by the chat's
   * own answers to its approvals — those its tool-approval banner sends.
   */
  const [deciding, setDeciding] = useState(false);
  const firstPending = pendingApprovals?.[0];
  const balloonApproval: BalloonApproval | undefined =
    firstPending && onApproveApproval && onRejectApproval
      ? {
          id: firstPending.id,
          asks: firstPending.toolDescription || firstPending.toolName,
          others: (pendingApprovals?.length ?? 1) - 1,
          deciding,
          onApprove: () => {
            setDeciding(true);
            void Promise.resolve(onApproveApproval(firstPending.id)).finally(
              () => setDeciding(false),
            );
          },
          onDeny: () => {
            setDeciding(true);
            void Promise.resolve(onRejectApproval(firstPending.id)).finally(
              () => setDeciding(false),
            );
          },
        }
      : undefined;
  const assistantDecide = useMemo(
    () =>
      decisions?.serverUrl
        ? decisionsAskerAt(decisions.serverUrl, decisions.token)
        : undefined,
    [decisions?.serverUrl, decisions?.token],
  );
  // At work: a turn runs, or the host's conversation says it does.
  const atWork =
    assistantState === 'thinking' ||
    assistantState === 'working' ||
    assistantState === 'speaking';
  // The tool line, while its call runs or its turn goes on (T-23).
  const toolSaid =
    toolLine && (toolLine.phase === 'running' || atWork) ? toolLine : undefined;
  // Current: what is said now — thinking until the answer's words arrive.
  const currentWords =
    atWork && !answering ? 'Thinking…' : saying?.text || undefined;
  // History: the closed balloon lists the conversation, not its newest line.
  const listedHistory =
    !showsCurrent && !conversation && ownHistory.length > 0
      ? ownHistory
      : undefined;
  const withHistory = <T extends object>(
    said: T,
  ): T & { history?: readonly BalloonHistoryMessage[] } =>
    listedHistory ? { ...said, history: listedHistory } : said;
  const assistantBalloon =
    assistantState === 'paused'
      ? { text: ASSISTANT_WORDS.paused }
      : speakerState.sentence
        ? // Heard: the sentence being said is the one in the balloon (VO-26).
          { text: speakerState.sentence }
        : speakerState.refused
          ? { text: speakerState.refused }
          : balloonApproval
            ? withHistory({
                text: ASSISTANT_WORDS.approval,
                approval: balloonApproval,
              })
            : assistantState === 'waiting'
              ? { text: ASSISTANT_WORDS.waiting }
              : toolSaid
                ? withHistory({
                    text: toolLineText(toolSaid),
                    tool: toolSaid,
                    busy: atWork,
                  })
                : showsCurrent && (unheard || atWork)
                  ? // Current: the words as they are written, whole.
                    {
                      text: currentWords ?? description,
                      more: saying?.more,
                      speaking: answering && atWork,
                      busy: atWork,
                      onDismiss: saying
                        ? () => {
                            setHeardId(saying.id);
                            setFreshSaying(false);
                          }
                        : undefined,
                    }
                  : unheard && saying
                    ? withHistory({
                        // A peek: the first words; the rest is in the
                        // conversation, listed when there is one.
                        ...peekLine(saying.text),
                        onDismiss: () => {
                          setHeardId(saying.id);
                          setFreshSaying(false);
                        },
                      })
                    : withHistory({ text: description });
  const balloonInsists =
    !!speakerState.sentence ||
    assistantState === 'greeting' ||
    assistantState === 'waiting' ||
    !!balloonApproval ||
    !!toolSaid ||
    (showsCurrent && atWork) ||
    (unheard && (assistantState === 'speaking' || freshSaying));
  // The chat's suggestions, in the balloon while it waits for a question:
  // one clicked is sent as the prompt, as if typed.
  const balloonSuggestions = useMemo<BalloonSuggestion[] | undefined>(
    () =>
      conversation || !suggestions?.length
        ? undefined
        : suggestions.map(suggestion => ({
            label: suggestion.title,
            prompt: suggestion.message,
          })),
    [conversation, suggestions],
  );
  const sendSuggestion = useCallback((suggestion: BalloonSuggestion) => {
    if (chatControls.current) {
      chatControls.current.send(suggestion.prompt);
    } else {
      // Not able to send yet: sent once it is.
      setSuggestionPrompt(suggestion.prompt);
    }
  }, []);
  const panelOnSendReady = panelProps?.onSendReady;
  const handleSendReady = useCallback<
    NonNullable<ChatBaseProps['onSendReady']>
  >(
    controls => {
      chatControls.current = controls;
      panelOnSendReady?.(controls);
    },
    [panelOnSendReady],
  );
  const panelOnLoadingChange = panelProps?.onLoadingChange;
  const panelOnDisplayItemsChange = panelProps?.onDisplayItemsChange;
  const handleLoadingChange = useCallback(
    (loading: boolean) => {
      setChatBusy(loading);
      panelOnLoadingChange?.(loading);
    },
    [panelOnLoadingChange],
  );
  const handleDisplayItemsChange = useCallback(
    (items: Parameters<NonNullable<typeof panelOnDisplayItemsChange>>[0]) => {
      const tool = presenceToolOf(items);
      setChatTool(previous =>
        previous.open === tool.open &&
        previous.pendingApproval === tool.pendingApproval
          ? previous
          : tool,
      );
      setAnswering(newestIsAnswer(items));
      const line = newestToolLine(items);
      setOwnTool(previous =>
        previous?.id === line?.id && previous?.phase === line?.phase
          ? previous
          : line,
      );
      setMessageCount(conversationCount(items));
      const listed = balloonHistoryOf(items);
      setOwnHistory(previous =>
        previous.length === listed.length &&
        previous.every(
          (message, index) =>
            message.id === listed[index].id &&
            message.text === listed[index].text,
        )
          ? previous
          : listed,
      );
      setVoiceItems(items);
      const said = latestSaying(items);
      setSaying(previous =>
        previous?.id === said?.id && previous?.text === said?.text
          ? previous
          : said,
      );
      panelOnDisplayItemsChange?.(items);
    },
    [panelOnDisplayItemsChange],
  );

  // Handle view mode changes from the header segmented toggle
  const handleChatViewModeChange = useCallback(
    (mode: ChatViewMode) => {
      if (mode === 'sidebar' && sidebarDisabled) {
        // Greyed out in the header: nothing to dock into.
        return;
      }
      if (mode === 'sidebar') {
        // When a parent callback is provided, let it switch the host layout
        // (e.g. swap to ChatSidebar). Otherwise, fall back to the built-in
        // full-height side panel mode so examples still honor the sidebar
        // selection instead of staying in floating popup mode.
        if (onViewModeChange) {
          onViewModeChange(mode);
          return;
        }
        setViewMode('panel');
        setFocusTrigger(prev => prev + 1);
      } else {
        // The floating modes stay within ChatFloating; picking the assistant
        // calls it back, however long it was sent away for (T-27).
        if (mode === 'assistant') {
          callAssistantBack();
        }
        setViewMode(mode);
        setFocusTrigger(prev => prev + 1);
        onViewModeChange?.(mode);
      }
    },
    [onViewModeChange, sidebarDisabled, callAssistantBack],
  );

  // Detect whether the chat is mounted inside a parent that is intentionally
  // configured for docked side panels (Notebook example lays the chat out as a
  // flex sibling). Those hosts dock the panel in-flow. Plain content pages
  // (AG-UI demos) instead get a fixed panel measured against the host region.
  useLayoutEffect(() => {
    if (viewMode !== 'panel' || isMobile) {
      setPanelInFlow(false);
      return;
    }
    if (sidebarMount) {
      // Rendered into the host's element: in its flow by definition.
      setPanelInFlow(true);
      return;
    }
    const parent = popupRef.current?.parentElement;
    if (!parent) {
      setPanelInFlow(false);
      return;
    }
    const style = window.getComputedStyle(parent);
    const isFlexRow =
      style.display.includes('flex') &&
      (style.flexDirection === 'row' || style.flexDirection === 'row-reverse');
    const isGrid = style.display.includes('grid');
    setPanelInFlow(isFlexRow || isGrid);
  }, [viewMode, isMobile, isOpen, sidebarMount]);

  // For fixed (non-flow) panel mode, measure the host region so the docked
  // panel aligns to the visible content area (below any app header) at full
  // height, and reserve horizontal space so the page content reflows to the
  // left instead of being covered like an overlay.
  const panelWidthPx =
    typeof width === 'number'
      ? width
      : typeof width === 'string'
        ? Number.parseInt(width, 10) || 420
        : 420;

  useLayoutEffect(() => {
    if (isMobile || viewMode !== 'panel' || panelInFlow || !isOpen) {
      setPanelHostRect(null);
      return;
    }
    const host = popupRef.current?.parentElement;
    if (!host) {
      setPanelHostRect(null);
      return;
    }

    const prevPaddingRight = host.style.paddingRight;
    const prevBoxSizing = host.style.boxSizing;
    const basePaddingRight = window.getComputedStyle(host).paddingRight;
    host.style.boxSizing = 'border-box';
    host.style.paddingRight = `calc(${basePaddingRight} + ${panelWidthPx}px)`;

    const measure = () => {
      const rect = host.getBoundingClientRect();
      setPanelHostRect(prev => {
        // A host that holds nothing of the page — an embed's own element,
        // everything in it fixed to the viewport — has no height to align
        // to: the panel is then the viewport's right edge, at full height.
        const next =
          rect.height < 1
            ? { top: 0, height: window.innerHeight, right: 0 }
            : {
                top: rect.top,
                height: rect.height,
                right: Math.max(0, window.innerWidth - rect.right),
              };
        if (
          prev &&
          Math.abs(prev.top - next.top) < 1 &&
          Math.abs(prev.height - next.height) < 1 &&
          Math.abs(prev.right - next.right) < 1
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = new ResizeObserver(measure);
    observer.observe(host);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer.disconnect();
      host.style.paddingRight = prevPaddingRight;
      host.style.boxSizing = prevBoxSizing;
    };
  }, [isMobile, viewMode, panelInFlow, isOpen, panelWidthPx]);

  // Build protocol config from endpoint if not provided directly
  // Memoize to avoid creating new object on every render (which would trigger useEffect re-runs)
  const protocol: ProtocolConfig | undefined = useMemo(() => {
    // Full ProtocolConfig object takes precedence
    if (protocolProp && typeof protocolProp === 'object') return protocolProp;

    if (!endpoint) return undefined;

    // If protocolProp is a Protocol string, use it as explicit type override
    const explicitType =
      typeof protocolProp === 'string' ? protocolProp : undefined;

    // Extract base URL from endpoint - everything before /api/v1/
    // e.g., https://prod1.datalayer.run/agent-runtimes/pool1/rt123/api/v1/ag-ui/default/
    //     -> https://prod1.datalayer.run/agent-runtimes/pool1/rt123
    const baseUrl =
      endpoint.match(/^(.*?)\/api\/v1\//)?.[1] ||
      endpoint.match(/^(https?:\/\/[^/]+)/)?.[1] ||
      '';

    // Detect protocol type from endpoint path (fallback when no explicit type)
    const protocolMatch = endpoint.match(
      /\/api\/v1\/(ag-ui|vercel-ai|a2a|acp)\//,
    );
    const detectedType = (explicitType ?? protocolMatch?.[1] ?? 'vercel-ai') as
      'ag-ui' | 'vercel-ai' | 'a2a' | 'acp';

    // Extract agentId from endpoint path
    const agentIdMatch = endpoint.match(
      /\/api\/v1\/(?:ag-ui|vercel-ai|a2a\/agents|acp\/ws)\/([^/]+)/,
    );
    const extractedAgentId = agentIdMatch ? agentIdMatch[1] : undefined;

    return {
      type: detectedType,
      endpoint,
      agentId: extractedAgentId,
      authToken,
      // Enable config query for model/tools/skills selector or token usage
      enableConfigQuery:
        showModelSelector || showToolsMenu || showSkillsMenu || showTokenUsage,
      // Config endpoint is at /api/v1/configure (global, not per-agent)
      configEndpoint:
        showModelSelector || showToolsMenu || showSkillsMenu || showTokenUsage
          ? `${baseUrl}/api/v1/configure`
          : undefined,
    };
  }, [
    protocolProp,
    endpoint,
    authToken,
    showModelSelector,
    showToolsMenu,
    showSkillsMenu,
    showTokenUsage,
  ]);

  // Clear messages when endpoint/protocol changes (e.g., switching examples)
  useEffect(() => {
    clearStoreMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, protocolProp]);

  // Initialize open state from defaultOpen
  useEffect(() => {
    setIsOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle popup with animation
  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    setIsAnimating(true);

    if (newOpen) {
      setIsOpen(newOpen);
      onOpen?.();
    } else {
      // Delay closing for animation
      setTimeout(() => {
        setIsOpen(newOpen);
        onClose?.();
        setIsAnimating(false);
      }, animationDuration);
    }

    // Reset animating after duration
    setTimeout(() => setIsAnimating(false), animationDuration);
  }, [isOpen, setIsOpen, onOpen, onClose, animationDuration]);

  /*
   * The assistant sent away (T-27): goodbye first, then the popup's round
   * button in its place — which calls it back when it went for the page, and
   * opens the chat when it went for the session or for good.
   */
  const dismissAssistant = useCallback(
    (away: AssistantAway) => {
      if (isOpen) {
        handleToggle();
      }
      keepAway(away);
      setLeaving(true);
      setTimeout(() => {
        setLeaving(false);
        setAssistantAway(away);
      }, 600);
    },
    [isOpen, handleToggle],
  );

  /*
   * The conversation as the assistant's balloon: above the character, its
   * edge on the character's, never off the screen, and its tail toward the
   * character — none when it stands beside it.
   */
  const viewportWidth =
    typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight =
    typeof window === 'undefined' ? 800 : window.innerHeight;
  const conversationHeight = conversationBalloonHeight(viewportHeight);
  // Open, `current` is the line and the composer; `history`, 60% of the window.
  const currentOpen = showsCurrent && !conversation;
  const openBalloonHeight = currentOpen
    ? CURRENT_BALLOON_HEIGHT
    : conversationHeight;
  const balloonGeometry = (): {
    place: React.CSSProperties;
    tail: BalloonTail;
  } => {
    const widthPx = CONVERSATION_BALLOON_WIDTH;
    const heightPx = openBalloonHeight;
    if (stageDrag.position) {
      // Toward the page's inside: above the character, below it, or beside
      // it when the window is too short for either.
      const { left, top } = stageDrag.position;
      const onLeft = left + ASSISTANT_SIZE / 2 < viewportWidth / 2;
      const above = top - heightPx - 16;
      const below = top + ASSISTANT_SIZE + 16;
      const beside = above < 8 && below + heightPx > viewportHeight - 8;
      const x = beside
        ? onLeft
          ? left + ASSISTANT_SIZE + 16
          : left - widthPx - 16
        : onLeft
          ? left
          : left + ASSISTANT_SIZE - widthPx;
      const y = beside
        ? top + ASSISTANT_SIZE - heightPx
        : above >= 8
          ? above
          : below;
      const placedX = clamp(x, viewportWidth - widthPx - 8);
      return {
        place: {
          left: px(placedX),
          top: px(clamp(y, viewportHeight - heightPx - 8)),
          right: 'auto',
          bottom: 'auto',
        },
        tail: beside
          ? { edge: 'none' }
          : {
              edge: above >= 8 ? 'bottom' : 'top',
              at: balloonTailAt(left + ASSISTANT_SIZE / 2, placedX),
            },
      };
    }
    const onRight = position.endsWith('right');
    const characterMiddle = onRight
      ? viewportWidth - offset - ASSISTANT_SIZE / 2
      : offset + ASSISTANT_SIZE / 2;
    const balloonLeft = onRight ? viewportWidth - offset - widthPx : offset;
    const tail: BalloonTail = {
      edge: position.startsWith('bottom') ? 'bottom' : 'top',
      at: balloonTailAt(characterMiddle, balloonLeft),
    };
    const corner = getPositionStyles();
    return {
      place: position.startsWith('bottom')
        ? { ...corner, bottom: px(offset + ASSISTANT_SIZE + 16) }
        : { ...corner, top: px(offset + ASSISTANT_SIZE + 16) },
      tail,
    };
  };

  // Handle new chat
  const handleNewChat = useCallback(() => {
    if (useStoreMode) {
      clearStoreMessages();
    }
    onNewChat?.();
  }, [useStoreMode, clearStoreMessages, onNewChat]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      if (useStoreMode) {
        clearStoreMessages();
      }
    }
  }, [useStoreMode, clearStoreMessages]);

  // Keyboard shortcuts
  useChatKeyboardShortcuts({
    onToggle: enableKeyboardShortcuts ? handleToggle : undefined,
    onNewChat: enableKeyboardShortcuts ? handleNewChat : undefined,
    onClear:
      enableKeyboardShortcuts && messages.length > 0 ? handleClear : undefined,
    enabled: enableKeyboardShortcuts,
  });

  // Escape to close
  useEffect(() => {
    if (!escapeToClose || !isOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleToggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [escapeToClose, isOpen, handleToggle]);

  /*
   * A host's conversation takes the caret when the window opens, as the
   * chat's own does (`autoFocus`): its composer, once the window shows.
   */
  const hostsConversation = Boolean(conversation);
  useEffect(() => {
    if (!hostsConversation || !isOpen) {
      return undefined;
    }
    const timer = setTimeout(() => {
      popupRef.current
        ?.querySelector<HTMLElement>(
          '[data-chat-composer] textarea, [data-chat-composer] [contenteditable="true"], textarea',
        )
        ?.focus();
    }, animationDuration);
    return () => clearTimeout(timer);
  }, [hostsConversation, isOpen, animationDuration, focusTrigger]);

  /*
   * The assistant's balloon opens on the newest message: the history may
   * have grown — or arrived — while it was closed.
   */
  useEffect(() => {
    if (!assistantShown || !isOpen) {
      return undefined;
    }
    const timer = setTimeout(() => {
      const history = popupRef.current?.querySelector<HTMLElement>(
        '[data-chat-history]',
      );
      history?.scrollTo?.({ top: history.scrollHeight });
    }, animationDuration);
    return () => clearTimeout(timer);
  }, [assistantShown, isOpen, animationDuration]);

  // Click outside to close
  useEffect(() => {
    if (!clickOutsideToClose || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        handleToggle();
      }
    };

    // Delay adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [clickOutsideToClose, isOpen, handleToggle]);

  // Mobile body scroll lock
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.touchAction = 'none';

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.touchAction = '';
      };
    }
  }, [isMobile, isOpen]);

  // Position styles
  const getPositionStyles = (): React.CSSProperties => {
    const styles: React.CSSProperties = {
      position: 'fixed',
      zIndex: 1000,
    };

    switch (position) {
      case 'bottom-right':
        styles.bottom = offset;
        styles.right = offset;
        break;
      case 'bottom-left':
        styles.bottom = offset;
        styles.left = offset;
        break;
      case 'top-right':
        styles.top = offset;
        styles.right = offset;
        break;
      case 'top-left':
        styles.top = offset;
        styles.left = offset;
        break;
    }

    return styles;
  };

  // Animation transform based on position
  const getAnimationTransform = (open: boolean): string => {
    if (open) return 'scale(1) translateY(0)';

    switch (position) {
      case 'bottom-right':
      case 'bottom-left':
        return 'scale(0.95) translateY(20px)';
      case 'top-right':
      case 'top-left':
        return 'scale(0.95) translateY(-20px)';
      default:
        return 'scale(0.95)';
    }
  };

  // Shortcut hint for toggle
  const shortcutHint = enableKeyboardShortcuts
    ? getShortcutDisplay({
        key: toggleShortcut,
        ctrlOrCmd: true,
        handler: () => {},
      })
    : undefined;

  // Responsive dimensions
  const conversationBalloon = assistantShown ? balloonGeometry() : undefined;

  // The assistant's conversation is a balloon of its own size (T-23).
  const popupWidth = isMobile
    ? '100%'
    : conversationBalloon
      ? CONVERSATION_BALLOON_WIDTH
      : width;
  const popupHeight = isMobile
    ? '100%'
    : conversationBalloon
      ? openBalloonHeight
      : height;

  // Mobile full-screen styles
  const mobileStyles: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        borderRadius: 0,
      }
    : {};

  // Close button for header
  const closeButton = (
    <Tooltip text={`Close${escapeToClose ? ' (Esc)' : ''}`} direction="s">
      <IconButton
        icon={XIcon}
        aria-label="Close"
        onClick={handleToggle}
        variant="invisible"
        size="small"
      />
    </Tooltip>
  );

  /*
   * The chat as the assistant's balloon holds it (T-23): the history and the
   * composer, its Lexical variant, and nothing else — no header, no footer,
   * none of the session's controls; the welcome as the first message, an
   * approval as a message with Approve and Deny, and *Ask a decision* beside
   * the composer when there is a runtime to ask.
   */
  const assistantChat: Partial<ChatBaseProps> | undefined = conversationBalloon
    ? {
        showHeader: false,
        showPoweredBy: false,
        promptVariant: 'lexical' as const,
        showModelSelector: false,
        showToolsMenu: false,
        showSkillsMenu: false,
        showTokenUsage: false,
        showContextRing: false,
        showInformation: false,
        showToolApprovalBanner: false,
        showAgentsMenu: false,
        showTurnFooter: false,
        compact: true,
        welcome: description,
        backgroundColor: 'canvas.default',
        borderRadius: 'var(--theme-radius-bubble, 16px)',
        trailingContent: balloonApproval ? (
          <BalloonApprovalMessage approval={balloonApproval} />
        ) : undefined,
        footerContent: assistantDecide ? (
          <Box
            data-balloon-decisions=""
            sx={{
              px: 3,
              pb: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              fontSize: 0,
              '& form': { alignSelf: 'stretch' },
              '& [data-balloon-decision="answered"]': { alignSelf: 'stretch' },
            }}
          >
            <DecisionAsk ask={assistantDecide} />
          </Box>
        ) : undefined,
      }
    : undefined;

  /* The window itself; where it goes is decided below. */
  const chatWindow = (
    <Box
      ref={popupRef}
      className={className}
      sx={{
        position:
          viewMode === 'panel' && !isMobile && (panelInFlow || dockedInMount)
            ? 'relative'
            : ('fixed' as const),
        // floating (normal) — full-height column pinned to the right edge
        ...(viewMode === 'floating' && !isMobile
          ? {
              top: 0,
              right: 0,
              bottom: 0,
              left: 'auto',
            }
          : {}),
        // floating-small — standard popup positioned via getPositionStyles()
        ...(viewMode === 'floating-small' && !isMobile
          ? getPositionStyles()
          : {}),
        // floating-draggable — where it was last put down, or where the
        // small popup starts until somebody moves it
        ...(viewMode === 'floating-draggable' && !isMobile
          ? drag.position
            ? {
                left: px(drag.position.left),
                top: px(drag.position.top),
                right: 'auto',
                bottom: 'auto',
              }
            : getPositionStyles()
          : {}),
        ...(conversationBalloon
          ? conversationBalloon.place
          : assistantMode && !isMobile
            ? getPositionStyles()
            : {}),
        ...(viewMode === 'panel' && !isMobile
          ? {
              ...(panelInFlow || dockedInMount
                ? {
                    top: 'auto',
                    right: 'auto',
                    bottom: 'auto',
                    left: 'auto',
                    marginLeft: 'auto',
                    alignSelf: 'stretch',
                  }
                : {
                    // Fixed panel aligned to the measured host region so it
                    // docks below any app header at full content height,
                    // instead of overlaying from the very top of the viewport.
                    top: panelHostRect ? `${panelHostRect.top}px` : 0,
                    right: panelHostRect ? `${panelHostRect.right}px` : 0,
                    bottom: panelHostRect ? 'auto' : 0,
                    left: 'auto',
                  }),
            }
          : {}),
        width:
          viewMode === 'panel' && !isMobile
            ? isOpen || isAnimating
              ? `${panelWidthPx}px`
              : '0px'
            : viewMode === 'floating' && !isMobile
              ? typeof popupWidth === 'number'
                ? `${popupWidth}px`
                : popupWidth
              : (viewMode === 'floating-small' ||
                    viewMode === 'floating-draggable' ||
                    viewMode === 'assistant') &&
                  !isMobile
                ? typeof popupWidth === 'number'
                  ? `${popupWidth}px`
                  : popupWidth
                : isMobile
                  ? '100%'
                  : typeof popupWidth === 'number'
                    ? `${popupWidth}px`
                    : popupWidth,
        height:
          viewMode === 'panel' && !isMobile
            ? panelInFlow || dockedInMount
              ? '100%'
              : panelHostRect
                ? `${panelHostRect.height}px`
                : '100%'
            : viewMode === 'floating' && !isMobile
              ? '100%'
              : (viewMode === 'floating-small' ||
                    viewMode === 'floating-draggable' ||
                    viewMode === 'assistant') &&
                  !isMobile
                ? typeof popupHeight === 'number'
                  ? `${popupHeight}px`
                  : popupHeight
                : isMobile
                  ? '100%'
                  : typeof popupHeight === 'number'
                    ? `${popupHeight}px`
                    : popupHeight,
        display: 'flex',
        flexDirection: 'column',
        bg: 'canvas.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius:
          viewMode === 'panel' || isMobile
            ? 0
            : assistantMode
              ? 'var(--theme-radius-bubble, 16px)'
              : '12px',
        boxShadow: viewMode === 'panel' ? 'shadow.none' : 'shadow.extra-large',
        overflow: 'hidden',
        transform:
          viewMode === 'panel'
            ? isOpen
              ? 'translateX(0)'
              : 'translateX(100%)'
            : getAnimationTransform(isOpen),
        opacity: viewMode === 'panel' ? 1 : isOpen ? 1 : 0,
        transition: `transform ${animationDuration}ms ease, opacity ${animationDuration}ms ease, width ${animationDuration}ms ease`,
        zIndex:
          viewMode === 'panel' && !isMobile
            ? panelInFlow || dockedInMount
              ? 'auto'
              : 1001
            : 1001,
        // Hide from accessibility and pointer events when closed
        visibility: isOpen || isAnimating ? 'visible' : 'hidden',
        pointerEvents: isOpen ? 'auto' : 'none',
        ...mobileStyles,
        // The assistant's balloon: its shape and its tail toward the
        // character, which the window's own clipping would cut off.
        ...(conversationBalloon
          ? conversationBalloonSx(
              conversationBalloon.tail,
              // Out of the composer's band, or of the history's top.
              conversationBalloon.tail.edge === 'bottom'
                ? 'canvas.subtle'
                : 'canvas.default',
            )
          : {}),
      }}
      data-conversation-balloon={conversationBalloon ? '' : undefined}
      data-balloon-display={conversationBalloon ? balloonDisplay : undefined}
    >
      {conversationBalloon ? (
        <ConversationBalloonClose onClose={handleToggle} />
      ) : null}
      {/* History: what it holds, and how many messages (T-23). */}
      {conversationBalloon && !currentOpen ? (
        <ConversationBalloonHeader count={messageCount} />
      ) : null}
      {/* The handle "Floating draggable" is moved by. */}
      {viewMode === 'floating-draggable' && !isMobile && (
        <Box
          onPointerDown={drag.onHandlePointerDown}
          aria-label="Move the chat"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            height: 18,
            cursor: 'grab',
            color: 'fg.subtle',
            bg: 'canvas.subtle',
            borderBottom: '1px solid',
            borderColor: 'border.muted',
            touchAction: 'none',
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <GrabberIcon size={16} />
        </Box>
      )}
      {conversation ? (
        <>
          {/* The window's own header: the face, the title, close. None in
              the assistant's balloon, which closes from its corner. */}
          {showHeader && !conversationBalloon ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flexShrink: 0,
                px: 3,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              {brandIcon || <AiAgentIcon colored size={20} />}
              <Text
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 'semibold',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </Text>
              {closeButton}
            </Box>
          ) : null}
          <Box
            data-floating-conversation
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              ...(conversationBalloon
                ? {
                    borderRadius: 'var(--theme-radius-bubble, 16px)',
                    overflow: 'hidden',
                  }
                : {}),
            }}
          >
            {conversation.body}
          </Box>
        </>
      ) : (
        <ChatBase
          title={title}
          showHeader={showHeader}
          useStore={useStoreMode}
          protocol={protocol}
          themeVariant={themeVariant}
          themeOverrides={themeOverrides}
          colorMode={colorMode}
          autoFocus={isOpen}
          focusTrigger={focusTrigger}
          launching={launching}
          launchingMessage={launchingMessage}
          brandIcon={brandIcon || <AiAgentIcon colored size={20} />}
          headerButtons={{
            showNewChat: showNewChatButton,
            showClear: showClearButton && messages.length > 0,
            showSettings: showSettingsButton && !!onSettingsClick,
            onNewChat: handleNewChat,
            onClear: handleClear,
            onSettings: onSettingsClick,
          }}
          headerActions={<>{closeButton}</>}
          chatViewMode={chatViewMode}
          onChatViewModeChange={handleChatViewModeChange}
          disabledViewModes={disabledViewModes}
          showPoweredBy={showPoweredBy}
          // Forwarded, so a host can ask for the Lexical editor — and with it
          // the `@` menu — without giving up the floating chat to get one.
          promptVariant={promptVariant}
          mentionableAgents={mentionableAgents}
          poweredByProps={{
            brandName: 'Datalayer',
            brandUrl: 'https://datalayer.ai',
            ...poweredByProps,
          }}
          renderToolResult={renderToolResult}
          description={description}
          onStateUpdate={onStateUpdate}
          onNewChat={onNewChat}
          suggestions={suggestions}
          submitOnSuggestionClick={submitOnSuggestionClick}
          hideMessagesAfterToolUI={hideMessagesAfterToolUI}
          avatarConfig={{
            showAvatars: true,
          }}
          placeholder="Type a message..."
          backgroundColor="canvas.subtle"
          frontendTools={frontendTools}
          showModelSelector={showModelSelector}
          availableModels={availableModels}
          showToolsMenu={showToolsMenu}
          showSkillsMenu={showSkillsMenu}
          showTokenUsage={showTokenUsage}
          showContextRing={showContextRing}
          runtimeId={runtimeId}
          historyEndpoint={historyEndpoint}
          historyAuthToken={historyAuthToken}
          pendingPrompt={pendingPrompt ?? suggestionPrompt}
          inspector={inspector}
          showInformation={showInformation}
          onInformationClick={onInformationClick}
          onToolCallStart={onToolCallStart}
          onToolCallComplete={onToolCallComplete}
          showToolApprovalBanner={showToolApprovalBanner}
          pendingApprovals={pendingApprovals}
          onApproveApproval={onApproveApproval}
          onRejectApproval={onRejectApproval}
          voice={voice}
          voiceSpeaking={speakerState.speaking}
          onStopSpeaking={speaker ? stopSpeaking : undefined}
          {...panelProps}
          {...assistantChat}
          onLoadingChange={handleLoadingChange}
          onDisplayItemsChange={handleDisplayItemsChange}
          onSendReady={handleSendReady}
        >
          {conversationBalloon && currentOpen ? (
            // Current: the one thing said or done now, over the composer.
            <Box sx={{ px: 3, pt: 3, pb: 2, overflow: 'hidden' }}>
              <CurrentBalloonBody
                text={toolSaid ? undefined : (currentWords ?? description)}
                tool={toolSaid}
                busy={atWork}
                speaking={answering && atWork}
                waiting={atWork && !answering}
              />
            </Box>
          ) : (
            children
          )}
        </ChatBase>
      )}
    </Box>
  );

  /*
   * The floating popup's button. Words not yet heard make it blink for the
   * person's attention, until the chat is opened; hovered, they show in a
   * balloon above it in place of the tooltip.
   */
  const chatButton = (
    <IconButton
      icon={
        buttonIcon ? (buttonIcon as React.ElementType) : CommentDiscussionIcon
      }
      aria-label={buttonTooltip}
      // With words to say, the balloon stands in for the tooltip: Primer's
      // own would cover it.
      unsafeDisableTooltip={!!saying}
      onClick={
        assistantMode && assistantAway === 'page'
          ? callAssistantBack
          : handleToggle
      }
      size="large"
      sx={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        bg: brandColor || 'accent.emphasis',
        color: 'fg.onEmphasis',
        boxShadow: 'shadow.large',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        // Words not yet heard: the circle blinks for the person's
        // attention, and stops once the chat is opened.
        ...(unheard
          ? {
              animation: 'chatFloatingBlink 1.1s ease-in-out infinite',
              '@keyframes chatFloatingBlink': {
                '0%, 100%': {
                  filter: 'brightness(1)',
                  boxShadow: '0 0 0 0 rgba(0,0,0,0)',
                },
                '50%': {
                  filter: 'brightness(1.25)',
                  boxShadow:
                    '0 0 0 6px var(--bgColor-accent-muted, rgba(84,174,255,0.4))',
                },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }
          : {}),
        '&:hover': {
          bg: brandColor || 'accent.emphasis',
          boxShadow: 'shadow.extra-large',
        },
      }}
    />
  );

  return (
    <>
      {/* The floating assistant: the character, open or closed (T-21). */}
      {assistantShown && (
        <AssistantStage
          character={assistantCharacter}
          state={assistantState}
          size={ASSISTANT_SIZE}
          place={
            stageDrag.position
              ? {
                  left: px(stageDrag.position.left),
                  top: px(stageDrag.position.top),
                }
              : getPositionStyles()
          }
          stageRef={stageRef}
          onDragStart={stageDrag.onHandlePointerDown}
          open={isOpen}
          onToggle={handleToggle}
          balloon={assistantBalloon}
          balloonDisplay={balloonDisplay}
          expandTarget={expandTarget}
          insist={balloonInsists}
          onDismiss={dismissAssistant}
          ownRef={popupRef}
          mouthLevel={mouthLevel}
          suggestions={balloonSuggestions}
          onSuggestion={sendSuggestion}
          inspector={inspector}
          onBalloonDisplayChange={changeBalloonDisplay}
          onStop={
            chatBusy && chatControls.current
              ? () => chatControls.current?.stop()
              : undefined
          }
          onNewChat={
            !conversation && showNewChatButton ? handleNewChat : undefined
          }
          onClear={!conversation && useStoreMode ? handleClear : undefined}
          onChangeCharacter={onChangeCharacter}
          speech={
            speaker
              ? {
                  muted: speechMuted,
                  onToggle: () => {
                    if (!speechMuted) {
                      speaker.stop();
                    }
                    setSpeechMuted(!speechMuted);
                  },
                }
              : undefined
          }
          onResetPosition={stageDrag.position ? stageDrag.reset : undefined}
          about={about}
          contextMenu={contextMenu}
        />
      )}

      {/* Floating button when closed */}
      {showButton && !isOpen && !assistantShown && (
        <Box
          sx={{
            ...getPositionStyles(),
          }}
        >
          <Box
            sx={{
              position: 'relative',
              display: 'inline-flex',
              // The glow's halos go behind the button, not behind the page.
              isolation: 'isolate',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {buttonGlow && <ButtonGlow color={brandColor} />}
            {/*
              Hovered with something said: the agent's newest words in a
              balloon, as the floating assistant says them (T-23); otherwise
              the tooltip.
            */}
            {isHovered && saying ? (
              <SpeechBalloon
                text={saying.text}
                more={saying.more}
                onOpen={handleToggle}
                above={64}
                side={position.startsWith('bottom') ? 'above' : 'below'}
                align={position.includes('right') ? 'right' : 'left'}
                tailAt={28}
              />
            ) : null}
            {saying ? (
              chatButton
            ) : (
              <Tooltip
                text={`${buttonTooltip}${shortcutHint ? ` (${shortcutHint})` : ''}`}
                direction={position.includes('right') ? 'w' : 'e'}
              >
                {chatButton}
              </Tooltip>
            )}

            {/* Unread badge */}
            {messages.length > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  minWidth: 18,
                  height: 18,
                  px: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bg: 'danger.emphasis',
                  color: 'fg.onEmphasis',
                  borderRadius: '50%',
                  fontSize: 0,
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                }}
              >
                <Text sx={{ fontSize: 0 }}>
                  {messages.length > 99 ? '99+' : messages.length}
                </Text>
              </Box>
            )}

            {/* A ring going out while words are not yet heard */}
            {unheard && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: brandColor || 'accent.emphasis',
                  animation: 'pulse 2s infinite',
                  pointerEvents: 'none',
                  '@keyframes pulse': {
                    '0%': {
                      transform: 'scale(1)',
                      opacity: 1,
                    },
                    '100%': {
                      transform: 'scale(1.5)',
                      opacity: 0,
                    },
                  },
                  // Still, as a ring held around the button, for a reader
                  // who asks the system for reduced motion (T-28).
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                    transform: 'scale(1.15)',
                    opacity: 0.6,
                  },
                }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Mobile overlay backdrop */}
      {isMobile && isOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bg: 'neutral.muted',
            opacity: 0.5,
            zIndex: 999,
          }}
          onClick={handleToggle}
        />
      )}

      {/* Panel mode backdrop overlay - only shown when showPanelBackdrop is true */}
      {showPanelBackdrop && viewMode === 'panel' && isOpen && !isMobile && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bg: 'neutral.muted',
            opacity: 0.3,
            zIndex: 1000,
          }}
          onClick={handleToggle}
        />
      )}

      {/* The window: in place, or into the host's mount point when docked there. */}
      {dockedInMount && sidebarMount
        ? createPortal(chatWindow, sidebarMount)
        : chatWindow}
    </>
  );
}

export default ChatFloating;
