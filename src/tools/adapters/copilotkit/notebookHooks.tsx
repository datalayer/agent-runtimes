/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hooks and components for copilotkit (CopilotKit) notebook tool registration.
 * Provides: useNotebookToolActions, ActionRegistrar, UseFrontendToolFn.
 *
 * @module tools/adapters/copilotkit/notebookHooks
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
  createAllCopilotKitActions,
  ActionRegistrar,
  type UseFrontendToolFn,
} from './CopilotKitToolAdapter';

// Hook wrapper to get notebook store state
const useNotebookStore = () => notebookStore.getState();

/**
 * Hook that creates CopilotKit actions for notebook tools.
 * Returns stable actions array that won't cause re-renders.
 *
 * @param documentId - Document ID (notebook identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns CopilotKit actions
 *
 * @example
 * ```typescript
 * // Default context (toon format for AI)
 * const actions = useNotebookToolActions("my-notebook-id");
 *
 * // Custom format
 * const actions = useNotebookToolActions("my-notebook-id", { format: 'json' });
 *
 * // With extras
 * const actions = useNotebookToolActions("my-notebook-id", {
 *   format: 'toon',
 *   extras: { userId: '123', theme: 'dark' }
 * });
 * ```
 */
export function useNotebookToolActions(
  documentId: string,
  contextOverrides?: Partial<
    Omit<ToolExecutionContext, 'executor' | 'documentId'>
  >,
): ReturnType<typeof createAllCopilotKitActions> {
  const notebookStore = useNotebookStore();

  // Create DefaultExecutor (stable reference)
  // Only recreate when documentId changes, not on every state update
  // The executor holds a reference to the store which is always current
  // TODO: Revisit - Cast to satisfy index signature requirement for dynamic method lookup
  const executor = useMemo(
    () =>
      new DefaultExecutor(
        documentId,
        notebookStore as unknown as ConstructorParameters<
          typeof DefaultExecutor
        >[1],
      ),
    [documentId], // Removed notebookStore - executor should be stable per ID
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
  return useMemo(
    () =>
      createAllCopilotKitActions(
        notebookToolDefinitions,
        notebookToolOperations,
        context,
      ),
    [context],
  );
}

// Re-export shared types and components for convenience
export { ActionRegistrar, type UseFrontendToolFn };
