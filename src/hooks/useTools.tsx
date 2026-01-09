/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hooks for chat tool registration and usage.
 * Compatible with CopilotKit's useFrontendTool pattern.
 *
 * @module components/chat/hooks/useTools
 */

import { useEffect, useMemo } from 'react';
import { useChatStore, type ToolCallState } from '../components/chat/store';
import type {
  FrontendToolDefinition,
  ToolParameter,
  ToolRenderProps,
  ToolRenderAndWaitProps,
  ToolLocation,
} from '../components/chat/types/tool';

/**
 * Type signature for useFrontendTool hook
 * Compatible with CopilotKit's interface
 */
export type UseFrontendToolFn = <
  TArgs = Record<string, unknown>,
  TResult = unknown,
>(
  tool: {
    name: string;
    description: string;
    parameters: ToolParameter[];
    handler?: (args: TArgs) => Promise<TResult>;
    render?: (props: ToolRenderProps<TArgs, TResult>) => React.ReactNode;
    renderAndWaitForResponse?: (
      props: ToolRenderAndWaitProps<TArgs, TResult>,
    ) => React.ReactNode;
    location?: ToolLocation;
  },
  dependencies?: unknown[],
) => void;

/**
 * Hook to register a frontend tool
 * Compatible with CopilotKit's useFrontendTool
 *
 * @example
 * ```tsx
 * useFrontendTool({
 *   name: 'insert_heading',
 *   description: 'Insert a heading into the document',
 *   parameters: [
 *     { name: 'text', type: 'string', description: 'Heading text', required: true },
 *     { name: 'level', type: 'number', description: 'Heading level 1-6' }
 *   ],
 *   handler: async ({ text, level }) => {
 *     // Execute the tool
 *     return `Inserted heading: ${text}`;
 *   }
 * }, []);
 * ```
 */
export function useFrontendTool<
  TArgs = Record<string, unknown>,
  TResult = unknown,
>(
  tool: {
    name: string;
    description: string;
    parameters: ToolParameter[];
    handler?: (args: TArgs) => Promise<TResult>;
    render?: (props: ToolRenderProps<TArgs, TResult>) => React.ReactNode;
    renderAndWaitForResponse?: (
      props: ToolRenderAndWaitProps<TArgs, TResult>,
    ) => React.ReactNode;
    location?: ToolLocation;
  },
  dependencies: unknown[] = [],
): void {
  const registerTool = useChatStore(state => state.registerTool);
  const unregisterTool = useChatStore(state => state.unregisterTool);

  // Create stable tool definition
  const toolDefinition = useMemo<FrontendToolDefinition<TArgs, TResult>>(
    () => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      location: tool.location || 'frontend',
      handler: tool.handler as any,
      render: tool.render as any,
      renderAndWaitForResponse: tool.renderAndWaitForResponse as any,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool.name, ...dependencies],
  );

  // Register on mount, unregister on unmount
  useEffect(() => {
    registerTool(toolDefinition as any);

    return () => {
      unregisterTool(tool.name);
    };
  }, [toolDefinition, registerTool, unregisterTool, tool.name]);
}

/**
 * Hook to register a backend tool
 * Backend tools are executed server-side via the inference provider
 *
 * @example
 * ```tsx
 * useBackendTool({
 *   name: 'search_database',
 *   description: 'Search the database for records',
 *   parameters: [
 *     { name: 'query', type: 'string', required: true }
 *   ],
 *   render: ({ status, result }) => (
 *     <SearchResults status={status} results={result} />
 *   )
 * }, []);
 * ```
 */
export function useBackendTool(
  tool: {
    name: string;
    description: string;
    parameters: ToolParameter[];
    render?: (props: ToolRenderProps) => React.ReactNode;
  },
  dependencies: unknown[] = [],
): void {
  const registerTool = useChatStore(state => state.registerTool);
  const unregisterTool = useChatStore(state => state.unregisterTool);

  const toolDefinition = useMemo(
    () => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      location: 'backend' as const,
      render: tool.render,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool.name, ...dependencies],
  );

  useEffect(() => {
    registerTool(toolDefinition);

    return () => {
      unregisterTool(tool.name);
    };
  }, [toolDefinition, registerTool, unregisterTool, tool.name]);
}

/**
 * Hook to get registered tools
 */
export function useRegisteredTools() {
  return useChatStore(state => state.getTools());
}

/**
 * Hook to get a specific tool by name
 */
export function useTool(name: string) {
  const getTool = useChatStore(state => state.getTool);
  return getTool(name);
}

/**
 * Hook to get pending tool calls
 */
export function usePendingToolCalls(): ToolCallState[] {
  return useChatStore(state => state.getPendingToolCalls());
}

/**
 * Component to register a single action/tool
 * Used with useFrontendTool for compatibility with existing patterns
 *
 * @example
 * ```tsx
 * {actions.map((action, i) => (
 *   <ActionRegistrar
 *     key={action.name || i}
 *     action={action}
 *     useFrontendTool={useFrontendTool}
 *   />
 * ))}
 * ```
 */
export function ActionRegistrar<
  TArgs = Record<string, unknown>,
  TResult = unknown,
>({
  action,
  useFrontendTool: useToolFn,
}: {
  action: {
    name: string;
    description: string;
    parameters: ToolParameter[];
    handler?: (args: TArgs) => Promise<TResult>;
    render?: (props: ToolRenderProps<TArgs, TResult>) => React.ReactNode;
    renderAndWaitForResponse?: (
      props: ToolRenderAndWaitProps<TArgs, TResult>,
    ) => React.ReactNode;
    location?: ToolLocation;
  };
  useFrontendTool: UseFrontendToolFn;
}): null {
  useToolFn(action, [action]);
  return null;
}
