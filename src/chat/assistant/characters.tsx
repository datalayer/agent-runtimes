/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own characters for the floating assistant (LOOP T-25): drawn
 * for LOOP and owned by Datalayer, in the spirit of the Office Assistant —
 * a paper clip of our own, a wizard, a cat and the L👀P eyes. The characters
 * of Office are Microsoft's and are never bundled (§6.9); a person loads
 * one they hold the rights to (T-26).
 *
 * Each drawing names its moving parts with classes the stage animates by
 * state — `assistant-body`, `assistant-pupils`, `assistant-lids`,
 * `assistant-mouth` — so one set of motions serves every character.
 *
 * Each is drawn twice, for the chat's colour mode: a light drawing for the
 * light page and a dark one for the `loop` theme's dark page, by its dark
 * tokens (`loopColors.inkDark`, `grayDark`, `black`). Their edges and eyes
 * are held to 3 to 1 against both pages by a test (`keyColours`).
 *
 * @module chat/assistant/characters
 */

import type { JSX } from 'react';
import { loopColors } from '@datalayer/primer-addons/lib/theme';

/** The colour mode a character is drawn for: the chat's own. */
export type AssistantColorMode = 'light' | 'dark';

/**
 * What a drawing must keep readable, by mode (T-25, tested as T-15 tests the
 * faces): the colours that meet the page along its edge, and its eyes.
 */
export interface AssistantCharacterKeyColours {
  /** Every colour drawn along the character's edge, where it meets the page. */
  edges: string[];
  eye: {
    /** The white of the eye. */
    white: string;
    /** The ring drawn round it. */
    ring: string;
    /** The pupil. */
    pupil: string;
    /** What the eye sits on: the page, or the face's colour. */
    on: 'page' | string;
  };
}

/** A character Datalayer ships. */
export interface AssistantCharacter {
  id: string;
  /** Its name, as the picker shows it. */
  name: string;
  /**
   * The drawing, at the size asked, for the chat's colour mode (light when
   * unsaid); its parts animate by class.
   */
  Drawing: (props: { size: number; mode?: AssistantColorMode }) => JSX.Element;
  /** Its key colours in each mode, for the contrast test (T-25). */
  keyColours?: Record<AssistantColorMode, AssistantCharacterKeyColours>;
}

const INK = loopColors.ink;
const INK_DARK = loopColors.inkDark;

interface EyeColours {
  white: string;
  ring: string;
  pupil: string;
  /** The lid: the face's colour, closed for a blink. */
  lid: string;
}

/** Two eyes with lids that blink and pupils that look about. */
function Eyes({
  cx,
  cy,
  gap,
  r,
  colours,
}: {
  cx: number;
  cy: number;
  gap: number;
  r: number;
  colours: EyeColours;
}): JSX.Element {
  const left = cx - gap / 2;
  const right = cx + gap / 2;
  return (
    <g>
      <circle
        cx={left}
        cy={cy}
        r={r}
        fill={colours.white}
        stroke={colours.ring}
        strokeWidth={1.5}
      />
      <circle
        cx={right}
        cy={cy}
        r={r}
        fill={colours.white}
        stroke={colours.ring}
        strokeWidth={1.5}
      />
      <g className="assistant-pupils">
        <circle
          cx={left + r * 0.15}
          cy={cy + r * 0.1}
          r={r * 0.45}
          fill={colours.pupil}
        />
        <circle
          cx={right + r * 0.15}
          cy={cy + r * 0.1}
          r={r * 0.45}
          fill={colours.pupil}
        />
        <circle
          cx={left + r * 0.3}
          cy={cy - r * 0.1}
          r={r * 0.14}
          fill={colours.white}
        />
        <circle
          cx={right + r * 0.3}
          cy={cy - r * 0.1}
          r={r * 0.14}
          fill={colours.white}
        />
      </g>
      {/* The lids: closed for a blink, by scaling from the top of each eye. */}
      <g className="assistant-lids">
        <ellipse
          cx={left}
          cy={cy}
          rx={r + 0.5}
          ry={r + 0.5}
          fill={colours.lid}
        />
        <ellipse
          cx={right}
          cy={cy}
          rx={r + 0.5}
          ry={r + 0.5}
          fill={colours.lid}
        />
      </g>
    </g>
  );
}

/**
 * Each drawing's colours, light and dark. The dark ones are drawn for the
 * `loop` theme's dark page (near-black, `loopColors.black`) and not the light
 * drawing on black: lines that were ink turn to the dark mode's ink, the
 * steel and the violets go lighter, outlines that a light page needs give
 * way to the fill's own edge.
 */
const PAPER_CLIP = {
  light: {
    wire: '#7A808A',
    shine: '#E3E6EB',
    line: INK,
    eye: { white: loopColors.white, ring: INK, pupil: INK, lid: '#B8BDC6' },
  },
  dark: {
    wire: '#C9CED6',
    shine: '#8D93A0',
    line: INK_DARK,
    eye: {
      white: INK_DARK,
      ring: loopColors.grayDark,
      pupil: INK,
      lid: '#8D93A0',
    },
  },
};

