/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A plugin that contributes a character to the floating assistant (LOOP
 * T-24): an owl, drawn here, contributed to `loop.assistant.character` as
 * any plugin would. The *Assistant* example enables it beside
 * Datalayer's own characters and lists what the enabled plugins contribute.
 *
 * Its drawing names the parts the stage animates — `assistant-body`,
 * `assistant-pupils`, `assistant-lids`, `assistant-mouth` — so it acts every
 * state as Datalayer's characters do, and it takes the chat's colour mode.
 *
 * @module examples/utils/owlCharacterPlugin
 */

import type { JSX } from 'react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopAssistantCharacter } from '../../apps/core';
import type {
  AssistantCharacter,
  AssistantColorMode,
} from '../../chat/assistant/characters';

const OWL = {
  light: {
    feathers: '#8A5A3C',
    belly: '#E9D3B8',
    tufts: '#6B4329',
    beak: '#E0A54A',
    eye: '#FFFFFF',
    ring: '#1D1D1F',
    pupil: '#1D1D1F',
  },
  dark: {
    feathers: '#C08B66',
    belly: '#F1E1CC',
    tufts: '#D9A57F',
    beak: '#F8D469',
    eye: '#F5F5F7',
    ring: '#1D1D1F',
    pupil: '#131314',
  },
};

function Owl({
  size,
  mode = 'light',
}: {
  size: number;
  mode?: AssistantColorMode;
}): JSX.Element {
  const c = OWL[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Owl"
      data-assistant-mode={mode}
    >
      <g className="assistant-body">
        <path d="M26 30 L22 10 L40 22 Z" fill={c.tufts} />
        <path d="M70 30 L74 10 L56 22 Z" fill={c.tufts} />
        <ellipse cx={48} cy={54} rx={28} ry={34} fill={c.feathers} />
        <ellipse cx={48} cy={66} rx={17} ry={20} fill={c.belly} />
        {[34, 62].map(x => (
          <circle
            key={x}
            cx={x}
            cy={40}
            r={11}
            fill={c.eye}
            stroke={c.ring}
            strokeWidth={1.5}
          />
        ))}
        <g className="assistant-pupils">
          <circle cx={35} cy={41} r={5} fill={c.pupil} />
          <circle cx={63} cy={41} r={5} fill={c.pupil} />
        </g>
        <g className="assistant-lids">
          <ellipse cx={34} cy={40} rx={11.5} ry={11.5} fill={c.feathers} />
          <ellipse cx={62} cy={40} rx={11.5} ry={11.5} fill={c.feathers} />
        </g>
        <path
          className="assistant-mouth"
          d="M44 50 L52 50 L48 58 Z"
          fill={c.beak}
        />
      </g>
    </svg>
  );
}

/** The owl, as the example plugin contributes it. */
export const OWL_CHARACTER: AssistantCharacter = {
  id: 'owl',
  name: 'Owl',
  Drawing: Owl,
};

export const OWL_CHARACTER_PLUGIN_NAME =
  '@datalayer/example-plugin-owl-character';

/** The example plugin: one character, contributed to the point. */
export const OwlCharacterPlugin = definePlugin({
  name: OWL_CHARACTER_PLUGIN_NAME,
  displayName: 'Owl character (example)',
  description: 'An owl for the floating assistant, contributed by a plugin.',
  contributes: [
    contribution(
      LoopAssistantCharacter,
      { id: OWL_CHARACTER.id, character: OWL_CHARACTER },
      { id: OWL_CHARACTER.id },
    ),
  ],
});

export default OwlCharacterPlugin;
