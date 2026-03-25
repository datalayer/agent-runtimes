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
  lexicalStore,
  DefaultExecutor as LexicalDefaultExecutor,
  lexicalToolDefinitions,
  lexicalToolOperations,
} from '@datalayer/jupyter-lexical';
import { createAllAgentRuntimesTools } from './AgentRuntimesToolAdapter';
import type { FrontendToolDefinition } from '../../../types/tools';

/**
 * Hook that creates agent-runtimes tools for lexical operations.
 * Returns a **stable** tools array — only recreated when documentId changes.
 *
 * IMPORTANT: Uses `lexicalStore.getState()` (a plain snapshot) instead of the
 * reactive `useLexicalStore()` hook.  The reactive hook subscribes to every
 * Zustand state change (block insertions, cursor moves, etc.), which would
 * cause this hook — and therefore the parent component — to re-render on
 * every editor mutation.  That re-render creates a new tools array, which
 * previously caused `LexicalToolsPlugin` → `handleToolsReady` → `toolsKey++`
 * → ChatFloating remount → `isLoading` reset.
 *
 * The notebook hook (`useNotebookTools`) already uses this stable pattern
 * via `notebookStore.getState()` and `useMemo`, which is why the notebook
 * example never had this bug.
 *
 * @param documentId - Document ID (lexical document identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns Frontend tools array for ChatFloating / Chat
 *
 * @example
 * ```typescript
 * const frontendTools = useLexicalTools("doc-123");
 *
 * <ChatFloating
 *   endpoint="http://localhost:8765/api/v1/ag-ui/agent/"
 *   frontendTools={frontendTools}
 * />
 * ```
 */
export function useLexicalTools(
  documentId: string,
  contextOverrides?: Partial<
    Omit<ToolExecutionContext, 'executor' | 'documentId'>
  >,
): FrontendToolDefinition[] {
  // Create DefaultExecutor — stable reference, only recreate when documentId changes.
  // lexicalStore is a module-level Zustand store singleton; getState() returns
  // the current state snapshot.  The executor's methods access store methods
  // which internally read the latest state, so we don't need reactivity here.
  const executor = useMemo(
    () => new LexicalDefaultExecutor(documentId, lexicalStore.getState()),
    [documentId],
  );

  // Create stable context object with useMemo
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

export type { FrontendToolDefinition };
