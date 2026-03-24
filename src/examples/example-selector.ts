/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

/**
 * Registry of available examples with dynamic imports.
 * Add new examples here to make them available in the example runner.
 */
export const EXAMPLES: Record<
  string,
  () => Promise<{ default: React.ComponentType }>
> = {
  //  Lexical2Example: () => import('./Lexical2Example'),
  A2UiComponentGalleryExample: () => import('./A2UiComponentGalleryExample'),
  A2UiContactCardExample: () => import('./A2UiContactCardExample'),
  A2UiRestaurantExample: () => import('./A2UiRestaurantExample'),
  A2UiViewerExample: () => import('./A2UiViewerExample'),
  AgUiAgenticExample: () => import('./AgUiAgenticExample'),
  AgUiBackendToolRenderingExample: () =>
    import('./AgUiBackendToolRenderingExample'),
  AgUiHaikuGenUiExample: () => import('./AgUiHaikuGenUiExample'),
  AgUiHumanInTheLoopExample: () => import('./AgUiHumanInTheLoopExample'),
  AgUiSharedStateExample: () => import('./AgUiSharedStateExample'),
  AgUiToolsBasedGenUiExample: () => import('./AgUiToolsBasedGenUiExample'),
  AgentLocalExample: () => import('./AgentLocalExample'),
  CellSimpleExample: () => import('./CellSimpleExample'),
  ChatCustomExample: () => import('./ChatCustomExample'),
  ChatExample: () => import('./ChatExample'),
  ChatStandaloneExample: () => import('./ChatStandaloneExample'),
  CopilotKitLexicalExample: () => import('./CopilotKitLexicalExample'),
  CopilotKitNotebookExample: () => import('./CopilotKitNotebookExample'),
  DatalayerNotebookExample: () => import('./DatalayerNotebookExample'),
  AgentCheckpointsExample: () => import('./AgentCheckpointsExample'),
  AgentCodemodeExample: () => import('./AgentCodemodeExample'),
  AgentEvalsExample: () => import('./AgentEvalsExample'),
  AgentGuardrailsExample: () => import('./AgentGuardrailsExample'),
  AgentToolApprovalsExample: () => import('./AgentToolApprovalsExample'),
  AgentMemoryExample: () => import('./AgentMemoryExample'),
  AgentOtelExample: () => import('./AgentOtelExample'),
  AgentMonitoringExample: () => import('./AgentMonitoringExample'),
  AgentNotificationsExample: () => import('./AgentNotificationsExample'),
  AgentOutputsExample: () => import('./AgentOutputsExample'),
  AgentTriggersExample: () => import('./AgentTriggersExample'),
  LexicalExample: () => import('./LexicalExample'),
  LexicalSidebarExample: () => import('./LexicalSidebarExample'),
  NotebookExample: () => import('./NotebookExample'),
  NotebookSidebarExample: () => import('./NotebookSidebarExample'),
  NotebookSimpleExample: () => import('./NotebookSimpleExample'),
};

/**
 * Get the list of available example names
 */
export function getExampleNames(): string[] {
  return Object.keys(EXAMPLES);
}

/**
 * Get the selected example based on environment variable
 * Falls back to 'NotebookExample' if not specified or invalid
 */
export function getSelectedExample(): () => Promise<{
  default: React.ComponentType;
}> {
  // import.meta.env.EXAMPLE is defined in vite config
  const exampleName = (import.meta.env.EXAMPLE as string) || 'NotebookExample';

  if (!EXAMPLES[exampleName]) {
    console.warn(
      `Example "${exampleName}" not found. Available examples:`,
      getExampleNames(),
    );
    return EXAMPLES['NotebookExample'];
  }

  return EXAMPLES[exampleName];
}

/**
 * Get the selected example name
 */
export function getSelectedExampleName(): string {
  // import.meta.env.EXAMPLE is defined in vite config
  const exampleName = (import.meta.env.EXAMPLE as string) || 'NotebookExample';
  return EXAMPLES[exampleName] ? exampleName : 'NotebookExample';
}
