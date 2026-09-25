/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which models a chat offers, and which one it opens on.
 *
 * The case behind it: a server listed thirty models with two usable, its
 * default was one of the unusable ones, and the chat opened on Alibaba — the
 * first row — and answered the first message with "Set the ALIBABA_API_KEY
 * environment variable".
 */

import { describe, expect, it } from 'vitest';
import type { ModelConfig } from '../../types/chat';
import {
  initialModelId,
  isOffered,
  readServerCatalogue,
  usableModels,
} from './modelChoice';

const model = (id: string, isAvailable?: boolean): ModelConfig => ({
  id,
  name: id,
  ...(isAvailable === undefined ? {} : { isAvailable }),
});

const alibaba = model('alibaba:qwen-max', false);
const sonnet45 = model('bedrock:us.anthropic.claude-sonnet-4-5', false);
const sonnet46 = model('bedrock:us.anthropic.claude-sonnet-4-6', true);
const unflagged = model('openai:gpt-4.1');

describe('the models on offer', () => {
  it('are the usable ones, in the order they came', () => {
    expect(usableModels([alibaba, sonnet45, sonnet46, unflagged])).toEqual([
      sonnet46,
      unflagged,
    ]);
  });

  it('are all of them when none is usable, so the reasons stay readable', () => {
    expect(usableModels([alibaba, sonnet45])).toEqual([alibaba, sonnet45]);
  });
});

describe('the model a chat opens on', () => {
  it('is the preferred one when it is offered and usable', () => {
    expect(initialModelId([alibaba, sonnet46], sonnet46.id)).toBe(sonnet46.id);
  });

  it('is never a preferred model that cannot be called', () => {
    // The default named Sonnet 4.5, marked unavailable, and the chat used to
    // open on it regardless.
    expect(initialModelId([alibaba, sonnet45, sonnet46], sonnet45.id)).toBe(
      sonnet46.id,
    );
  });

  it('is the first usable one without a preference', () => {
    expect(initialModelId([alibaba, sonnet46, unflagged])).toBe(sonnet46.id);
  });

  it('is the first there is when none is usable, and none when there is none', () => {
    expect(initialModelId([alibaba, sonnet45])).toBe(alibaba.id);
    expect(initialModelId([])).toBeUndefined();
  });
});

describe('whether a selection may stand', () => {
  it('may when the model is offered and usable, and not otherwise', () => {
    // The chat picked from the browser's catalogue before the server had
    // answered; the server then offered one model, and the guess was not it.
    expect(isOffered([sonnet46], sonnet46.id)).toBe(true);
    expect(isOffered([sonnet46], alibaba.id)).toBe(false);
    expect(isOffered([alibaba, sonnet46], alibaba.id)).toBe(false);
    expect(isOffered([sonnet46], '')).toBe(false);
  });
});

describe("the server's catalogue, read", () => {
  it('turns `available` into the flag the chat reads', () => {
    const offered = readServerCatalogue({
      models: [
        {
          id: 'alibaba:qwen-max',
          name: 'Alibaba Qwen-Max',
          available: false,
          missing_env_vars: ['ALIBABA_API_KEY'],
        },
        {
          id: 'bedrock:us.anthropic.claude-sonnet-4-6',
          name: 'Bedrock Claude Sonnet 4.6',
          available: true,
          missing_env_vars: [],
        },
        {
          id: 'ollama:qwen3',
          available: false,
          reason: 'ollama is not running',
        },
      ],
    });
    expect(offered.map(m => [m.id, m.isAvailable])).toEqual([
      ['alibaba:qwen-max', false],
      ['bedrock:us.anthropic.claude-sonnet-4-6', true],
      ['ollama:qwen3', false],
    ]);
    expect(offered[0].unavailableReason).toBe('Set ALIBABA_API_KEY');
    expect(offered[1].unavailableReason).toBeUndefined();
    expect(offered[2].unavailableReason).toBe('ollama is not running');
    // And the opening pick is the one usable row, whatever came first.
    expect(initialModelId(offered)).toBe(
      'bedrock:us.anthropic.claude-sonnet-4-6',
    );
    expect(usableModels(offered)).toHaveLength(1);
  });

  it('reads nothing from no catalogue', () => {
    expect(readServerCatalogue(null)).toEqual([]);
    expect(readServerCatalogue({})).toEqual([]);
  });
});
