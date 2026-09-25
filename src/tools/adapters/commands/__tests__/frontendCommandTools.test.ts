/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it, vi } from 'vitest';
import { defineAgentTools, type ReactorPlatform } from '@datalayer/reactor';
import {
  agentBundleToolDefinitions,
  agentBundleTools,
} from '../frontendCommandTools';

const decks = defineAgentTools({
  id: 'decks',
  name: 'Decks',
  plugin: '@datalayer/decks',
  commands: [
    {
      name: 'decks_next_slide',
      command: 'decks.nextSlide',
      description: 'Next',
    },
    {
      name: 'decks_open',
      command: 'decks.open',
      description: 'Open',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ],
});

const fakeReactor = () =>
  ({
    executeCommand: vi.fn(async () => undefined),
  }) as unknown as ReactorPlatform & {
    executeCommand: ReturnType<typeof vi.fn>;
  };

describe('agentBundleTools', () => {
  it('executes the command on the reactor, with the arguments whole', async () => {
    const reactor = fakeReactor();
    const [next, open] = agentBundleTools(decks, reactor);
    expect(next.parameters).toEqual({ type: 'object', properties: {} });
    await next.handler!({});
    expect(reactor.executeCommand).toHaveBeenCalledWith(
      'decks.nextSlide',
      undefined,
    );
    expect(await open.handler!({ id: 'startups/seed' })).toEqual({
      ok: true,
      command: 'decks.open',
      argument: { id: 'startups/seed' },
    });
  });

  it('answers with what the command returned, when it returned something', async () => {
    const reactor = fakeReactor();
    reactor.executeCommand.mockResolvedValueOnce([
      { id: 'talks/q2', slides: 7 },
    ]);
    const [, open] = agentBundleTools(decks, reactor);
    // The command's own answer, whole — not a note that it ran.
    expect(await open.handler!({ id: 'talks/q2' })).toEqual([
      { id: 'talks/q2', slides: 7 },
    ]);
  });

  it('names the plugin when there is no reactor to run the command on', async () => {
    const [next] = agentBundleTools(decks, null);
    await expect(next.handler!({})).rejects.toThrow(
      /@datalayer\/decks plugin is not mounted/,
    );
  });

  it('offers only the toolset, across bundles in order', () => {
    const narrowed = {
      ...decks,
      id: 'decks-read',
      toolset: ['decks_next_slide'],
    };
    const names = agentBundleToolDefinitions(
      [narrowed, decks],
      fakeReactor(),
    ).map(t => t.name);
    expect(names).toEqual([
      'decks_next_slide',
      'decks_next_slide',
      'decks_open',
    ]);
  });
});
