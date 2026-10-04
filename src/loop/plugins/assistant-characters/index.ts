/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own characters for the floating assistant, contributed
 * (LOOP T-24, T-25): the paper clip, the wizard, the cat and the L👀P eyes.
 * Disabled, they leave the catalogue; another plugin may contribute others.
 *
 * @module loop/plugins/assistant-characters
 */

import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
} from '../../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../../chat/assistant/formats/types';
import {
  LoopAssistantCharacter,
  type AssistantCharacterContribution,
} from '../../core';

/** What is read of a reactor here: its contributions to the point. */
type ContributionsReader = {
  getContributions: (
    point: typeof LoopAssistantCharacter,
  ) => ReadonlyArray<{ value: AssistantCharacterContribution }>;
};

export const ASSISTANT_CHARACTERS_PLUGIN_NAME =
  '@datalayer/loop-plugin-assistant-characters';

export const AssistantCharactersPlugin: ReactorPlugin<
  Record<string, never>,
  unknown,
  unknown
> = definePlugin({
  name: ASSISTANT_CHARACTERS_PLUGIN_NAME,
  displayName: 'Assistant characters',
  description:
    "Datalayer's own characters for the floating assistant: a paper clip, a wizard, a cat and the L👀P eyes.",
  octicon: 'paperclip',
  contributes: ASSISTANT_CHARACTERS.map(character =>
    contribution(
      LoopAssistantCharacter,
      { id: character.id, character },
      { id: character.id },
    ),
  ),
});

/** The characters the enabled plugins contribute, in contribution order. */
export function assistantCharactersOf(
  reactor: ContributionsReader,
): { id: string; character: AssistantCharacter | AssistantCharacterData }[] {
  return reactor
    .getContributions(LoopAssistantCharacter)
    .map(entry => entry.value);
}

/**
 * The character an application names, from what is contributed; an id no
 * enabled plugin contributes is an error that says which ids there are.
 */
export function assistantCharacterNamed(
  reactor: ContributionsReader,
  id: string,
): AssistantCharacter | AssistantCharacterData {
  const all = assistantCharactersOf(reactor);
  const found = all.find(entry => entry.id === id);
  if (!found) {
    throw new Error(
      `No enabled plugin contributes the assistant character "${id}"; the characters are ${all.map(entry => entry.id).join(', ') || 'none'}.`,
    );
  }
  return found.character;
}

export default AssistantCharactersPlugin;
