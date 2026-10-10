/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant on the page (LOOP T-21, T-22, T-27): a character in
 * a corner, acting out what the application is doing, with a balloon that
 * says a word while the conversation is closed. Clicked, it opens the
 * conversation; dragged, it moves, and the conversation follows; sent away,
 * it says goodbye and leaves a small way back. It never sits over an open
 * dialog, an overlay or another chat's composer, nor where the pointer is
 * working: it steps aside — out of sight and out of the pointer's way — until
 * the place is clear again.
 *
 * Right-clicked — or Shift+F10 or the ContextMenu key while it has the
 * focus, or a long press — it opens its own menu where the pointer is
 * (`AssistantContextMenu`): what the host passes applies — *Inspect the
 * agent…* (the Agent Inspector, in a dialog loaded then), the conversation,
 * the balloon's display, the suggestions, *Stop*, a new conversation,
 * another character, its voice, a brought character's sounds (off until
 * *Play its sounds*), send it away, its place, about it — and
 * what a host or a plugin adds (`contextMenu`).
 *
 * Given suggestions, its balloon offers them while it waits for a question
 * (idle, or greeting): one clicked is sent as the prompt (`onSuggestion`).
 *
 * Its motions are one set for every character, by the parts each drawing
 * names (`assistant-body`, `-pupils`, `-lids`, `-mouth`), and nothing moves
 * for a reader who asks the system for reduced motion.
 *
 * @module chat/assistant/AssistantStage
 */

import type { JSX, ReactNode, RefObject } from 'react';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ActionList, ActionMenu, IconButton, useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  CodeIcon,
  CommentDiscussionIcon,
  DependabotIcon,
  InfoIcon,
  MuteIcon,
  PencilIcon,
  PlusIcon,
  PulseIcon,
  ScreenNormalIcon,
  SquareFillIcon,
  TrashIcon,
  UnmuteIcon,
  XIcon,
} from '@primer/octicons-react';
import { Dialog, Text } from '@primer/react';
import { assistantCharacter, type AssistantCharacter } from './characters';
import {
  BalloonHistoryLarge,
  SpeechBalloon,
  type BalloonSuggestion,
} from './SpeechBalloon';
import { conversationHeaderText } from './BalloonParts';
import {
  AssistantContextMenu,
  LONG_PRESS_MS,
  opensContextMenu,
  type AssistantMenuItem,
} from './AssistantContextMenu';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import type { AssistantSandbox } from './assistantDetails';
import {
  BalloonExpandContext,
  ExpandedVisual,
  focusExpanded,
  type BalloonExpandTarget,
  type BalloonVisual,
} from './BalloonVisual';
import { SpriteCharacter } from './SpriteCharacter';
import type { AssistantCharacterData } from './formats/types';
import type { DecisionAsker } from './decisions';
import {
  conversationCount,
  type BalloonDisplay,
  type BalloonToolLine,
} from './toolLine';
import type { DisplayItem } from '../../types/chat';
import {
  ASSISTANT_OBSTACLES,
  POINTER_CALM_MS,
  mouthOpening,
  boxesMeet,
  pointerNear,
  type AssistantAway,
  type AssistantState,
  type BalloonApproval,
} from './state';
import { useChatWords } from '../ChatLanguage';

/** The motions, by the state the stage is in. */
const MOTIONS = {
  '@keyframes assistantFloat': {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-3px)' },
  },
  '@keyframes assistantBlink': {
    '0%, 94%, 100%': { transform: 'scaleY(0)' },
    '97%': { transform: 'scaleY(1)' },
  },
  '@keyframes assistantTilt': {
    '0%, 100%': { transform: 'rotate(-5deg)' },
    '50%': { transform: 'rotate(-8deg) translateY(-2px)' },
  },
  '@keyframes assistantWork': {
    '0%, 100%': { transform: 'rotate(-3deg) translateY(0)' },
    '50%': { transform: 'rotate(3deg) translateY(-4px)' },
  },
  '@keyframes assistantAttention': {
    '0%, 100%': { transform: 'scale(1) rotate(0)' },
    '20%': { transform: 'scale(1.08) rotate(-6deg)' },
    '40%': { transform: 'scale(1.08) rotate(6deg)' },
    '60%': { transform: 'scale(1)' },
  },
  '@keyframes assistantHop': {
    '0%, 100%': { transform: 'translateY(0)' },
    '30%': { transform: 'translateY(-14px)' },
    '55%': { transform: 'translateY(0)' },
    '75%': { transform: 'translateY(-6px)' },
  },
  '@keyframes assistantTalk': {
    '0%, 100%': { transform: 'scaleY(1)' },
    '50%': { transform: 'scaleY(2.2)' },
  },
  '@keyframes assistantDoze': {
    '0%, 100%': { transform: 'translateY(2px) scale(1, 0.97)' },
    '50%': { transform: 'translateY(3px) scale(1.02, 0.95)' },
  },
  '@keyframes assistantLeave': {
    from: { transform: 'scale(1)', opacity: 1 },
    to: { transform: 'scale(0.2) translateY(20px)', opacity: 0 },
  },
} as const;