const WIZARD = {
  light: {
    hat: '#6E5CD6',
    brim: '#4A3C9E',
    robe: '#5B4BB7',
    face: '#F2D3B3',
    beard: '#F4F4F6',
    beardEdge: '#7A808A',
    star: '#F8D469',
    eye: { white: loopColors.white, ring: INK, pupil: INK, lid: '#F2D3B3' },
  },
  dark: {
    hat: '#9C88F0',
    brim: '#7B67DB',
    robe: '#8F7CE8',
    face: '#E8C4A0',
    beard: '#E4E4EA',
    beardEdge: loopColors.grayDark,
    star: '#F8D469',
    eye: { white: INK_DARK, ring: INK, pupil: INK, lid: '#E8C4A0' },
  },
};

const CAT = {
  light: {
    fur: '#F4A261',
    edge: '#B4571A',
    tail: '#E08A45',
    ear: '#F6A5C1',
    nose: '#B83A6B',
    whiskers: INK,
    eye: { white: loopColors.white, ring: INK, pupil: INK, lid: '#F4A261' },
  },
  dark: {
    fur: '#F4A261',
    edge: '#F4A261',
    tail: '#E08A45',
    ear: '#F6A5C1',
    nose: '#B83A6B',
    whiskers: INK_DARK,
    eye: { white: INK_DARK, ring: INK, pupil: INK, lid: '#F4A261' },
  },
};

const LOOP_EYES = {
  light: {
    eye: { white: loopColors.white, ring: INK, pupil: INK, lid: '#E3E6EB' },
  },
  dark: {
    eye: {
      white: INK_DARK,
      ring: INK_DARK,
      pupil: loopColors.black,
      lid: loopColors.grayDark,
    },
  },
};

