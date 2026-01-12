/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hooks and components for copilotkit (CopilotKit) lexical tool registration.
 * Provides: useLexicalToolActions, ActionRegistrar, UseFrontendToolFn.
 *
 * @module tools/adapters/copilotkit/lexicalHooks
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
  createAllCopilotKitActions,
  ActionRegistrar,
  type UseFrontendToolFn,
} from './CopilotKitToolAdapter';

/**
 * Hook that creates CopilotKit actions for lexical tools.
 * Returns stable actions array that won't cause re-renders.
 *
 * @param documentId - Document ID (lexical document identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns CopilotKit actions
 *
 * @example
 * ```typescript
 * // Default context (toon format for AI)
 * const actions = useLexicalToolActions("doc-123");
 *
 * // Custom format
 * const actions = useLexicalToolActions("doc-123", { format: 'json' });
 *
 * // With extras
 * const actions = useLexicalToolActions("doc-123", {
 *   format: 'toon',
 *   extras: { userId: '123', theme: 'dark' }
 * });
 * ```
 */
export function useLexicalToolActions(
  documentId: string,
  contextOverrides?: Partial<
    Omit<ToolExecutionContext, 'executor' | 'documentId'>
  >,
): ReturnType<typeof createAllCopilotKitActions> {
  // Call useLexicalStore() with no selector to get state object (matches notebook pattern)
  const lexicalStoreState = useLexicalStore();

  // Create LexicalDefaultExecutor (stable reference)
  // Only recreate when documentId changes, not on every state update
  // The executor holds a reference to the store which is always current
  const executor = useMemo(
    () => new LexicalDefaultExecutor(documentId, lexicalStoreState),
    [documentId], // Removed lexicalStoreState - executor should be stable per ID
  );

  // Create stable context object with useMemo
  // Defaults: format='toon' for conversational AI responses
  // Can be overridden with contextOverrides parameter
  const context = useMemo<ToolExecutionContext>(
    () => ({
      documentId,
      executor,
      format: 'toon', // Default format
      ...contextOverrides, // Override with user-provided values
    }),
    [documentId, executor, contextOverrides],
  );

  // Create and return CopilotKit actions (stable reference)
  // Only re-create when context changes (i.e., when documentId or contextOverrides change)
  const actions = useMemo(
    () =>
      createAllCopilotKitActions(
        lexicalToolDefinitions,
        lexicalToolOperations,
        context,
      ),
    [context], // Depend on context, which is stable unless ID/overrides change
  );

  return actions;
}

// Re-export shared types and components for convenience
export { ActionRegistrar, type UseFrontendToolFn };
