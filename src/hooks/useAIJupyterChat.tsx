/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';

export interface IUseAIJupyterChatOptions {
  apiUrl?: string;
  initialMessages?: unknown[];
}

/**
 * Hook to manage chat state with JupyterLab backend.
 * Adapts Vercel AI SDK's useChat for Datalayer AI context.
 */
export function useAIJupyterChat(_options: IUseAIJupyterChatOptions = {}) {
  // Build the full API URL for the chat endpoint
  const settings = ServerConnection.makeSettings();
  const chatEndpoint = URLExt.join(settings.baseUrl, 'agent_runtimes', 'chat');

  const { messages, sendMessage, status, setMessages, regenerate } = useChat({
    id: 'ai-jupyter-chat',
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      credentials: settings.token ? 'include' : 'omit',
      headers: {
        Authorization: `token ${settings.token || ''}`,
        'X-XSRFToken': settings.token || '',
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          mode: 'cors',
          credentials: settings.token ? 'include' : 'omit',
        });
      },
    }),
  });

  // Clear chat history
  const clearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return useMemo(
    () => ({
      messages,
      sendMessage,
      status,
      setMessages,
      regenerate,
      clearChat,
    }),
    [messages, sendMessage, status, setMessages, regenerate, clearChat],
  );
}
