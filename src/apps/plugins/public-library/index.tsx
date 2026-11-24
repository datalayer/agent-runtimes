/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's public Library as frontend tools and A2UI cards in the chat.
 * Searches are public; publication uses the signed-in person's browser token
 * and asks them immediately before making their owned item public.
 *
 * @module apps/plugins/public-library
 */

import type { JSX } from 'react';
import { coreStore, iamStore } from '@datalayer/core/lib/state';
import type { ToolCallRenderContext } from '../../../types/chat';
import type { FrontendToolDefinition } from '../../../types/tools';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  records,
  safeUrl,
  words,
  wordsList,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';

export const PUBLIC_LIBRARY_PLUGIN_NAME =
  '@datalayer/agent-plugin-public-library';

export const PUBLIC_LIBRARY_TOOL_NAMES = [
  'search_public_library',
  'list_public_library',
  'publish_library_item',
] as const;

export const PUBLIC_LIBRARY_ITEM_TYPES = [
  'notebook',
  'document',
  'deck',
  'spreadsheet',
  'cell',
  'lesson',
  'exercise',
  'assignment',
  'course',
  'evalset',
  'dataset',
  'agent',
  'dataserver',
  'environment',
  'report',
  'investigation',
  'evaluator',
  'app',
] as const;

type LibraryItem = {
  uid: string;
  type: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  orbits: number;
  published: string;
  url: string;
};

const itemOf = (value: Record<string, unknown>): LibraryItem => ({
  uid: words(value.uid ?? value.id),
  type: words(value.type ?? value.type_s),
  name: words(value.name ?? value.name_t ?? value.title),
  description: words(value.description ?? value.description_t),
  author: words(
    value.author ?? value.creator_handle_s ?? value.publisher ?? value.owner,
  ),
  tags: wordsList(value.tags ?? value.tags_ss),
  orbits: Number(value.orbits ?? 0) || 0,
  published: words(value.published ?? value.published_ts_dt),
  url: safeUrl(value.url ?? value.publicUrl),
});

const libraryConnection = (): { base: string; token: string } => {
  const base = String(coreStore.getState().configuration?.libraryUrl ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) {
    throw new Error('This page does not know where the Datalayer Library is.');
  }
  return { base, token: String(iamStore.getState().token ?? '').trim() };
};

const answerDetail = (body: unknown, fallback: string): string => {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  const detail = record.detail;
  if (detail && typeof detail === 'object') {
    return words((detail as Record<string, unknown>).message) || fallback;
  }
  return words(record.message ?? detail) || fallback;
};

