/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coreStore, iamStore } from '@datalayer/core/lib/state';
import { libraryCard, publicLibraryTools } from '../plugins/public-library';

const originalConfiguration = coreStore.getState().configuration;

const response = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  ({ ok, status, json: async () => body }) as Response;

const tool = (name: string) => {
  const found = publicLibraryTools().find(each => each.name === name);
  if (!found?.handler) throw new Error(`No frontend tool ${name}`);
  return found;
};

beforeEach(() => {
  coreStore.setState({
    configuration: {
      ...originalConfiguration,
      libraryUrl: 'https://library.example',
    },
  } as never);
  iamStore.setState({ token: undefined } as never);
});

afterEach(() => {
  coreStore.setState({ configuration: originalConfiguration } as never);
  iamStore.setState({ token: undefined } as never);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the public Library frontend tools', () => {
  it('searches public items anonymously and returns concise items for the agent', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        total: 1,
        offset: 0,
        items: [
          {
            uid: 'nb-1',
            type: 'notebook',
            name_t: 'Climate notebook',
            creator_handle_s: 'ada',
            publicUrl: 'https://datalayer.ai/public/notebooks/nb-1',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = (await tool('search_public_library').handler!({
      query: 'climate',
      types: 'notebook',
      limit: 5,
    })) as Record<string, unknown>;

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/library/v1/search?q=climate&max=5&offset=0&sort=relevance&types=%28notebook%29',
      ),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result).toMatchObject({ action: 'search', total: 1 });
    expect(result.items).toEqual([
      expect.objectContaining({
        uid: 'nb-1',
        name: 'Climate notebook',
        author: 'ada',
      }),
    ]);
  });

  it('publishes only after the signed-in person confirms', async () => {
    iamStore.setState({ token: 'member-token' } as never);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const cancelled = await tool('publish_library_item').handler!({
      uid: 'doc-1',
    });
    expect(cancelled).toMatchObject({ published: false, cancelled: true });
    expect(fetcher).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fetcher
      .mockResolvedValueOnce(response({ success: true, is_public: true }))
      .mockResolvedValueOnce(
        response({
          item: {
            uid: 'doc-1',
            type: 'document',
            name_t: 'Plan',
            publicUrl: 'https://datalayer.ai/public/documents/doc-1',
          },
        }),
      );
    const published = await tool('publish_library_item').handler!({
      uid: 'doc-1',
      tags: ['plan'],
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://library.example/api/library/v1/items/doc-1/public',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ is_public: true, tags: ['plan'] }),
        headers: expect.objectContaining({
          Authorization: 'Bearer member-token',
        }),
      }),
    );
    expect(published).toMatchObject({
      published: true,
      public_url: 'https://datalayer.ai/public/documents/doc-1',
    });
  });

  it('turns search and publication results into A2UI cards', () => {
    expect(
      libraryCard(
        {
          action: 'list',
          total: 1,
          items: [
            {
              uid: 'deck-1',
              type: 'deck',
              name: 'Launch',
              author: 'datalayer',
              url: 'https://datalayer.ai/public/decks/deck-1',
            },
          ],
        },
        'call-1',
      ),
    ).toMatchObject({
      title: 'Public Library',
      table: { columns: ['Type', 'Name', 'Author', 'Orbits'] },
      lines: ['[Launch](https://datalayer.ai/public/decks/deck-1)'],
    });
    expect(
      libraryCard(
        {
          action: 'publish',
          published: true,
          message: 'The item is public.',
          public_url: 'https://datalayer.ai/public/documents/doc-1',
        },
        'call-2',
      ).title,
    ).toBe('Published to the Library');
  });
});