const BODY = '& .assistant-body';

/** How long it may be sent away for, in the menu's words (T-27). */
const AWAY_CHOICES: { away: AssistantAway; label: string }[] = [
  { away: 'page', label: 'Hide for now' },
  { away: 'session', label: 'Hide for this session' },
  { away: 'always', label: 'Don\u2019t show again' },
];

/** The Agent Inspector's dialog: loaded when it is first asked for. */
const AgentInspectorDialog = lazy(
  () => import('../../components/inspector/AgentInspectorDialog'),
);

/** *Agent Details…*: loaded when it is first asked for. */
const AgentDetailsDialog = lazy(() => import('./AgentDetailsDialog'));

/** *Code Sandbox Details…*: loaded when it is first asked for. */
const SandboxDetailsDialog = lazy(() => import('./SandboxDetailsDialog'));

/** What the assistant's *About* says. */
export type AssistantAbout = {
  /** The agent's name, or its application's. */
  name?: string;
  /** Its spec or application id, with its version. */
  spec?: string;
  /** Its model. */
  model?: string;
  /** Where it runs: `in your browser`, `on a runtime`. */
  where?: string;
  /** What it does, in a sentence: its card's or its spec's description. */
  description?: string;
  /** What it can do: its card's skills. */
  skills?: string[];
  /**
   * The agent on an agent-runtimes server, and that server: *Agent
   * Details…* then reads its spec, MCP servers and codemode there.
   */
  agentId?: string;
  apiBase?: string;
  /** How it is reached (`a2a`, `ag-ui`, …) and where. */
  protocol?: string;
  url?: string;
};

/**
 * The entries of the assistant's menu, composed from what the host passes:
 * each shows when what it does is there to do.
 */
export function assistantMenuItems(options: {
  name: string;
  open: boolean;
  onToggle: () => void;
  onDismiss: (away: AssistantAway) => void;
  /** The conversation entry's label; `false` leaves it out. */
  conversationLabel?: string | false;
  inspect?: () => void;
  /** Opens *Agent Details…*: offered where the host describes the agent. */
  agentDetails?: () => void;
  /** Opens *Code Sandbox Details…*: offered where the agent has a sandbox. */
  sandboxDetails?: () => void;
  balloonDisplay?: BalloonDisplay;
  onBalloonDisplayChange?: (display: BalloonDisplay) => void;
  suggestions?: readonly BalloonSuggestion[];
  onSuggestion?: (suggestion: BalloonSuggestion) => void;
  busy?: boolean;
  onStop?: () => void;
  onNewChat?: () => void;
  onClear?: () => void;
  onChangeCharacter?: () => void;
  speech?: { muted: boolean; onToggle: () => void };
  /** The sounds of a character read from a file (T-26): off unless asked. */
  characterSounds?: { on: boolean; onToggle: () => void };
  onResetPosition?: () => void;
  about?: () => void;
  extra?: readonly AssistantMenuItem[];
}): AssistantMenuItem[] {
  const items: AssistantMenuItem[] = [];
  if (options.inspect) {
    items.push({
      id: 'inspect',
      label: 'Inspect the agent…',
      icon: PulseIcon,
      onSelect: options.inspect,
    });
  }
  if (options.agentDetails) {
    items.push({
      id: 'agent-details',
      label: 'Agent Details…',
      icon: DependabotIcon,
      onSelect: options.agentDetails,
    });
  }
  if (options.sandboxDetails) {
    items.push({
      id: 'sandbox-details',
      label: 'Code Sandbox Details…',
      icon: CodeIcon,
      onSelect: options.sandboxDetails,
    });
  }
  if (options.conversationLabel !== false) {
    items.push({
      id: 'conversation',
      label:
        options.conversationLabel ??
        (options.open ? 'Close the conversation' : 'Open the conversation'),
      icon: CommentDiscussionIcon,
      onSelect: options.onToggle,
    });
  }
  if (options.busy && options.onStop) {
    items.push({
      id: 'stop',
      label: 'Stop the turn',
      icon: SquareFillIcon,
      onSelect: options.onStop,
    });
  }
  if (options.onNewChat) {
    items.push({
      id: 'new-chat',
      label: 'New conversation',
      icon: PlusIcon,
      onSelect: options.onNewChat,
    });
  }
  if (options.onClear) {
    items.push({
      id: 'clear',
      label: 'Clear the conversation',
      icon: TrashIcon,
      onSelect: options.onClear,
    });
  }
  if (options.suggestions?.length && options.onSuggestion) {
    const send = options.onSuggestion;
    for (const suggestion of options.suggestions) {
      items.push({
        id: `suggestion:${suggestion.label}`,
        label: suggestion.label,
        description: suggestion.prompt,
        group: 'Suggestions',
        disabled: options.busy,
        onSelect: () => send(suggestion),
      });
    }
  }
  if (options.onBalloonDisplayChange) {
    const change = options.onBalloonDisplayChange;
    items.push(
      {
        id: 'balloon-history',
        label: 'History',
        group: 'Balloon',
        checked: options.balloonDisplay !== 'current',
        onSelect: () => change('history'),
      },
      {
        id: 'balloon-current',
        label: 'Current',
        group: 'Balloon',
        checked: options.balloonDisplay === 'current',
        onSelect: () => change('current'),
      },
    );
  }
  if (options.onChangeCharacter) {
    items.push({
      id: 'character',
      label: 'Change character…',
      icon: PencilIcon,
      onSelect: options.onChangeCharacter,
    });
  }
  if (options.speech) {
    items.push({
      id: 'speech',
      label: options.speech.muted ? 'Unmute speech' : 'Mute speech',
      icon: options.speech.muted ? UnmuteIcon : MuteIcon,
      onSelect: options.speech.onToggle,
    });
  }
  if (options.characterSounds) {
    items.push({
      id: 'character-sounds',
      label: options.characterSounds.on ? 'Mute its sounds' : 'Play its sounds',
      icon: options.characterSounds.on ? MuteIcon : UnmuteIcon,
      onSelect: options.characterSounds.onToggle,
    });
  }
  if (options.onResetPosition) {
    items.push({
      id: 'reset-position',
      label: 'Reset position',
      icon: ScreenNormalIcon,
      onSelect: options.onResetPosition,
    });
  }
  if (options.about) {
    items.push({
      id: 'about',
      label: `About ${options.name}`,
      icon: InfoIcon,
      onSelect: options.about,
    });
  }
  items.push(...(options.extra ?? []));
  for (const choice of AWAY_CHOICES) {
    items.push({
      id: `away:${choice.away}`,
      label: choice.label,
      group: 'Send away',
      icon: XIcon,
      onSelect: () => options.onDismiss(choice.away),
    });
  }
  return items;
}

