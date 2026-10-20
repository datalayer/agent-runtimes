/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own characters for the floating assistant, contributed
 * (T-24, T-25): the paper clip, the wizard, the cat and the L👀P eyes.
 * Disabled, they leave the catalogue; another plugin may contribute others.
 *
 * @module apps/plugins/assistant-characters
 */

import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  type PluginRef,
  type ReactorPlugin,
} from '@datalayer/reactor';
import {
  ASSISTANT_CHARACTERS,
  DEFAULT_ASSISTANT_CHARACTER,
  type AssistantCharacter,
} from '../../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../../chat/assistant/formats/types';
import {
  assistantModel3D,
  type AssistantModel3D,
} from '../../../chat/assistant/avatar3d';
import type { AppAvatar } from '../../../types/agentspecs';
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
  displayName: 'Assistant avatars',
  description:
    "Datalayer's own avatars for the floating assistant: a paper clip, a wizard, a cat and the L👀P eyes.",
  octicon: 'paperclip',
  contributes: ASSISTANT_CHARACTERS.map(character =>
    contribution(
      LoopAssistantCharacter,
      { id: character.id, character },
      { id: character.id },
    ),
  ),
});

/**
 * A plugin contributing one character (T-24, T-26): a character a
 * person brought — a `.acs` or a clippy.js character read in their page —
 * offered beside the contributed ones under the id it is chosen by. The
 * character stays in the page: the plugin only says it is there.
 */
export function defineAssistantCharacterPlugin(
  id: string,
  character: AssistantCharacter | AssistantCharacterData,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  return definePlugin({
    name: `${ASSISTANT_CHARACTERS_PLUGIN_NAME}-${id}`,
    displayName: `Assistant avatar: ${character.name}`,
    description: `${character.name}, an avatar for the floating assistant.`,
    octicon: 'paperclip',
    contributes: [
      contribution(LoopAssistantCharacter, { id, character }, { id }),
    ],
  });
}

/** The characters the enabled plugins contribute, in contribution order. */
export function assistantCharactersOf(
  reactor: ContributionsReader,
): { id: string; character: AssistantCharacter | AssistantCharacterData }[] {
  return reactor
    .getContributions(LoopAssistantCharacter)
    .map(entry => entry.value);
}

/**
 * What these plugins contribute, enabled on their own: for a host with no
 * workspace to read them from — the embed's floating assistant (D-07) —
 * which enables Datalayer's characters and whatever plugins it is given.
 */
export function assistantCharactersFrom(
  plugins: PluginRef[],
): { id: string; character: AssistantCharacter | AssistantCharacterData }[] {
  const reactor = buildReactorFromPlugins(plugins);
  reactor.start();
  try {
    return assistantCharactersOf(reactor);
  } finally {
    reactor.stop();
  }
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
      `No enabled plugin contributes the assistant avatar "${id}"; the avatars are ${all.map(entry => entry.id).join(', ') || 'none'}.`,
    );
  }
  return found.character;
}

/** Whose choice the character drawn is (T-24). */
export type AssistantCharacterSaidBy = 'app' | 'person' | 'default';

/** The avatar drawn, or why none can be: a drawing, a Microsoft Agent character, or a 3D model. */
export type AssistantCharacterChosen =
  | {
      id: string;
      character: AssistantCharacter | AssistantCharacterData | AssistantModel3D;
      saidBy: AssistantCharacterSaidBy;
    }
  | { problem: string; saidBy: AssistantCharacterSaidBy };

/**
 * The avatar the floating assistant draws on a page (T-24): the one the
 * application's Appspec names (`interface.avatar`), which wins — a 3D model
 * drawn as it says, an id looked up — else the one the person chose in
 * their settings; else the paper clip — each id looked up in what the
 * enabled plugins contribute. An id no enabled plugin gives is not replaced
 * by another: it is said, with the ids there are.
 */
export function assistantCharacterFor(
  contributed: ReadonlyArray<{
    id: string;
    character: AssistantCharacter | AssistantCharacterData;
  }>,
  choice: { app?: AppAvatar; person?: string },
): AssistantCharacterChosen {
  if (typeof choice.app === 'object' && choice.app !== null) {
    const model = assistantModel3D(choice.app);
    return { id: model.id, character: model, saidBy: 'app' };
  }
  const saidBy: AssistantCharacterSaidBy = choice.app
    ? 'app'
    : choice.person
      ? 'person'
      : 'default';
  const id = choice.app ?? choice.person ?? DEFAULT_ASSISTANT_CHARACTER;
  const found = contributed.find(entry => entry.id === id);
  if (found) {
    return { id, character: found.character, saidBy };
  }
  const whose =
    saidBy === 'app'
      ? 'This application names'
      : saidBy === 'person'
        ? 'Your settings name'
        : 'The default is';
  return {
    saidBy,
    problem: `${whose} the avatar “${id}”, which nothing enabled here draws; the avatars are ${contributed.map(entry => entry.id).join(', ') || 'none'}.`,
  };
}

export default AssistantCharactersPlugin;
