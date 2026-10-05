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
 * Its motions are one set for every character, by the parts each drawing
 * names (`assistant-body`, `-pupils`, `-lids`, `-mouth`), and nothing moves
 * for a reader who asks the system for reduced motion.
 *
 * @module chat/assistant/AssistantStage
 */

import type { JSX, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActionList, ActionMenu, IconButton, useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { XIcon } from '@primer/octicons-react';
import { assistantCharacter, type AssistantCharacter } from './characters';
import { SpeechBalloon } from './SpeechBalloon';
import { SpriteCharacter } from './SpriteCharacter';
import type { AssistantCharacterData } from './formats/types';
import type { DecisionAsker } from './decisions';
import {
  ASSISTANT_OBSTACLES,
  POINTER_CALM_MS,
  boxesMeet,
  pointerNear,
  type AssistantAway,
  type AssistantState,
  type BalloonApproval,
} from './state';

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
   * The peek while the conversation is closed: one short line — the agent's
   * newest words, as the Office Assistant said them (T-23), or a welcome —
   * that opens the conversation when clicked; `more` says it was cut;
   * `approval`, an approval to answer there, with *Approve* and *Deny*.
   */
  balloon?: {
    text: string;
    more?: boolean;
    approval?: BalloonApproval;
    /** Puts the peek away (a × beside its line); never an approval's. */
    onDismiss?: () => void;
  };
  /** Show the balloon without being hovered: something new to say. */
  insist?: boolean;
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
}

/** The openings of the mouth, by level: shut, a little, half, wide. */
export function mouthOpening(level: number): 0 | 1 | 2 | 3 {
  return level < 0.08 ? 0 : level < 0.3 ? 1 : level < 0.6 ? 2 : 3;
}

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
  balloon,
  insist = false,
  onDismiss,
  ownRef,
  decide,
  mouthLevel,
  stayPut = false,
}: AssistantStageProps): JSX.Element {
  // A shipped one by id, a drawing contributed by a plugin (T-24), or a
  // character read from a file (T-26).
  const shipped =
    typeof character === 'string'
      ? assistantCharacter(character)
      : 'Drawing' in character
        ? character
        : undefined;
  const name = shipped
    ? shipped.name
    : (character as AssistantCharacterData).name;
  // Drawn for the chat's colour mode: the dark drawing on a dark page (T-25).
  const { colorScheme } = useTheme();
  const colorMode = colorScheme?.startsWith('dark') ? 'dark' : 'light';
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Where the press began: a press that moves is a drag, not a click.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const aside = useKeepClear(stageRef, ownRef, menuOpen || stayPut);
  useMouth(stageRef, mouthLevel, state === 'speaking');
  // A decision being asked, or its answer, keeps the balloon up.
  const [deciding, setDeciding] = useState(false);
  const showBalloon =
    !aside && !open && !!balloon && (hovered || insist || deciding);
  return (
    <Box
      ref={stageRef}
      data-assistant-state={state}
      data-assistant-aside={aside}
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
      {showBalloon && balloon && (
        <SpeechBalloon
          text={balloon.text}
          more={balloon.more}
          approval={balloon.approval}
          onDismissPeek={balloon.onDismiss}
          decide={decide}
          onDecisionActive={setDeciding}
          wide={deciding}
          onOpen={onToggle}
          above={size + 8}
          side={balloonSide(place).side}
          align={balloonSide(place).align}
          tailAt={size / 2}
        />
      )}
      <Box
        as="button"
        type="button"
        aria-label={
          open ? `Close the conversation with ${name}` : `Talk to ${name}`
        }
        aria-expanded={open}
        onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
          pressedAt.current = { x: event.clientX, y: event.clientY };
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
          onToggle();
        }}
        sx={{
          display: 'block',
          width: size,
          height: size,
          p: 0,
          border: 0,
          bg: 'transparent',
          cursor: 'grab',
          touchAction: 'none',
          filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.18))',
          '&:active': { cursor: 'grabbing' },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'var(--focus-outlineColor, var(--fgColor-accent))',
            outlineOffset: 2,
            borderRadius: '50%',
          },
        }}
      >
        {shipped ? (
          <shipped.Drawing size={size} mode={colorMode} />
        ) : (
          <SpriteCharacter
            character={character as AssistantCharacterData}
            state={state}
            size={size}
          />
        )}
      </Box>
      {(hovered || menuOpen) && !aside && state !== 'goodbye' && (
        <Box sx={{ position: 'absolute', top: '-6px', right: '-6px' }}>
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
    </Box>
  );
}

export default AssistantStage;
