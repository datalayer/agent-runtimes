/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which conversation a page tool's call, or a panel, belongs to.
 *
 * The page's document and notebook are the conversation's: kept while the
 * person switches side-panel tabs, another one on a new thread, and one per
 * workspace when a page embeds several. Their state is kept by a key made of
 * the workspace's surface (fixed for the life of the workspace) and the
 * thread the chat sends on. The chat hands the key to the tools it runs
 * (`withConversation`, the call's `context`), and a panel reads it from its
 * workspace (`conversationKeyOf`): both from the same two facts.
 *
 * @module apps/pageTools/conversationScope
 */

import type {
  FrontendToolCallContext,
  FrontendToolDefinition,
} from '../../types/tools';

/** The facts of a workspace the key is made of. */
export type ConversationFacts = {
  surfaceId?: string;
  thread?: string;
  conversationId?: string;
};

/**
 * The conversation's key: its workspace's surface and its thread (the
 * conversation it continues, before the chat has sent on one). Empty outside
 * a workspace: the page's one document and notebook.
 */
export function conversationKeyOf(
  workspace: ConversationFacts | undefined,
): string {
  if (!workspace?.surfaceId) {
    return '';
  }
  return `${workspace.surfaceId}:${workspace.thread ?? workspace.conversationId ?? ''}`;
}

/** An id of the page's, for this conversation: the id itself for none. */
export const conversationScopedId = (id: string, conversation = ''): string =>
  conversation ? `${id}:${conversation}` : id;

/** The conversation a call says it is part of; empty when it says none. */
export const conversationOf = (
  context: FrontendToolCallContext | undefined,
): string => context?.conversation ?? '';

/** The same tools, each call told the conversation it is part of, as it is when called. */
export function withConversation(
  tools: readonly FrontendToolDefinition[],
  conversation: () => string,
): FrontendToolDefinition[] {
  return tools.map(tool => {
    const handler = tool.handler;
    if (!handler) {
      return tool;
    }
    return {
      ...tool,
      handler: (args: Record<string, unknown>, context) =>
        handler(args, { ...context, conversation: conversation() }),
    };
  });
}

/**
 * Tools that act on a conversation's own surface, by name: each call runs
 * the handler of the same tool built for the call's conversation (`build`,
 * once per conversation), so the tools handed to the chat stay one set.
 */
export function perConversation(
  tools: readonly FrontendToolDefinition[],
  build: (conversation: string) => readonly FrontendToolDefinition[],
): FrontendToolDefinition[] {
  const built = new Map<string, readonly FrontendToolDefinition[]>();
  const forConversation = (conversation: string) => {
    let set = built.get(conversation);
    if (!set) {
      set = build(conversation);
      built.set(conversation, set);
    }
    return set;
  };
  return tools.map(tool => {
    if (!tool.handler) {
      return tool;
    }
    return {
      ...tool,
      handler: async (args: Record<string, unknown>, context) => {
        const own = forConversation(conversationOf(context)).find(
          each => each.name === tool.name,
        );
        if (!own?.handler) {
          throw new Error(
            `${tool.name} is not available in this conversation.`,
          );
        }
        return own.handler(args, context);
      },
    };
  });
}
