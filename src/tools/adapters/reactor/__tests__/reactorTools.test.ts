/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ReactorPlatform } from '@datalayer/reactor';
import type { ReactorToolSpec } from '../../../../types';
import {
  buildReactorBackendRequest,
  reactorBackendTools,
  reactorCommandTools,
  reactorToolDefinitions,
} from '../reactorTools';

const decks: ReactorToolSpec = {
  id: 'decks',
  version: '0.0.1',
  name: 'Decks',
  description: '',
  tags: [],
  enabled: true,
  plugin: '@datalayer/decks',
  frontend: [
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
        properties: { id: { type: 'string' }, slide: { type: 'integer' } },
        required: ['id'],
      },
    },
  ],
  backend: {
    baseUrl: 'http://decks.test',
    tools: [
      {
        name: 'decks_list_decks',
        method: 'GET',
        path: '/decks',
        description: 'List',
      },
      {
        name: 'decks_get_deck',
        method: 'GET',
        path: '/decks/{id}',
        description: 'Get',
        parameters: { type: 'object', properties: { id: { type: 'string' } } },
      },
      {
        name: 'decks_create_deck',
        method: 'POST',
        path: '/decks',
        description: 'Create',
        parameters: {
          type: 'object',
          properties: { slug: { type: 'string' } },
        },
      },
      {
        name: 'decks_delete_deck',
        method: 'DELETE',
        path: '/decks/{id}',
        description: 'Delete',
      },
    ],
  },
};

const fakeReactor = () =>
  ({
    executeCommand: vi.fn(async () => undefined),
  }) as unknown as ReactorPlatform & {
    executeCommand: ReturnType<typeof vi.fn>;
  };

describe('reactorCommandTools', () => {
  it('executes the command on the reactor, with the arguments whole', async () => {
    const reactor = fakeReactor();
    const [next, open] = reactorCommandTools(decks, reactor);
    expect(next.parameters).toEqual({ type: 'object', properties: {} });
    await next.handler!({});
    expect(reactor.executeCommand).toHaveBeenCalledWith(
      'decks.nextSlide',
      undefined,
    );
    const result = await open.handler!({ id: 'startups/seed', slide: 3 });
    expect(reactor.executeCommand).toHaveBeenLastCalledWith('decks.open', {
      id: 'startups/seed',
      slide: 3,
    });
    expect(result).toEqual({
      ok: true,
      command: 'decks.open',
      argument: { id: 'startups/seed', slide: 3 },
    });
  });

  it('names the plugin when there is no reactor to run the command on', async () => {
    const [next] = reactorCommandTools(decks, null);
    await expect(next.handler!({})).rejects.toThrow(
      /@datalayer\/decks plugin is not mounted/,
    );
  });
});

describe('buildReactorBackendRequest', () => {
  const tools = decks.backend!.tools;

  it('substitutes path parameters and keeps their slashes', () => {
    const { url, init } = buildReactorBackendRequest(tools[1], 'http://b', {
      id: 'startups/seed',
    });
    expect(url).toBe('http://b/decks/startups/seed');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('sends the rest as a query for GET and as JSON otherwise', () => {
    const get = buildReactorBackendRequest(tools[0], 'http://b', { limit: 5 });
    expect(get.url).toBe('http://b/decks?limit=5');
    const post = buildReactorBackendRequest(tools[2], 'http://b', {
      slug: 'hello',
      spec: { deck: { title: 'Hi' } },
    });
    expect(post.url).toBe('http://b/decks');
    expect(post.init.method).toBe('POST');
    expect(JSON.parse(post.init.body as string)).toEqual({
      slug: 'hello',
      spec: { deck: { title: 'Hi' } },
    });
  });
});

describe('reactorBackendTools', () => {
  it('calls the backend and returns its JSON', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify([{ id: 'x' }]), { status: 200 }),
    );
    const [list] = reactorBackendTools(decks, {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(list.handler!({})).resolves.toEqual([{ id: 'x' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://decks.test/decks',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('turns a failing status into an error the model can read', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('no such deck', { status: 404 }),
    );
    const [, get] = reactorBackendTools(decks, {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(get.handler!({ id: 'nope' })).rejects.toThrow(
      /404 — no such deck/,
    );
  });

  it('answers a 204 with ok', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const tools = reactorBackendTools(decks, {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(tools[3].handler!({ id: 'x' })).resolves.toEqual({ ok: true });
  });
});

describe('reactorToolDefinitions', () => {
  it('lists commands then backend tools, and skips a disabled bundle', () => {
    const names = reactorToolDefinitions([decks], {
      reactor: fakeReactor(),
    }).map(t => t.name);
    expect(names).toEqual([
      'decks_next_slide',
      'decks_open',
      'decks_list_decks',
      'decks_get_deck',
      'decks_create_deck',
      'decks_delete_deck',
    ]);
    expect(reactorToolDefinitions([{ ...decks, enabled: false }])).toEqual([]);
  });
});
