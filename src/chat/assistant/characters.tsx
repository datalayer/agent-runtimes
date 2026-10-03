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
 * @module chat/assistant/characters
 */

import type { JSX } from 'react';

/** A character Datalayer ships. */
export interface AssistantCharacter {
  id: string;
  /** Its name, as the picker shows it. */
  name: string;
  /** The drawing, at the size asked; its parts animate by class. */
  Drawing: (props: { size: number }) => JSX.Element;
}

const INK = '#1D1D1F';

/** Two eyes with lids that blink and pupils that look about. */
function Eyes({
  cx,
  cy,
  gap,
  r,
}: {
  cx: number;
  cy: number;
  gap: number;
  r: number;
}): JSX.Element {
  const left = cx - gap / 2;
  const right = cx + gap / 2;
  return (
    <g>
      <circle
        cx={left}
        cy={cy}
        r={r}
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth={1.5}
      />
      <circle
        cx={right}
        cy={cy}
        r={r}
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth={1.5}
      />
      <g className="assistant-pupils">
        <circle
          cx={left + r * 0.15}
          cy={cy + r * 0.1}
          r={r * 0.45}
          fill={INK}
        />
        <circle
          cx={right + r * 0.15}
          cy={cy + r * 0.1}
          r={r * 0.45}
          fill={INK}
        />
        <circle
          cx={left + r * 0.3}
          cy={cy - r * 0.1}
          r={r * 0.14}
          fill="#FFFFFF"
        />
        <circle
          cx={right + r * 0.3}
          cy={cy - r * 0.1}
          r={r * 0.14}
          fill="#FFFFFF"
        />
      </g>
      {/* The lids: closed for a blink, by scaling from the top of each eye. */}
      <g className="assistant-lids">
        <ellipse
          cx={left}
          cy={cy}
          rx={r + 0.5}
          ry={r + 0.5}
          fill="currentColor"
        />
        <ellipse
          cx={right}
          cy={cy}
          rx={r + 0.5}
          ry={r + 0.5}
          fill="currentColor"
        />
      </g>
    </g>
  );
}

/** A paper clip of our own: a bent wire with eyes on its upper loop. */
function PaperClip({ size }: { size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Paper clip"
      style={{ color: '#B8BDC6' }}
    >
      <g className="assistant-body">
        <path
          d="M40 86 L40 30 Q40 14 52 14 Q64 14 64 30 L64 74 Q64 82 56 82 Q48 82 48 74 L48 36"
          fill="none"
          stroke="#9AA0AA"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M40 86 L40 30 Q40 14 52 14 Q64 14 64 30 L64 74 Q64 82 56 82 Q48 82 48 74 L48 36"
          fill="none"
          stroke="#E3E6EB"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M36 22 Q42 18 47 21"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M57 21 Q62 18 68 22"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Eyes cx={52} cy={30} gap={16} r={6.5} />
        <path
          className="assistant-mouth"
          d="M48 44 Q52 47 56 44"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A wizard: a starred hat, a white beard, kind eyes. */
function Wizard({ size }: { size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Wizard"
      style={{ color: '#F2D3B3' }}
    >
      <g className="assistant-body">
        <path d="M24 92 Q48 58 72 92 Z" fill="#5B4BB7" />
        <circle cx={48} cy={48} r={17} fill="#F2D3B3" />
        <path
          d="M31 50 Q48 92 65 50 Q57 60 48 60 Q39 60 31 50 Z"
          fill="#F4F4F6"
          stroke="#D9DAE0"
          strokeWidth={1}
        />
        <path d="M22 36 L48 2 L74 36 Q48 30 22 36 Z" fill="#6E5CD6" />
        <path d="M20 37 Q48 29 76 37 Q48 43 20 37 Z" fill="#4A3C9E" />
        <path
          d="M52 14 l2 4 4 1 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -1 Z"
          fill="#F8D469"
        />
        <circle cx={40} cy={26} r={1.8} fill="#F8D469" />
        <Eyes cx={48} cy={46} gap={13} r={5} />
        <path
          className="assistant-mouth"
          d="M44 58 Q48 61 52 58"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A cat: round, two ears, whiskers, a tail. */
function Cat({ size }: { size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Cat"
      style={{ color: '#F4A261' }}
    >
      <g className="assistant-body">
        <path
          d="M70 84 Q90 78 84 58"
          stroke="#E08A45"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx={48} cy={78} rx={24} ry={14} fill="#F4A261" />
        <path d="M24 30 L28 8 L42 22 Z" fill="#F4A261" />
        <path d="M72 30 L68 8 L54 22 Z" fill="#F4A261" />
        <path d="M28 26 L30 14 L38 22 Z" fill="#F6A5C1" />
        <path d="M68 26 L66 14 L58 22 Z" fill="#F6A5C1" />
        <circle cx={48} cy={42} r={24} fill="#F4A261" />
        <Eyes cx={48} cy={38} gap={18} r={6.5} />
        <path d="M45 48 L51 48 L48 52 Z" fill="#B83A6B" />
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
          stroke={INK}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** The L👀P eyes: the product's own face, two eyes and nothing else. */
function LoopEyes({ size }: { size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="L👀P eyes"
      style={{ color: '#FFFFFF' }}
    >
      <g className="assistant-body">
        <Eyes cx={48} cy={50} gap={40} r={18} />
        <path
          className="assistant-mouth"
          d="M42 80 Q48 84 54 80"
          stroke={INK}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          opacity={0}
        />
      </g>
    </svg>
  );
}

/** The characters Datalayer ships, in the order a picker shows them. */
export const ASSISTANT_CHARACTERS: readonly AssistantCharacter[] = [
  { id: 'paperclip', name: 'Paper clip', Drawing: PaperClip },
  { id: 'wizard', name: 'Wizard', Drawing: Wizard },
  { id: 'cat', name: 'Cat', Drawing: Cat },
  { id: 'eyes', name: 'L👀P eyes', Drawing: LoopEyes },
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