async function libraryRequest(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const { base, token } = libraryConnection();
  const response = await fetch(`${base}/api/library/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      answerDetail(
        body,
        `The Library refused the request (${response.status}).`,
      ),
    );
  }
  return body as Record<string, unknown>;
}

const typeFilter = (value: unknown): string => {
  const requested = words(value)
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(type => type.trim().toLowerCase())
    .filter(Boolean);
  const unknown = requested.filter(
    type => !(PUBLIC_LIBRARY_ITEM_TYPES as readonly string[]).includes(type),
  );
  if (unknown.length > 0) {
    throw new Error(
      `The public Library has no item type ${unknown.join(', ')}. Choose from: ${PUBLIC_LIBRARY_ITEM_TYPES.join(', ')}.`,
    );
  }
  return requested.length > 0 ? `(${requested.join(' ')})` : '';
};

type SearchArgs = {
  query?: string;
  types?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  author?: string;
  featured?: boolean;
};

async function findItems(
  args: SearchArgs,
  action: 'search' | 'list',
): Promise<Record<string, unknown>> {
  const sort = words(args.sort) || (action === 'list' ? 'recent' : 'relevance');
  if (!['relevance', 'recent', 'orbits'].includes(sort)) {
    throw new Error('Order the Library by relevance, recent, or orbits.');
  }
  const params = new URLSearchParams({
    q: action === 'list' ? '*' : words(args.query) || '*',
    max: String(Math.max(1, Math.min(100, Number(args.limit) || 20))),
    offset: String(Math.max(0, Number(args.offset) || 0)),
    sort,
  });
  const types = typeFilter(args.types);
  if (types) params.set('types', types);
  if (words(args.author)) params.set('owner', words(args.author));
  if (args.featured === true) params.set('featured', 'true');
  const body = await libraryRequest(`/search?${params.toString()}`);
  return {
    action,
    query: action === 'search' ? words(args.query) : '',
    items: records(body.items).map(itemOf),
    total: Number(body.total ?? 0) || 0,
    offset: Number(body.offset ?? 0) || 0,
    sort,
  };
}

type PublishArgs = {
  uid: string;
  description?: string;
  tags?: string[];
  video?: boolean;
};

async function publishItem(
  args: PublishArgs,
): Promise<Record<string, unknown>> {
  const uid = words(args.uid);
  if (!uid) throw new Error('Choose an owned item uid to publish.');
  const { token } = libraryConnection();
  if (!token) {
    throw new Error('Sign in before publishing one of your items.');
  }
  const approved =
    typeof window !== 'undefined' &&
    window.confirm(
      `Publish ${uid} in the public Library? Anyone will be able to find, open, and reuse it.`,
    );
  if (!approved) {
    return {
      action: 'publish',
      published: false,
      cancelled: true,
      uid,
      message: 'The item was not published.',
    };
  }
  await libraryRequest(`/items/${encodeURIComponent(uid)}/public`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_public: true,
      ...(args.description !== undefined
        ? { description: words(args.description) }
        : {}),
      ...(Array.isArray(args.tags) ? { tags: args.tags.map(words) } : {}),
      ...(args.video === true ? { video: true } : {}),
    }),
  });
  let item: LibraryItem | undefined;
  try {
    const publicItem = await libraryRequest(
      `/public/items/${encodeURIComponent(uid)}`,
    );
    const value = publicItem.item;
    if (value && typeof value === 'object') {
      item = itemOf(value as Record<string, unknown>);
    }
  } catch {
    // Publication has already succeeded. A projection may take a moment;
    // never turn that into a failure that invites the agent to publish twice.
  }
  return {
    action: 'publish',
    published: true,
    uid,
    item,
    public_url: item?.url ?? '',
    message: item?.url
      ? 'The item is public.'
      : 'The item is public; its Library page is still being prepared.',
  };
}

const searchParameters = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Words matched against public names, descriptions and tags.',
    },
    types: {
      type: 'string',
      description: `Optional comma-separated item types: ${PUBLIC_LIBRARY_ITEM_TYPES.join(', ')}.`,
    },
    limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'number', minimum: 0, default: 0 },
    sort: {
      type: 'string',
      enum: ['relevance', 'recent', 'orbits'],
    },
    author: { type: 'string', description: 'Optional publisher handle.' },
    featured: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export function publicLibraryTools(): FrontendToolDefinition[] {
  return [
    {
      name: 'search_public_library',
      description:
        'Search Datalayer’s public Library. Returns public notebooks, documents, decks, spreadsheets, cells and other artifacts with links the person can open.',
      parameters: {
        ...searchParameters,
        required: ['query'],
      },
      handler: args => findItems(args as SearchArgs, 'search'),
    },
    {
      name: 'list_public_library',
      description:
        'List public Library items, newest first unless another order is requested. Use it to browse without search words.',
      parameters: searchParameters,
      handler: args => findItems(args as SearchArgs, 'list'),
    },
    {
      name: 'publish_library_item',
      description:
        'Publish an existing item owned by the signed-in person to Datalayer’s public Library. The page always asks the person to confirm before publishing. Never use it merely to save or share privately.',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string', description: 'The owned item uid.' },
          description: {
            type: 'string',
            description:
              'Optional public description; omit to keep it unchanged.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional public tags; omit to keep them unchanged.',
          },
          video: {
            type: 'boolean',
            description: 'For a deck only, publish its saved video.',
            default: false,
          },
        },
        required: ['uid'],
        additionalProperties: false,
      },
      handler: args => publishItem(args as unknown as PublishArgs),
    },
  ];
}

const itemRows = (items: LibraryItem[]) =>
  items.map(item => ({
    Type: item.type,
    Name: item.name || item.uid,
    Author: item.author,
    Orbits: item.orbits ? String(item.orbits) : '',
  }));

export function libraryCard(
  data: Record<string, unknown>,
  id: string,
): CardSpec {
  const action = words(data.action);
  if (action === 'publish') {
    const published = data.published === true;
    const itemRecord = records(data.item ? [data.item] : [])[0];
    const item = itemRecord ? itemOf(itemRecord) : undefined;
    const url = safeUrl(data.public_url ?? item?.url);
    return {
      id: `library-${id}`,
      title: published ? 'Published to the Library' : 'Not published',
      captions: [words(data.message)].filter(Boolean),
      lines: [
        item
          ? [item.type, item.name || item.uid].filter(Boolean).join(' · ')
          : '',
        url ? `[Open the public item](${url})` : '',
      ].filter(Boolean),
    };
  }
  const items = records(data.items).map(itemOf);
  const total = Number(data.total ?? items.length) || 0;
  const query = words(data.query);
  return {
    id: `library-${id}`,
    title: action === 'search' ? 'Library search' : 'Public Library',
    captions: [
      `${items.length} of ${total} shown`,
      query ? `For “${query}”` : '',
    ].filter(Boolean),
    ...(items.length > 0
      ? {
          table: {
            columns: ['Type', 'Name', 'Author', 'Orbits'],
            rows: itemRows(items),
          },
        }
      : {}),
    lines: items
      .filter(item => item.url)
      .map(item => `[${item.name || item.uid}](${item.url})`),
  };
}

export function PublicLibraryCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) return <>{context.defaultUI}</>;
  if (!read.done) return <CardSkeleton label="Looking in the Library…" />;
  return (
    <A2uiCard
      spec={libraryCard(read.data, context.toolCallId)}
      maxWidth={760}
    />
  );
}

export const PublicLibraryPlugin = defineToolCardPlugin({
  id: 'public-library',
  displayName: 'Public Library',
  description:
    'Searches and lists Datalayer’s public artifacts, and publishes an owned item only after the person confirms.',
  octicon: 'book',
  emoji: '\u{1F4DA}',
  tools: PUBLIC_LIBRARY_TOOL_NAMES,
  Card: PublicLibraryCard,
  frontendTools: publicLibraryTools(),
});

export default PublicLibraryPlugin;
