/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Run an agent in the browser.
 *
 * The counterpart to {@link useVercelAI}, and the difference between them is
 * the whole of the harness split. `useVercelAI` speaks the AI SDK *protocol*
 * to a runtime that turns the loop somewhere else; this turns the loop here,
 * with the AI SDK itself, and reaches a server only to ask a model a question.
 *
 * Both return the same `useChat` helpers, so every chat component, message
 * renderer and tool part downstream is shared. The branch is one transport:
 *
 * ```
 *   useVercelAI       →  DefaultChatTransport  →  POST /api/v1/vercel-ai/chat
 *   useBrowserAgent   →  DirectChatTransport   →  the loop, in this page
 * ```
 *
 * @module hooks/useBrowserAgent
 */

import { useMemo } from 'react';
import { useChat, type UseChatHelpers, type UIMessage } from '@ai-sdk/react';
import { DirectChatTransport } from 'ai';
import {
  createBrowserAgent,
  type CreateBrowserAgentOptions,
} from '../runtimes/browser';

export type UseBrowserAgentOptions = CreateBrowserAgentOptions & {
  /**
   * Chat id, so two agents on one page keep separate histories.
   *
   * Defaults to the spec id, which is right whenever a page runs one agent.
   */
  chatId?: string;
};

/**
 * A chat backed by an agent loop running in this page.
 *
 * ```tsx
 * const frontendTools = useNotebookTools(notebookId);
 * const { messages, sendMessage, status } = useBrowserAgent({
 *   spec: JUPYTER_NOTEBOOK_COMPACTOR_AGENTSPEC_0_0_1,
 *   frontendTools,
 *   inference: { inferenceUrl, token },
 * });
 * ```
 *
 * The tools are the same array the AG-UI path takes, and they behave the same
 * way — see {@link frontendToolsToVercelAI}.
 */
export function useBrowserAgent(
  options: UseBrowserAgentOptions,
): UseChatHelpers<UIMessage> {
  const {
    chatId,
    spec,
    frontendTools,
    inference,
    model,
    maxSteps,
    onHitlRequired,
    onStatusChange,
  } = options;

  // Rebuilt only when something the loop is made of changes. A new agent
  // identity would reset the transport mid-conversation, so the dependencies
  // are the primitives rather than the option object a caller re-creates on
  // every render.
  const agent = useMemo(
    () =>
      createBrowserAgent({
        spec,
        frontendTools,
        inference,
        model,
        maxSteps,
        onHitlRequired,
        onStatusChange,
      }),
    [
      spec,
      frontendTools,
      inference,
      model,
      maxSteps,
      onHitlRequired,
      onStatusChange,
    ],
  );

  const transport = useMemo(() => new DirectChatTransport({ agent }), [agent]);

  return useChat({
    id: chatId ?? `browser-agent-${spec.id}`,
    transport,
  }) as UseChatHelpers<UIMessage>;
}
