/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant on the page (LOOP T-21, T-22, T-27): a character in
 * a corner, acting out what the application is doing, with a balloon that
 * says a word while the conversation is closed. Clicked, it opens the
 * conversation; dragged, it moves, and the conversation follows; sent away,
 * it says goodbye and leaves a small way back.
 *
 * Its motions are one set for every character, by the parts each drawing
 * names (`assistant-body`, `-pupils`, `-lids`, `-mouth`), and nothing moves
 * for a reader who asks the system for reduced motion.
 *
 * @module chat/assistant/AssistantStage
 */

import type { JSX, RefObject } from 'react';
import { useRef, useState } from 'react';
import { IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { XIcon } from '@primer/octicons-react';
import { assistantCharacter } from './characters';
import { SpeechBalloon } from './SpeechBalloon';
import { SpriteCharacter } from './SpriteCharacter';
import type { AssistantCharacterData } from './formats/types';
import type { AssistantState } from './state';

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
  '@keyframes assistantLeave': {
    from: { transform: 'scale(1)', opacity: 1 },
    to: { transform: 'scale(0.2) translateY(20px)', opacity: 0 },
  },
} as const;

const BODY = '& .assistant-body';

export interface AssistantStageProps {
  /** The character: one Datalayer ships, by id (T-25), or one loaded from a file (T-26). */
  character: string | AssistantCharacterData;
  /** What it acts out (T-22). */
  state: AssistantState;
  /** Its size, in pixels. */
  size?: number;
  /** Where it sits once moved, or the corner it starts in. */
  place: { left: number; top: number } | React.CSSProperties;
  /** The element the drag measures. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Starts a drag. */
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  /** The conversation is open: the balloon above is the chat itself. */
  open: boolean;
  /** Open or close the conversation. */
  onToggle: () => void;
  /**
   * What the balloon says while the conversation is closed: the agent's
   * newest words, as the Office Assistant said them (T-23), or a welcome.
   * `more` adds *Open the conversation* for the rest.
   */
  balloon?: { text: string; more?: boolean };
  /** Show the balloon without being hovered: something new to say. */
  insist?: boolean;
  /** Send it away (T-27). */
  onDismiss: () => void;
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
}: AssistantStageProps): JSX.Element {
  const shipped =
    typeof character === 'string' ? assistantCharacter(character) : undefined;
  const name = shipped
    ? shipped.name
    : (character as AssistantCharacterData).name;
  const [hovered, setHovered] = useState(false);
  // Where the press began: a press that moves is a drag, not a click.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const showBalloon = !open && !!balloon && (hovered || insist);
  return (
    <Box
      ref={stageRef}
      data-assistant-state={state}
      sx={{
        position: 'fixed',
        zIndex: 1002,
        ...place,
        width: size,
        height: size,
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
        '&[data-assistant-state="goodbye"] .assistant-body': {
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
          onOpen={onToggle}
          above={size + 8}
          align="right"
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
          <shipped.Drawing size={size} />
        ) : (
          <SpriteCharacter
            character={character as AssistantCharacterData}
            state={state}
            size={size}
          />
        )}
      </Box>
      {hovered && state !== 'goodbye' && (
        <IconButton
          icon={XIcon}
          aria-label={`Send ${name} away`}
          size="small"
          variant="invisible"
          onClick={onDismiss}
          data-assistant-dismiss=""
          sx={{
            position: 'absolute',
            top: -6,
            right: -6,
            bg: 'canvas.default',
            borderRadius: '50%',
            boxShadow: 'shadow.small',
          }}
        />
      )}
    </Box>
  );
}

export default AssistantStage;
