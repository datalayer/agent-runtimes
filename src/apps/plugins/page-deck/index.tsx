/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-page-deck` — a deck the agent builds in the
 * conversation, slide by slide, with frontend tools run in the page (the
 * user, 18 November 2026: "add to the marketer the frontend tools to create
 * slides").
 *
 * The plugin hands the chat's agent the deck tools (`pageTools/deck`:
 * create, add, replace, move and delete a slide, set the look, read), bound
 * to the conversation's deck, and draws their calls: the last one that
 * changed the deck draws it, live, as Datalayer Decks draws one — its notes
 * under it, Present for the full screen — and each call before is a line.
 * Nothing leaves the page: no deck is saved or published by these tools.
 *
 * @module apps/plugins/page-deck
 */

import { Suspense, lazy, type JSX } from 'react';
import { ProjectIcon } from '@primer/octicons-react';
import { Text } from '@primer/react';
import { Box, Card } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CallLine,
  cardRole,
  toolOf,
  useConversationBound,
} from '../../pageTools/cards';
import {
  DECK_TOOL_NAMES,
  DECK_WORDS,
  type DeckState,
} from '../../pageTools/deck';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { PAGE_DECK, pageDeckTools } from './store';

export const PAGE_DECK_PLUGIN_NAME = '@datalayer/loop-plugin-page-deck';

const DeckStage = lazy(() => import('./DeckStage'));

export const PAGE_DECK_WORDS = {
  kicker: 'Deck',
  writing: 'Writing the deck…',
  empty: 'No slide yet: the first one lands here.',
  kept: 'Kept in this conversation, on this page. Present shows it full screen.',
} as const;

const number = (value: unknown): string =>
  typeof value === 'number' ? String(value) : '?';

const named = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? ` “${value.trim()}”` : '';

/** What one call did, in a line. */
export function deckCallSays(
  tool: string,
  args: Record<string, unknown>,
): string {
  switch (tool) {
    case 'deck_create':
      return `Started the deck${named(args.title)}`;
    case 'deck_set_title':
      return `Titled the deck${named(args.title)}`;
    case 'deck_add_slide':
      return `Added a ${String(args.type ?? '')} slide${named(args.title ?? args.statement)}`.replace(
        '  ',
        ' ',
      );
    case 'deck_update_slide':
      return `Replaced slide ${number(args.slide)}${named(args.title ?? args.statement)}`;
    case 'deck_move_slide':
      return `Moved slide ${number(args.slide)} to ${number(args.to)}`;
    case 'deck_delete_slide':
      return `Deleted slide ${number(args.slide)}`;
    case 'deck_set_theme':
      return `Set the deck’s look: ${[
        args.template,
        args.theme,
        args.color_mode,
      ]
        .filter(Boolean)
        .join(', ')}`;
    default:
      return 'Read the deck';
  }
}

/** The deck, live: its title and count over the slides as Decks draws them. */
export function DeckFrame({ state }: { state: DeckState }): JSX.Element {
  const { deck, slides } = state.spec;
  return (
    <Card
      as="section"
      aria-label={`${PAGE_DECK_WORDS.kicker}: ${deck.title}`}
      data-page-deck=""
      data-page-deck-slides={slides.length}
      data-page-deck-template={deck.template}
      border
      shadow="none"
      overflow="hidden"
      my={2}
      width="100%"
      maxWidth={760}
    >
      <Box
        display="flex"
        alignItems="baseline"
        px={3}
        py={2}
        borderBottom="1px solid"
        borderColor="border.muted"
        sx={{ gap: 2, minWidth: 0 }}
      >
        <Text
          sx={{
            fontSize: 0,
            fontWeight: 'semibold',
            color: 'accent.fg',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {PAGE_DECK_WORDS.kicker}
        </Text>
        {/* The deck's own title is drawn by Decks, under this strip. */}
        <Box flex={1} />
        <Text
          sx={{
            fontSize: 0,
            color: 'fg.muted',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {DECK_WORDS.slides(slides.length)}
        </Text>
      </Box>
      {slides.length === 0 ? (
        <Box px={3} py={4}>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            {PAGE_DECK_WORDS.empty}
          </Text>
        </Box>
      ) : (
        <Suspense fallback={<Box minHeight={280} aria-busy="true" />}>
          <DeckStage
            spec={state.spec}
            moves={state.moves}
            shown={state.shown}
          />
        </Suspense>
      )}
      <Box
        px={3}
        py={2}
        borderTop="1px solid"
        borderColor="border.muted"
        bg="canvas.subtle"
      >
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {PAGE_DECK_WORDS.kept}
        </Text>
      </Box>
    </Card>
  );
}

export function PageDeckCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const { state, latest } = useConversationBound(PAGE_DECK, DECK_TOOL_NAMES);
  const tool = toolOf(context, DECK_TOOL_NAMES);
  const role = cardRole(context, latest);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const line = (
    <CallLine icon={ProjectIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? PAGE_DECK_WORDS.writing
        : deckCallSays(tool, context.args ?? {})}
    </CallLine>
  );
  if (role !== 'live') {
    return line;
  }
  return (
    <>
      {line}
      <DeckFrame state={state} />
    </>
  );
}

export const PageDeckPlugin = defineToolCardPlugin({
  id: 'page-deck',
  displayName: 'Deck in the page',
  description:
    'A deck the agent builds in the conversation, slide by slide, with tools run in the page.',
  octicon: 'project',
  emoji: '\u{1F39E}\u{FE0F}',
  tools: DECK_TOOL_NAMES,
  Card: PageDeckCard,
  frontendTools: pageDeckTools(),
});

export default PageDeckPlugin;
