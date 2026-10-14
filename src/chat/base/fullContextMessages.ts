/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's conversation as the runtime's agent holds it (`fullContext`, from
 * the `agent.snapshot` it sends), drawn as messages — kept out of `ChatBase`
 * so it can be read and tested without rendering a chat.
 *
 * A shipped application's page opens on this conversation, so a turn a
 * personal agent asked over PAP or PACT is drawn through `askedOf`: the
 * preamble the runtime told the application (`<asked-for>…</asked-for>`) is
 * kept in the record for the builder and never shown to the person.
 */

import { askedOf } from '../../apps/apps/records';
import type { ChatMessage } from '../../types/messages';

export function extractChatMessagesFromFullContext(
  fullContext: Record<string, unknown> | null,
): ChatMessage[] {
  if (!fullContext) {
    return [];
  }

  const rawMessages = Array.isArray(fullContext.messages)
    ? (fullContext.messages as Array<Record<string, unknown>>)
    : [];

  return rawMessages
    .map((msg, index) => {
      const role = String(msg.role || '').toLowerCase();

      const timestampValue =
        typeof msg.timestamp === 'string' && msg.timestamp.length > 0
          ? msg.timestamp
          : new Date().toISOString();
      const createdAtRaw = new Date(timestampValue);
      const createdAt = Number.isNaN(createdAtRaw.getTime())
        ? new Date()
        : createdAtRaw;

      const rawContent =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content ?? '');

      const isToolCall = Boolean(msg.isToolCall);
      const isToolResult = Boolean(msg.isToolResult);
      const toolCallId =
        typeof msg.toolCallId === 'string' && msg.toolCallId.length > 0
          ? msg.toolCallId
          : undefined;
      const toolName =
        typeof msg.toolName === 'string' && msg.toolName.length > 0
          ? msg.toolName
          : undefined;

      // Tool-call turns arrive as assistant messages whose `content` is the
      // JSON-encoded tool arguments. Reconstruct a structured `toolCalls`
      // entry so it renders as a tool card (matching the live stream) instead
      // of leaking raw JSON into the transcript.
      if (isToolCall) {
        let args: Record<string, unknown> = {};
        if (rawContent) {
          try {
            const parsed = JSON.parse(rawContent);
            if (
              parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed)
            ) {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            args = {};
          }
        }
        const resolvedToolCallId = toolCallId || `history-tc-${index}`;
        return {
          id: `history-toolcall-${index}-${timestampValue}`,
          role: 'assistant',
          content: '',
          createdAt,
          toolCalls: [
            {
              type: 'tool-call',
              toolCallId: resolvedToolCallId,
              toolName: toolName || 'tool',
              args,
              status: 'completed',
            },
          ],
        } as ChatMessage;
      }

      // Tool results arrive as `role: 'tool'` messages; keep them (with the
      // matching toolCallId) so `convertHistoryToDisplayItems` can merge the
      // result into its tool card.
      if (isToolResult || role === 'tool') {
        return {
          id: `history-toolresult-${index}-${timestampValue}`,
          role: 'tool',
          content: rawContent,
          createdAt,
          metadata: {
            toolCallId,
            toolName,
          },
        } as ChatMessage;
      }

      // Only hydrate conversational turns in the visible history.
      // System messages may contain internal prompts and metadata.
      if (role !== 'user' && role !== 'assistant') {
        return null;
      }

      // A turn a personal agent asked: what the runtime told the application
      // before the person's words is never shown to them (decided 2026-10-14).
      return {
        id: `history-${role}-${index}-${timestampValue}`,
        role,
        content: role === 'user' ? askedOf(rawContent) : rawContent,
        createdAt,
      } as ChatMessage;
    })
    .filter((m): m is ChatMessage => m !== null);
}
