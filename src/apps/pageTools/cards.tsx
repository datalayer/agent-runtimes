/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the cards of the page's own tools share: the conversation's state
 * kept current, which call draws the live card, and the one line every
 * other call is.
 *
 * A deck or a sheet is built by many calls; drawn at each, the transcript
 * would hold as many copies. So the last call that changed it draws it,
 * live, and the calls before it are a line each saying what they did.
 *
 * @module apps/pageTools/cards
 */

import { useEffect, useSyncExternalStore, type JSX } from 'react';
import type { Icon } from '@primer/octicons-react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../types/chat';
import { useToolCalls } from '../toolCards/toolResults';
import {
  bareToolName,
  succeeded,
  type ConversationBound,
} from './conversation';

/** The conversation's state, kept current and following its recorded calls. */
export function useConversationBound<S>(
  bound: ConversationBound<S>,
  tools: readonly string[],
): { state: S; latest: string | undefined } {
  const calls = useToolCalls(tools);
  useEffect(() => {
    void bound.sync(calls);
  }, [bound, calls]);
  useSyncExternalStore(bound.subscribe, bound.getRevision, bound.getRevision);
  const done = calls.filter(succeeded);
  return { state: bound.read(), latest: done[done.length - 1]?.toolCallId };
}

/** Whether a tool answered a refusal: a sentence, or an error, rather than what it did or read. */
export function refused(result: unknown): boolean {
  if (typeof result === 'string') {
    const text = result.trim();
    if (!text.startsWith('{')) {
      return true;
    }
    try {
      return refused(JSON.parse(text));
    } catch {
      return true;
    }
  }
  return (
    result === null ||
    result === undefined ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    'error' in result
  );
}

/** Where a call stands among its conversation's: the live card, a line, or the chat's own row. */
export function cardRole(
  context: ToolCallRenderContext,
  latest: string | undefined,
  /**
   * The side panel its UI is placed in (`useCardSide`): the live view is
   * drawn there, and every call here is a line.
   */
  side?: 'left' | 'right',
): 'live' | 'line' | 'pending' | 'default' {
  if (context.status === 'error') {
    return 'default';
  }
  if (context.status !== 'complete') {
    return 'pending';
  }
  if (refused(context.result)) {
    // Refused in a sentence: the chat's own row says it.
    return 'default';
  }
  // A read changes nothing: it is a line, and the card stays where it was.
  return !side &&
    context.toolCallId === latest &&
    succeeded({ result: context.result })
    ? 'live'
    : 'line';
}

/** A tool's bare name, among those a card draws. */
export const toolOf = (
  context: ToolCallRenderContext,
  tools: readonly string[],
): string => bareToolName(context.toolName, tools) ?? context.toolName;

/** One call in one line: a glyph, what it did. */
export function CallLine({
  icon: Glyph,
  children,
  busy = false,
  data,
}: {
  icon: Icon;
  children: string;
  busy?: boolean;
  data: string;
}): JSX.Element {
  return (
    <Box
      data-page-tool-line={data}
      aria-busy={busy || undefined}
      display="flex"
      alignItems="center"
      my={1}
      sx={{
        gap: 2,
        color: 'fg.muted',
        fontSize: 0,
        lineHeight: '20px',
        minWidth: 0,
        opacity: busy ? 0.72 : 1,
      }}
    >
      <Box as="span" aria-hidden="true" sx={{ display: 'inline-flex' }}>
        <Glyph size={12} />
      </Box>
      <Box
        as="span"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A side panel's words before its tools built anything in this conversation. */
export function PanelEmpty({
  icon: Glyph,
  title,
  children,
  data,
}: {
  icon: Icon;
  title: string;
  children: string;
  data: string;
}): JSX.Element {
  return (
    <Box
      data-page-tool-panel-empty={data}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      flex={1}
      minHeight={220}
      px={4}
      sx={{ gap: 2, color: 'fg.muted' }}
    >
      <Box aria-hidden="true" sx={{ color: 'fg.subtle' }}>
        <Glyph size={24} />
      </Box>
      <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}>
        {title}
      </Text>
      <Text sx={{ fontSize: 0, maxWidth: 280 }}>{children}</Text>
    </Box>
  );
}
