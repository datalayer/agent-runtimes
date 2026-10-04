/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's characters as contributions (LOOP T-24): the
 * catalogue is what the enabled plugins contribute, and an application names
 * one by id.
 */

import { describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import {
  AssistantCharactersPlugin,
  assistantCharacterNamed,
  assistantCharactersOf,
} from '../plugins/assistant-characters';
import { LoopAssistantCharacter } from '../core';

const robot = {
  name: 'Robot',
  frameSize: { width: 10, height: 10 },
  sprite: 'data:,',
  animations: { Idle1_1: { frames: [{ duration: 100, images: [] }] } },
};

const RobotPlugin = definePlugin({
  name: 'test-robot-character',
  contributes: [
    contribution(
      LoopAssistantCharacter,
      { id: 'robot', character: robot },
      { id: 'robot' },
    ),
  ],
});

describe('the characters of the floating assistant', () => {
  it("are Datalayer's four when its plugin is enabled", async () => {
    const reactor = buildReactorFromPlugins([AssistantCharactersPlugin]);
    await reactor.start();
    expect(assistantCharactersOf(reactor).map(entry => entry.id)).toEqual([
      'paperclip',
      'wizard',
      'cat',
      'eyes',
    ]);
    expect(assistantCharacterNamed(reactor, 'wizard')).toHaveProperty(
      'Drawing',
    );
  });

  it('are what the enabled plugins contribute, and nothing else', async () => {
    const reactor = buildReactorFromPlugins([RobotPlugin]);
    await reactor.start();
    expect(assistantCharactersOf(reactor).map(entry => entry.id)).toEqual([
      'robot',
    ]);
    expect(assistantCharacterNamed(reactor, 'robot')).toBe(robot);
    expect(() => assistantCharacterNamed(reactor, 'paperclip')).toThrow(
      'No enabled plugin contributes the assistant character "paperclip"; the characters are robot.',
    );
  });
});
