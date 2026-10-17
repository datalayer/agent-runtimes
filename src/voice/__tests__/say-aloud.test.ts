/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the runtime says of voice over the protocols (VO-35, VO-36):
 * `voice.say` read as a line to hear and caption — from AG-UI's custom
 * events and Vercel AI's data parts alike, nothing else taken for it.
 */

import { describe, expect, it } from 'vitest';
import {
  SAY_ALOUD_MAX_CHARACTERS,
  VOICE_SAY_EVENT,
  lineToSay,
} from '../sayAloud';

describe('A line the agent says aloud (VO-35)', () => {
  it('is read from AG-UI’s custom event and Vercel AI’s data part', () => {
    const data = {
      text: '  One   moment, I am looking that up. ',
      voice: 'kokoro-af-heart',
      language: 'en-US',
    };
    expect(lineToSay({ type: VOICE_SAY_EVENT, data })).toBe(
      'One moment, I am looking that up.',
    );
    expect(lineToSay({ type: `data-${VOICE_SAY_EVENT}`, data })).toBe(
      'One moment, I am looking that up.',
    );
  });

  it('is nothing for another event, an empty line, or no text', () => {
    expect(lineToSay({ type: 'loop.session', data: { text: 'x' } })).toBe(
      undefined,
    );
    expect(lineToSay({ type: VOICE_SAY_EVENT, data: { text: '  ' } })).toBe(
      undefined,
    );
    expect(lineToSay({ type: VOICE_SAY_EVENT, data: null })).toBe(undefined);
    expect(lineToSay({ type: VOICE_SAY_EVENT, data: { text: 3 } })).toBe(
      undefined,
    );
  });

  it('is a line, never an answer', () => {
    const long = 'x'.repeat(SAY_ALOUD_MAX_CHARACTERS + 50);
    expect(
      lineToSay({ type: VOICE_SAY_EVENT, data: { text: long } }),
    ).toHaveLength(SAY_ALOUD_MAX_CHARACTERS);
  });
});
