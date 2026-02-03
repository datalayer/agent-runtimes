/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hooks for agent-runtimes notebook tool registration.
 * Provides: useNotebookTools hook for ChatFloating integration.
 *
 * @module tools/adapters/agent-runtimes/notebookHooks
 */

import { useMemo } from 'react';
import type { ToolExecutionContext } from '@datalayer/jupyter-react';
import {
  notebookStore,
  DefaultExecutor,
  notebookToolDefinitions,
  notebookToolOperations,
} from '@datalayer/jupyter-react';
import {
  createAllAgentRuntimesTools,
  type AgentRuntimesTool,
} from './AgentRuntimesToolAdapter';

// Hook wrapper to get notebook store state
const useNotebookStore = () => notebookStore.getState();

/**
 * Hook that creates agent-runtimes tools for notebook operations.
 * Returns stable tools array that won't cause re-renders.
 *
 * @param documentId - Document ID (notebook identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns Agent-runtimes tools array for ChatFloating
 *
 * @example
 * ```typescript
 * // Default context (toon format for AI)
 * const tools = useNotebookTools("my-notebook-id");
 *
 * // Use with ChatFloating
 * <ChatFloating
 *   endpoint="http://localhost:8765/api/v1/ag-ui/agent/"
 *   tools={tools}
 * />
 * ```
 */
export function useNotebookTools(
  documentId: string,
  contextOverrides?: Partial<
    Omit<ToolExecutionContext, 'executor' | 'documentId'>
  >,
): AgentRuntimesTool[] {
  const notebookStoreState = useNotebookStore();

  // Create DefaultExecutor (stable reference)
  // Only recreate when documentId changes, not on every state update
  // TODO Revisit - Cast to satisfy index signature requirement for dynamic method lookup
  const executor = useMemo(
    () =>
      new DefaultExecutor(
        documentId,
        notebookStoreState as unknown as ConstructorParameters<
          typeof DefaultExecutor
        >[1],
      ),
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
        notebookToolDefinitions,
        notebookToolOperations,
        context,
      ),
    [context],
  );
}

export type { AgentRuntimesTool };
