/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hooks for agent-runtimes lexical tool registration.
 * Provides: useLexicalTools hook for ChatFloating integration.
 *
 * @module tools/adapters/agent-runtimes/lexicalHooks
 */

import { useMemo } from 'react';
import type { ToolExecutionContext } from '@datalayer/jupyter-react';
import {
  useLexicalStore,
  DefaultExecutor as LexicalDefaultExecutor,
  lexicalToolDefinitions,
  lexicalToolOperations,
} from '@datalayer/jupyter-lexical';
import {
  createAllAgentRuntimesTools,
  type AgentRuntimesTool,
} from './AgentRuntimesToolAdapter';

/**
 * Hook that creates agent-runtimes tools for lexical operations.
 * Returns stable tools array that won't cause re-renders.
 *
 * @param documentId - Document ID (lexical document identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns Agent-runtimes tools array for ChatFloating
 *
 * @example
 * ```typescript
 * // Default context (toon format for AI)
 * const tools = useLexicalTools("doc-123");
 *
 * // Use with ChatFloating
 * <ChatFloating
 *   endpoint="http://localhost:8765/api/v1/ag-ui/agent/"
 *   tools={tools}
 * />
 * ```
 */
export function useLexicalTools(
  documentId: string,
  contextOverrides?: Partial<
    Omit<ToolExecutionContext, 'executor' | 'documentId'>
  >,
): AgentRuntimesTool[] {
  // Call useLexicalStore() with no selector to get state object
  const lexicalStoreState = useLexicalStore();

  // Create LexicalDefaultExecutor (stable reference)
  // Only recreate when documentId changes, not on every state update
  const executor = useMemo(
    () => new LexicalDefaultExecutor(documentId, lexicalStoreState),
    [documentId],
  );

  // Create stable context object with useMemo
  // Defaults: format='toon' for conversational AI responses
  const context = useMemo<ToolExecutionContext>(
    () => ({
      documentId,
      executor,
      format: 'toon',
      ...contextOverrides,
    }),
    [documentId, executor, contextOverrides],
  );

  // Create and return tools (stable reference)
  return useMemo(
    () =>
      createAllAgentRuntimesTools(
        lexicalToolDefinitions,
        lexicalToolOperations,
        context,
      ),
    [context],
  );
}

export type { AgentRuntimesTool };
