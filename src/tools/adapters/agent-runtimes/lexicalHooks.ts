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

// import { useMemo } from 'react'; // Removed - not using memoization to ensure fresh tools after patches
import type { ToolExecutionContext } from '@datalayer/jupyter-react';
import {
  useLexicalStore,
  DefaultExecutor as LexicalDefaultExecutor,
  lexicalToolDefinitions,
  lexicalToolOperations,
} from '@datalayer/jupyter-lexical';
import { createAllAgentRuntimesTools } from './AgentRuntimesToolAdapter';
import type { FrontendToolDefinition } from '../../../components/chat/types/tool';

/**
 * Hook that creates agent-runtimes tools for lexical operations.
 * Returns stable tools array that won't cause re-renders.
 *
 * @param documentId - Document ID (lexical document identifier)
 * @param contextOverrides - Optional context overrides (format, extras, etc.)
 * @returns Frontend tools array for ChatFloating / Chat
 *
 * @example
 * ```typescript
 * // Default context (toon format for AI)
 * const frontendTools = useLexicalTools("doc-123");
 *
 * // Use with ChatFloating
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
  console.log('[useLexicalTools] 🎣 Hook called with documentId:', documentId);

  // Get fresh store state every render - NO MEMOIZATION
  // This ensures we always use the latest patched methods after hot reload
  const lexicalStoreState = useLexicalStore();
  console.log(
    '[useLexicalTools] 📦 Store state obtained:',
    !!lexicalStoreState,
  );

  // Create new executor every render - NO MEMOIZATION
  console.log(
    '[useLexicalTools] 🔧 Creating new executor for documentId:',
    documentId,
  );
  const executor = new LexicalDefaultExecutor(documentId, lexicalStoreState);

  // Create new context every render - NO MEMOIZATION
  console.log('[useLexicalTools] 📝 Creating context');
  const context: ToolExecutionContext = {
    documentId,
    executor,
    format: 'toon',
    ...contextOverrides,
  };

  // Create new tools array every render - NO MEMOIZATION
  console.log('[useLexicalTools] 🛠️ Creating tools array');
  const tools = createAllAgentRuntimesTools(
    lexicalToolDefinitions,
    lexicalToolOperations,
    context,
  );
  console.log('[useLexicalTools] ✅ Created', tools.length, 'tools');

  return tools;
}

export type { FrontendToolDefinition };