/** Room the balloon needs above the character before it goes below. */
const BALLOON_ROOM = 200;

/** A place's length in pixels, given as a number or as `"<n>px"`. */
function pixels(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  const match =
    typeof value === 'string' ? /^(-?\d+(?:\.\d+)?)px$/.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}

/**
 * Where the balloon goes so that it stays inside the window (T-23): toward
 * the middle of the page from whichever half the character stands in, and
 * below it when it stands too near the top.
 */
export function balloonSide(
  place: { left?: unknown; top?: unknown; right?: unknown; bottom?: unknown },
  viewport: { width: number; height: number } = {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  },
): { side: 'above' | 'below'; align: 'left' | 'right' } {
  const left = pixels(place.left);
  const top = pixels(place.top);
  const align =
    left !== undefined
      ? left < viewport.width / 2
        ? 'left'
        : 'right'
      : place.left !== undefined && place.right === undefined
        ? 'left'
        : 'right';
  const side =
    top !== undefined
      ? top < BALLOON_ROOM
        ? 'below'
        : 'above'
      : place.top !== undefined && place.bottom === undefined
        ? 'below'
        : 'above';
  return { side, align };
}

/** How often the page is looked over for what the assistant must not cover. */
const CLEAR_CHECK_MS = 400;

/** Why the assistant has stepped aside, if it has (T-27). */
export type AssistantAside = 'obstacle' | 'pointer' | undefined;

/**
 * Whether the assistant steps aside (T-27): while an open dialog, an overlay
 * or another chat's composer is under it (`obstacle`), and while the pointer
 * works over or beside it — pressing, or dragging — until it has been away for
 * `POINTER_CALM_MS` (`pointer`). Its own conversation, `own`, is neither, and
 * nothing counts while `paused` (its own menu is open).
 *
 * The page is looked over on a short timer rather than watched: a dialog
 * opens, a composer scrolls or a chat is dragged under it without a mutation
 * this could hear, and a few rectangles every 400ms cost nothing.
 */