/** A paper clip of our own: a bent wire with eyes on its upper loop. */
function PaperClip({
  size,
  mode = 'light',
}: {
  size: number;
  mode?: AssistantColorMode;
}): JSX.Element {
  const c = PAPER_CLIP[mode];
  const wire =
    'M40 86 L40 30 Q40 14 52 14 Q64 14 64 30 L64 74 Q64 82 56 82 Q48 82 48 74 L48 36';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Paper clip"
      data-assistant-mode={mode}
    >
      <g className="assistant-body">
        <path
          d={wire}
          fill="none"
          stroke={c.wire}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={wire}
          fill="none"
          stroke={c.shine}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M36 22 Q42 18 47 21"
          stroke={c.line}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M57 21 Q62 18 68 22"
          stroke={c.line}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Eyes cx={52} cy={30} gap={16} r={6.5} colours={c.eye} />
        <path
          className="assistant-mouth"
          d="M48 44 Q52 47 56 44"
          stroke={c.line}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A wizard: a starred hat, a white beard, kind eyes. */
function Wizard({
  size,
  mode = 'light',
}: {
  size: number;
  mode?: AssistantColorMode;
}): JSX.Element {
  const c = WIZARD[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Wizard"
      data-assistant-mode={mode}
    >
      <g className="assistant-body">
        {/* The robe, one shape from the shoulders down, its hem trimmed. */}
        <path
          d="M34 58 Q48 52 62 58 Q70 74 76 92 Q48 98 20 92 Q26 74 34 58 Z"
          fill={c.robe}
        />
        <path d="M21 90 Q48 96 75 90 L76 92 Q48 98 20 92 Z" fill={c.brim} />
        <circle cx={30} cy={82} r={1.6} fill={c.star} />
        <circle cx={67} cy={78} r={1.3} fill={c.star} />
        {/* The face, framed by the brim and the beard. */}
        <ellipse cx={48} cy={46} rx={13} ry={12} fill={c.face} />
        {/* The beard, from the temples down over the robe; the moustache over
            the mouth. */}
        <path
          d="M33 38 Q31 66 40 77 Q48 89 56 77 Q65 66 63 38 Q61 50 56 53 Q48 58 40 53 Q35 50 33 38 Z"
          fill={c.beard}
          stroke={c.beardEdge}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <path
          className="assistant-mouth"
          d="M44 59 Q48 62 52 59"
          stroke={INK}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M39 55 Q44 51 48 54 Q52 51 57 55 Q52 57 48 56 Q44 57 39 55 Z"
          fill={c.beard}
          stroke={c.beardEdge}
          strokeWidth={0.8}
        />
        {/* The hat, its tip curled over, a star on it. */}
        <path
          d="M25 36 Q35 26 39 14 Q43 2 58 3 Q50 8 53 18 Q58 30 71 36 Q48 30 25 36 Z"
          fill={c.hat}
        />
        <path d="M18 37 Q48 27 78 37 Q48 45 18 37 Z" fill={c.brim} />
        <path
          d="M47 17 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.6 Z"
          fill={c.star}
        />
        <circle cx={56} cy={28} r={1.4} fill={c.star} />
        <Eyes cx={48} cy={46} gap={11} r={4} colours={c.eye} />
      </g>
    </svg>
  );
}

/** A cat: round, two ears, whiskers, a tail. */
function Cat({
  size,
  mode = 'light',
}: {
  size: number;
  mode?: AssistantColorMode;
}): JSX.Element {
  const c = CAT[mode];
  const tail = 'M70 84 Q90 78 84 58';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Cat"
      data-assistant-mode={mode}
    >
      <g className="assistant-body">
        <path
          d={tail}
          stroke={c.edge}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={tail}
          stroke={c.tail}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
        <ellipse
          cx={48}
          cy={78}
          rx={24}
          ry={14}
          fill={c.fur}
          stroke={c.edge}
          strokeWidth={1.5}
        />
        <path
          d="M24 30 L28 8 L42 22 Z"
          fill={c.fur}
          stroke={c.edge}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="M72 30 L68 8 L54 22 Z"
          fill={c.fur}
          stroke={c.edge}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d="M28 26 L30 14 L38 22 Z" fill={c.ear} />
        <path d="M68 26 L66 14 L58 22 Z" fill={c.ear} />
        <circle
          cx={48}
          cy={42}
          r={24}
          fill={c.fur}
          stroke={c.edge}
          strokeWidth={1.5}
        />
        <Eyes cx={48} cy={38} gap={18} r={6.5} colours={c.eye} />
        <path d="M45 48 L51 48 L48 52 Z" fill={c.nose} />
        <path
          className="assistant-mouth"
          d="M43 55 Q48 58 53 55"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M30 48 L18 46 M30 52 L18 54 M66 48 L78 46 M66 52 L78 54"
          stroke={c.whiskers}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** The L👀P eyes: the product's own face, two eyes and nothing else. */
function LoopEyes({
  size,
  mode = 'light',
}: {
  size: number;
  mode?: AssistantColorMode;
}): JSX.Element {
  const c = LOOP_EYES[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="L👀P eyes"
      data-assistant-mode={mode}
    >
      <g className="assistant-body">
        <Eyes cx={48} cy={50} gap={40} r={18} colours={c.eye} />
        <path
          className="assistant-mouth"
          d="M42 80 Q48 84 54 80"
          stroke={mode === 'dark' ? INK_DARK : INK}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          opacity={0}
        />
      </g>
    </svg>
  );
}

const eyeOf = (eye: EyeColours, on: 'page' | string) => ({
  white: eye.white,
  ring: eye.ring,
  pupil: eye.pupil,
  on,
});

/** The characters Datalayer ships, in the order a picker shows them. */
export const ASSISTANT_CHARACTERS: readonly AssistantCharacter[] = [
  {
    id: 'paperclip',
    name: 'Paper clip',
    Drawing: PaperClip,
    keyColours: {
      light: {
        edges: [PAPER_CLIP.light.wire, PAPER_CLIP.light.line],
        eye: eyeOf(PAPER_CLIP.light.eye, 'page'),
      },
      dark: {
        edges: [PAPER_CLIP.dark.wire, PAPER_CLIP.dark.line],
        eye: eyeOf(PAPER_CLIP.dark.eye, 'page'),
      },
    },
  },
  {
    id: 'wizard',
    name: 'Wizard',
    Drawing: Wizard,
    keyColours: {
      light: {
        edges: [
          WIZARD.light.hat,
          WIZARD.light.brim,
          WIZARD.light.robe,
          WIZARD.light.beardEdge,
        ],
        eye: eyeOf(WIZARD.light.eye, WIZARD.light.face),
      },
      dark: {
        edges: [
          WIZARD.dark.hat,
          WIZARD.dark.brim,
          WIZARD.dark.robe,
          WIZARD.dark.beardEdge,
        ],
        eye: eyeOf(WIZARD.dark.eye, WIZARD.dark.face),
      },
    },
  },
  {
    id: 'cat',
    name: 'Cat',
    Drawing: Cat,
    keyColours: {
      light: {
        edges: [CAT.light.edge, CAT.light.whiskers],
        eye: eyeOf(CAT.light.eye, CAT.light.fur),
      },
      dark: {
        edges: [CAT.dark.edge, CAT.dark.whiskers],
        eye: eyeOf(CAT.dark.eye, CAT.dark.fur),
      },
    },
  },
  {
    id: 'eyes',
    name: 'L👀P eyes',
    Drawing: LoopEyes,
    keyColours: {
      light: {
        edges: [LOOP_EYES.light.eye.ring],
        eye: eyeOf(LOOP_EYES.light.eye, 'page'),
      },
      dark: {
        edges: [LOOP_EYES.dark.eye.white],
        eye: eyeOf(LOOP_EYES.dark.eye, 'page'),
      },
    },
  },
];

/** The character an assistant shows when none is chosen. */
export const DEFAULT_ASSISTANT_CHARACTER = 'paperclip';

/** A shipped character by id; an unknown id is an error, said plainly. */
export function assistantCharacter(id: string): AssistantCharacter {
  const found = ASSISTANT_CHARACTERS.find(character => character.id === id);
  if (!found) {
    throw new Error(
      `There is no assistant character "${id}"; the characters are ${ASSISTANT_CHARACTERS.map(c => c.id).join(', ')}.`,
    );
  }
  return found;
}