export function useKeepClear(
  stageRef: RefObject<HTMLElement | null>,
  own: RefObject<HTMLElement | null> | undefined,
  paused: boolean,
): AssistantAside {
  const [obstructed, setObstructed] = useState(false);
  const [pointerBusy, setPointerBusy] = useState(false);
  useEffect(() => {
    if (paused) {
      setObstructed(false);
      return;
    }
    const check = () => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const box = stage.getBoundingClientRect();
      const mine = own?.current;
      const hit = Array.from(
        document.querySelectorAll<HTMLElement>(ASSISTANT_OBSTACLES),
      ).some(element => {
        if (
          stage.contains(element) ||
          element.contains(stage) ||
          mine?.contains(element)
        ) {
          return false;
        }
        const other = element.getBoundingClientRect();
        return other.width > 0 && other.height > 0 && boxesMeet(box, other);
      });
      setObstructed(hit);
    };
    check();
    const timer = window.setInterval(check, CLEAR_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [stageRef, own, paused]);
  useEffect(() => {
    if (paused) {
      setPointerBusy(false);
      return;
    }
    let calm: ReturnType<typeof setTimeout> | undefined;
    let aside = false;
    const onPointer = (event: PointerEvent) => {
      const stage = stageRef.current;
      const target = event.target as Node | null;
      if (
        !stage ||
        (target && (stage.contains(target) || own?.current?.contains(target)))
      ) {
        return;
      }
      // A pointer passing by is not working; once aside, any move near keeps
      // it aside, so it does not come back under a pointer still there.
      if (event.type === 'pointermove' && event.buttons === 0 && !aside) {
        return;
      }
      if (
        !pointerNear(stage.getBoundingClientRect(), {
          x: event.clientX,
          y: event.clientY,
        })
      ) {
        return;
      }
      aside = true;
      setPointerBusy(true);
      clearTimeout(calm);
      calm = setTimeout(() => {
        aside = false;
        setPointerBusy(false);
      }, POINTER_CALM_MS);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('pointermove', onPointer, true);
    return () => {
      clearTimeout(calm);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('pointermove', onPointer, true);
    };
  }, [stageRef, own, paused]);
  return obstructed ? 'obstacle' : pointerBusy ? 'pointer' : undefined;
}

export interface AssistantStageProps {
  /** The character: one Datalayer ships, by id (T-25), or one loaded from a file (T-26). */
  character: string | AssistantCharacter | AssistantCharacterData;
  /** What it acts out (T-22). */
  state: AssistantState;
  /** Its size, in pixels. */
  size?: number;
  /** Where it sits once moved, or the corner it starts in. */
  place: React.CSSProperties;
  /** The element the drag measures. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Starts a drag. */
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  /** The conversation is open: the balloon above is the chat itself. */
  open: boolean;
  /** Open or close the conversation. */
  onToggle: () => void;
  /**
   * What a click on the character does, when it is not `onToggle`: a team's
   * member shows and hides its balloon, and its menu's conversation entry
   * (*Ask Sales*) still does `onToggle`.
   */
  onCharacterClick?: () => void;
  /**
   * A key pressed on the focused character, after its own (the menu's):
   * a team's member moves with the arrow keys.
   */
  onCharacterKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * The peek while the conversation is closed: one short line — the agent's
   * newest words, as the Office Assistant said them (T-23), or a welcome —
   * that opens the conversation when clicked; `more` says it was cut;
   * `approval`, an approval to answer there, with *Approve* and *Deny*.
   */
  balloon?: {
    text: string;
    /** The words uncut, when `text` was cut to fit: *more* shows them. */
    fullText?: string;
    more?: boolean;
    approval?: BalloonApproval;
    /** Puts the peek away (a × beside its line); never an approval's. */
    onDismiss?: () => void;
    /** The tool being called: "Using list_invoices…" in place of the words. */
    tool?: BalloonToolLine;
    /** Words are being written (`current`): read out once all have arrived. */
    speaking?: boolean;
    /** The agent is at work (`current`): *Now* breathes. */
    busy?: boolean;
    /** What goes with the words (`current`): a notebook given, read-only. */
    attachment?: ReactNode;
    /**
     * The conversation's messages (`history`): the balloon lists them all,
     * counted and scrolled, rather than the newest line alone.
     */
    history?: readonly DisplayItem[];
    /**
     * The large visual `attachment` is the compact form of (a notebook):
     * the balloon offers *Expand*, and draws it large — into
     * `expandTarget`, or in a dialog over the page.
     */
    visual?: BalloonVisual;
  };
  /**
   * Where a balloon's large visual is drawn when expanded: an element of
   * the page (through a portal), such as the area under a team's graph;
   * without one, a large dialog over the page.
   */
  expandTarget?: BalloonExpandTarget;
  /**
   * Draw a large visual into `expandTarget` as soon as it arrives, without
   * waiting for *Expand*: a team's notebook, under its graph.
   */
  expandOnArrival?: boolean;
  /**
   * How the balloon shows the conversation (LOOP T-23): the conversation
   * (`history`, the default — closed, the messages in `balloon.history`, or
   * a peek of the newest when none are given; open, the whole history), or
   * the one thing being said or done now (`current`).
   */
  balloonDisplay?: BalloonDisplay;
  /** Show the balloon without being hovered: something new to say. */
  insist?: boolean;
  /**
   * What the person may ask: chips in the balloon while it waits for a
   * question (idle or greeting), and a group of its menu. One chosen is sent
   * as the prompt with `onSuggestion`.
   */
  suggestions?: readonly BalloonSuggestion[];
  onSuggestion?: (suggestion: BalloonSuggestion) => void;
  /** The Agent Inspector's tracer: its menu offers *Inspect the agent…*. */
  inspector?: OtelLiveTracer | null;
  /** The agent whose own spans the inspector shows, of a shared tracer (a team's member). */
  inspectAgent?: string;
  /**
   * What its menu calls the conversation's entry, which does `onToggle`;
   * `false` leaves it out, where there is no conversation to open (a team's
   * member that is asked by another). Unsaid: *Open / Close the conversation*.
   */
  conversationLabel?: string | false;
  /** The balloon's display changes from its menu: *Balloon: History / Current*. */
  onBalloonDisplayChange?: (display: BalloonDisplay) => void;
  /** Stops the turn: offered in its menu while it is at work. */
  onStop?: () => void;
  /** Starts a new conversation, from its menu. */
  onNewChat?: () => void;
  /** Clears the conversation, from its menu. */
  onClear?: () => void;
  /** Opens the host's character picker, from its menu. */
  onChangeCharacter?: () => void;
  /** Its voice, muted or not, from its menu. */
  speech?: { muted: boolean; onToggle: () => void };
  /** Puts it back where it started, after a drag: offered in its menu. */
  onResetPosition?: () => void;
  /** What its menu's *About* and *Agent Details…* say. */
  about?: AssistantAbout;
  /**
   * The agent's code sandbox, when it has one: its menu offers *Code
   * Sandbox Details…* — where it runs, and its variables.
   */
  sandbox?: AssistantSandbox;
  /** The host's or a plugin's own entries of its menu. */
  contextMenu?: readonly AssistantMenuItem[];
  /** Send it away (T-27): for the page, for the session, or for good. */
  onDismiss: (away: AssistantAway) => void;
  /**
   * Its own conversation's window: a dialog or composer there is not one it
   * steps aside for, nor is the pointer working there (T-27).
   */
  ownRef?: RefObject<HTMLElement | null>;
  /**
   * Asks a typed decision of the runtime: the balloon offers *Ask a
   * decision*, and stays while its form or its answer is on screen.
   */
  decide?: DecisionAsker;
  /**
   * How loud its voice is now, between 0 and 1, while it is heard (VOICE.md
   * VO-23): the mouth opens with the sound, in three openings, instead of
   * the talking loop. Still, for a reader who asks for reduced motion.
   */
  mouthLevel?: () => number;
  /**
   * Set in a layout — a team's graph — rather than floating over the page:
   * it never steps aside (T-27), since what is around it is its own label
   * and its neighbours, not a page somebody is working on.
   */
  stayPut?: boolean;
  /**
   * The agent's own name, used in place of the character's by its menu and
   * its *Send … away*: `Sales`, where the character is a paper clip.
   */
  agentName?: string;
  /**
   * The figure's accessible name, in place of *Talk to <character>*:
   * `Sales (in your browser)`. Given this or `agentName`, the character's
   * name describes the figure instead (`aria-describedby`).
   */
  label?: string;
}

export { mouthOpening };

/**
 * Moves the mouth with the voice: the opening is written on the stage as
 * `data-assistant-mouth`, each frame, without drawing the character again.
 */
export function useMouth(
  stageRef: RefObject<HTMLElement | null>,
  mouthLevel: (() => number) | undefined,
  speaking: boolean,
): void {
  useEffect(() => {
    const stage = stageRef.current;
    const still =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!stage || !mouthLevel || !speaking || still) {
      stage?.removeAttribute('data-assistant-mouth');
      return;
    }
    let frame = 0;
    const move = () => {
      stage.setAttribute(
        'data-assistant-mouth',
        String(mouthOpening(mouthLevel())),
      );
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeAttribute('data-assistant-mouth');
    };
  }, [stageRef, mouthLevel, speaking]);
}

export function AssistantStage({
  character,
  state,
  size = 88,
  place,
  stageRef,
  onDragStart,
  open,
  onToggle,
  onCharacterClick,
  onCharacterKeyDown,
  balloon,
  insist = false,
  onDismiss,
  ownRef,
  decide,
  mouthLevel,
  stayPut = false,
  balloonDisplay = 'history',
  expandTarget,
  expandOnArrival = false,
  suggestions,
  onSuggestion,
  inspector,
  inspectAgent,
  conversationLabel,
  onBalloonDisplayChange,
  onStop,
  onNewChat,
  onClear,
  onChangeCharacter,
  speech,
  onResetPosition,
  about,
  sandbox,
  contextMenu,
  agentName,
  label,
}: AssistantStageProps): JSX.Element {
  const chatText = useChatWords();
  // A shipped one by id, a drawing contributed by a plugin (T-24), or a
  // character read from a file (T-26).
  const shipped =
    typeof character === 'string'
      ? assistantCharacter(character)
      : 'Drawing' in character
        ? character
        : undefined;
  const characterName = shipped
    ? shipped.name
    : (character as AssistantCharacterData).name;
  // The agent's name where the host gives it, else the character's.
  const name = agentName ?? characterName;
  // The character, as the figure's description, when it is not its name.
  const describedBy = useId();
  const described = Boolean(agentName || label);
  // Drawn for the chat's colour mode: the dark drawing on a dark page (T-25).
  const { colorScheme } = useTheme();
  const colorMode = colorScheme?.startsWith('dark') ? 'dark' : 'light';
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Its own menu, where it was opened; the inspector and *About* it opens.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [telling, setTelling] = useState(false);
  const [detailing, setDetailing] = useState<'agent' | 'sandbox' | null>(null);
  const characterRef = useRef<HTMLElement>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const closeMenu = useCallback(() => setMenuAt(null), []);
  // A character read from a file plays its sounds only once asked (T-26).
  const [soundsOn, setSoundsOn] = useState(false);
  const hasSounds =
    !shipped &&
    Object.keys((character as AssistantCharacterData).sounds ?? {}).length > 0;
  useEffect(() => () => clearTimeout(longPress.current), []);
  // Where the press began: a press that moves is a drag, not a click.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const aside = useKeepClear(
    stageRef,
    ownRef,
    menuOpen ||
      menuAt !== null ||
      inspecting ||
      telling ||
      detailing !== null ||
      stayPut,
  );
  useMouth(stageRef, mouthLevel, state === 'speaking');
  // A decision being asked, or its answer, keeps the balloon up.
  const [deciding, setDeciding] = useState(false);
  const showBalloon =
    !aside && !open && !!balloon && (hovered || insist || deciding);
  // Suggestions while it waits for a question.
  const waitsForQuestion =
    (state === 'idle' || state === 'greeting') &&
    !balloon?.tool &&
    !balloon?.approval &&
    !balloon?.busy;
  const busy =
    state === 'thinking' || state === 'working' || state === 'speaking';
  const menuItems = assistantMenuItems({
    name,
    open,
    onToggle,
    onDismiss,
    conversationLabel,
    inspect: inspector ? () => setInspecting(true) : undefined,
    agentDetails: about ? () => setDetailing('agent') : undefined,
    sandboxDetails: sandbox ? () => setDetailing('sandbox') : undefined,
    balloonDisplay,
    onBalloonDisplayChange,
    suggestions,
    onSuggestion,
    busy,
    onStop,
    onNewChat,
    onClear,
    onChangeCharacter,
    speech,
    characterSounds: hasSounds
      ? { on: soundsOn, onToggle: () => setSoundsOn(on => !on) }
      : undefined,
    onResetPosition,
    about: about ? () => setTelling(true) : undefined,
    extra: contextMenu,
  });
  // The large visual drawn now: kept while the balloon moves on to other
  // words, until it is closed or another one is expanded.
  const visual = balloon?.visual;
  const [expanded, setExpanded] = useState<BalloonVisual | null>(null);
  const expand = visual
    ? () => {
        setExpanded(visual);
        if (expandTarget) {
          requestAnimationFrame(() => focusExpanded(expandTarget));
        }
      }
    : null;
  // The history, large: drawn from the balloon's messages as they are now.
  const history = balloon?.history;
  const historyVisual: BalloonVisual | null =
    balloonDisplay !== 'current' && history && history.length > 0
      ? {
          id: 'balloon-history',
          title: conversationHeaderText(conversationCount(history), chatText),
          shrink: true,
          render: () => (
            <BalloonHistoryLarge
              history={history}
              tool={balloon?.tool}
              attachment={balloon?.attachment}
            />
          ),
        }
      : null;
  const shown = expanded?.id === 'balloon-history' ? historyVisual : expanded;
  useEffect(() => {
    if (visual && expandOnArrival && expandTarget) {
      setExpanded(visual);
    }
  }, [visual?.id, expandOnArrival, !!expandTarget]);
  return (
    <Box
      ref={stageRef}
      data-assistant-state={state}
      data-assistant-aside={aside}
      data-assistant-balloon={balloonDisplay}
      sx={{
        position: 'fixed',
        zIndex: 1002,
        ...place,
        width: size,
        height: size,
        // Aside (T-27): out of sight, out of the tab order and let through
        // to what is under it; back as soon as the place is clear.
        opacity: aside ? 0 : 1,
        visibility: aside ? 'hidden' : 'visible',
        pointerEvents: aside ? 'none' : undefined,
        transition: aside
          ? 'opacity 150ms ease, visibility 0s linear 150ms'
          : 'opacity 150ms ease',
        ...MOTIONS,
        '& .assistant-lids ellipse': {
          transformBox: 'fill-box',
          transformOrigin: 'top',
          transform: 'scaleY(0)',
          animation: 'assistantBlink 5.2s ease-in-out infinite',
        },
        [BODY]: {
          transformBox: 'fill-box',
          transformOrigin: '50% 100%',
        },
        '& .assistant-pupils': {
          transition:
            'transform var(--theme-motion-status, 120ms) var(--theme-motion-easing, ease)',
        },
        '& .assistant-mouth': {
          transformBox: 'fill-box',
          transformOrigin: 'center',
        },
        '&[data-assistant-state="idle"] .assistant-body': {
          animation: 'assistantFloat 3.2s ease-in-out infinite',
        },
        '&[data-assistant-state="thinking"] .assistant-body': {
          animation: 'assistantTilt 2.4s ease-in-out infinite',
        },
        '&[data-assistant-state="thinking"] .assistant-pupils': {
          transform: 'translate(-1px, -3px)',
        },
        '&[data-assistant-state="working"] .assistant-body': {
          animation: 'assistantWork 0.7s ease-in-out infinite',
        },
        '&[data-assistant-state="working"] .assistant-pupils': {
          transform: 'translate(2px, 2px)',
        },
        '&[data-assistant-state="waiting"] .assistant-body': {
          animation: 'assistantAttention 1.4s ease-in-out infinite',
        },
        '&[data-assistant-state="greeting"] .assistant-body': {
          animation: 'assistantHop 0.9s ease-out 2',
        },
        '&[data-assistant-state="speaking"] .assistant-mouth': {
          animation: 'assistantTalk 0.24s ease-in-out infinite',
        },
        '&[data-assistant-state="speaking"] .assistant-body': {
          animation: 'assistantFloat 1.6s ease-in-out infinite',
        },
        // Heard (VO-23): the mouth opens with the sound, not on a loop.
        '&[data-assistant-mouth] .assistant-mouth': {
          animation: 'none',
          transition: 'transform 60ms linear',
        },
        '&[data-assistant-mouth="0"] .assistant-mouth': {
          transform: 'scaleY(1)',
        },
        '&[data-assistant-mouth="1"] .assistant-mouth': {
          transform: 'scaleY(1.5)',
        },
        '&[data-assistant-mouth="2"] .assistant-mouth': {
          transform: 'scaleY(2.1)',
        },
        '&[data-assistant-mouth="3"] .assistant-mouth': {
          transform: 'scaleY(2.8)',
        },
        // Paused (R-17): it dozes — its eyes shut, its breath slow, a little
        // greyed — and, still, it is asleep: the shut eyes are not a motion.
        '&[data-assistant-state="paused"] .assistant-body': {
          animation: 'assistantDoze 4.8s ease-in-out infinite',
          filter: 'grayscale(0.5)',
          opacity: 0.8,
        },
        '&[data-assistant-state="paused"] .assistant-lids ellipse': {
          animation: 'none',
          transform: 'scaleY(1)',
        },
        '&[data-assistant-state="goodbye"] .assistant-body': {
          animation: 'assistantLeave 0.6s ease-in forwards',
        },
        // A sprite plays its own goodbye, and leaves as the drawn ones do:
        // a character whose file has no goodbye would otherwise stay.
        '&[data-assistant-state="goodbye"] .assistant-sprite': {
          animation: 'assistantLeave 0.6s ease-in forwards',
        },
        // One still frame per state for a reader who asks for no motion.
        '@media (prefers-reduced-motion: reduce)': {
          '& *': { animation: 'none !important' },
        },
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {shown && (
        <ExpandedVisual
          visual={shown}
          target={expandTarget}
          onClose={() => setExpanded(null)}
        />
      )}
      {showBalloon && balloon && (
        <BalloonExpandContext.Provider value={expand}>
          <SpeechBalloon
            text={balloon.text}
            more={balloon.more}
            approval={balloon.approval}
            onDismissPeek={balloon.onDismiss}
            display={balloonDisplay}
            tool={balloon.tool}
            speaking={balloon.speaking}
            busy={balloon.busy}
            attachment={balloon.attachment}
            history={balloon.history}
            onExpand={expand ?? undefined}
            expandTitle={visual?.title}
            onExpandHistory={
              historyVisual
                ? () => {
                    setExpanded(historyVisual);
                    if (expandTarget) {
                      requestAnimationFrame(() => focusExpanded(expandTarget));
                    }
                  }
                : undefined
            }
            suggestions={waitsForQuestion ? suggestions : undefined}
            fullText={balloon.fullText}
            waiting={
              (state === 'thinking' ||
                state === 'working' ||
                state === 'waiting') &&
              !balloon.speaking
            }
            onSuggestion={onSuggestion}
            decide={decide}
            onDecisionActive={setDeciding}
            wide={deciding}
            onOpen={onToggle}
            above={size + 8}
            side={balloonSide(place).side}
            align={balloonSide(place).align}
            tailAt={size / 2}
          />
        </BalloonExpandContext.Provider>
      )}
      <Box
        as="button"
        type="button"
        aria-label={
          label ??
          (open ? `Close the conversation with ${name}` : `Talk to ${name}`)
        }
        aria-describedby={described ? describedBy : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        ref={characterRef}
        data-assistant-figure=""
        onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
          event.preventDefault();
          clearTimeout(longPress.current);
          setMenuAt({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
          if (opensContextMenu(event)) {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            setMenuAt({ x: box.left + box.width / 2, y: box.bottom });
            return;
          }
          onCharacterKeyDown?.(event);
        }}
        onPointerUp={() => clearTimeout(longPress.current)}
        onPointerCancel={() => clearTimeout(longPress.current)}
        onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
          const from = pressedAt.current;
          if (
            from &&
            Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8
          ) {
            clearTimeout(longPress.current);
          }
        }}
        onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
          pressedAt.current = { x: event.clientX, y: event.clientY };
          if (event.pointerType === 'touch') {
            const at = { x: event.clientX, y: event.clientY };
            clearTimeout(longPress.current);
            longPress.current = setTimeout(() => {
              // Held, not tapped: the menu, and no click after it.
              pressedAt.current = { x: -1e6, y: -1e6 };
              setMenuAt(at);
            }, LONG_PRESS_MS);
          }
          onDragStart(event);
        }}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          const from = pressedAt.current;
          pressedAt.current = null;
          if (
            from &&
            Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4
          ) {
            return;
          }
          (onCharacterClick ?? onToggle)();
        }}
        display="block"
        width={size}
        height={size}
        p={0}
        border={0}
        bg="transparent"
        cursor="grab"
        filter="drop-shadow(0 6px 10px rgba(0, 0, 0, 0.18))"
        active={{ cursor: 'grabbing' }}
        focusVisible={{
          outline: '2px solid',
          outlineColor: 'var(--focus-outlineColor, var(--fgColor-accent))',
          outlineOffset: 2,
          borderRadius: '50%',
        }}
        touchAction="none"
      >
        {described && (
          <Box
            as="span"
            id={describedBy}
            position="absolute"
            width={1}
            height={1}
            overflow="hidden"
            clip="rect(0 0 0 0)"
            whiteSpace="nowrap"
          >
            {`Its character: ${characterName}`}
          </Box>
        )}
        {shipped ? (
          <shipped.Drawing size={size} mode={colorMode} />
        ) : (
          <SpriteCharacter
            character={character as AssistantCharacterData}
            state={state}
            size={size}
            sounds={soundsOn}
            mouthLevel={mouthLevel}
          />
        )}
      </Box>
      {(hovered || menuOpen) && !aside && state !== 'goodbye' && (
        <Box position="absolute" top="-6px" right="-6px">
          <ActionMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <ActionMenu.Anchor>
              <IconButton
                icon={XIcon}
                aria-label={`Send ${name} away`}
                size="small"
                variant="invisible"
                data-assistant-dismiss=""
                sx={{
                  bg: 'canvas.default',
                  borderRadius: '50%',
                  boxShadow: 'shadow.small',
                }}
              />
            </ActionMenu.Anchor>
            <ActionMenu.Overlay width="auto">
              <ActionList>
                {AWAY_CHOICES.map(choice => (
                  <ActionList.Item
                    key={choice.away}
                    data-assistant-away={choice.away}
                    onSelect={() => onDismiss(choice.away)}
                  >
                    {choice.label}
                  </ActionList.Item>
                ))}
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
        </Box>
      )}
      <AssistantContextMenu
        at={menuAt}
        items={menuItems}
        onClose={closeMenu}
        returnFocusRef={characterRef}
        label={`${name}\u2019s menu`}
      />
      {inspecting && (
        <Suspense fallback={null}>
          <AgentInspectorDialog
            tracer={inspector ?? null}
            agent={inspectAgent}
            title={`${about?.name ?? name} \u00b7 Agent Inspector`}
            onClose={() => {
              setInspecting(false);
              characterRef.current?.focus();
            }}
          />
        </Suspense>
      )}
      {detailing === 'agent' && about && (
        <Suspense fallback={null}>
          <AgentDetailsDialog
            about={about}
            name={name}
            onClose={() => {
              setDetailing(null);
              characterRef.current?.focus();
            }}
          />
        </Suspense>
      )}
      {detailing === 'sandbox' && sandbox && (
        <Suspense fallback={null}>
          <SandboxDetailsDialog
            sandbox={sandbox}
            name={about?.name ?? name}
            onClose={() => {
              setDetailing(null);
              characterRef.current?.focus();
            }}
          />
        </Suspense>
      )}
      {telling && about && (
        <Dialog
          title={`About ${about.name ?? name}`}
          onClose={() => {
            setTelling(false);
            characterRef.current?.focus();
          }}
          data-assistant-about=""
        >
          {[
            ['Agent', about.name],
            ['Spec', about.spec],
            ['Model', about.model],
            ['Runs', about.where],
            ['Character', characterName],
          ]
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <Text as="p" key={key} sx={{ m: 0, mb: 1 }}>
                <Text sx={{ color: 'fg.muted' }}>{key}: </Text>
                {value}
              </Text>
            ))}
        </Dialog>
      )}
    </Box>
  );
}

export default AssistantStage;
