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
  A2UiRestaurantExample: () => import('./A2UiRestaurantExample'),
  AgUiAgenticExample: () => import('./AgUiAgenticExample'),
  AgUiBackendToolRenderingExample: () =>
    import('./AgUiBackendToolRenderingExample'),
  AgUiHaikuGenUIExample: () => import('./AgUiHaikuGenUIExample'),
  AgUiHumanInTheLoopExample: () => import('./AgUiHumanInTheLoopExample'),
  AgUiSharedStateExample: () => import('./AgUiSharedStateExample'),
  AgUiToolsBasedGenUIExample: () => import('./AgUiToolsBasedGenUIExample'),
  AgentRuntimeCustomExample: () => import('./AgentRuntimeCustomExample'),
  AgentCodemodeMcpExample: () => import('./AgentCodemodeMcpExample'),
  AgentSpaceFormExample: () => import('./AgentSpaceFormExample'),
  AgentSpaceHomeExample: () => import('./AgentSpaceHomeExample'),
  AgentRuntimeLexicalSidebarExample: () =>
    import('./AgentRuntimeLexicalSidebarExample'),
  AgentRuntimeNotebookExample: () => import('./AgentRuntimeNotebookExample'),
  AgentRuntimeNotebookSidebarExample: () =>
    import('./AgentRuntimeNotebookSidebarExample'),
  AgentRuntimeLexicalExample: () => import('./AgentRuntimeLexicalExample'),
  //  AgentRuntimeLexical2Example: () =>
  //    import('./AgentRuntimeLexical2Example'),
  AgentRuntimeStandaloneExample: () =>
    import('./AgentRuntimeStandaloneExample'),
  CopilotKitNotebookExample: () => import('./CopilotKitNotebookExample'),
  CopilotKitLexicalExample: () => import('./CopilotKitLexicalExample'),
  DatalayerNotebookExample: () => import('./DatalayerNotebookExample'),
  JupyterCellExample: () => import('./JupyterCellExample'),
  JupyterNotebookExample: () => import('./JupyterNotebookExample'),
  //  VercelAiElementsExample: () =>
  //    import('./vercel-ai-elements/VercelAiElementsShowcase'),
};

/**
 * Get the list of available example names
 */
export function getExampleNames(): string[] {
  return Object.keys(EXAMPLES);
}

/**
 * Get the selected example based on environment variable
 * Falls back to 'JupyterNotebookExample' if not specified or invalid
 */
export function getSelectedExample(): () => Promise<{
  default: React.ComponentType;
}> {
  // import.meta.env.EXAMPLE is defined in vite config
  const exampleName =
    (import.meta.env.EXAMPLE as string) || 'JupyterNotebookExample';

  if (!EXAMPLES[exampleName]) {
    console.warn(
      `Example "${exampleName}" not found. Available examples:`,
      getExampleNames(),
    );
    return EXAMPLES['JupyterNotebookExample'];
  }

  return EXAMPLES[exampleName];
}

/**
 * Get the selected example name
 */
export function getSelectedExampleName(): string {
  // import.meta.env.EXAMPLE is defined in vite config
  const exampleName =
    (import.meta.env.EXAMPLE as string) || 'JupyterNotebookExample';
  return EXAMPLES[exampleName] ? exampleName : 'JupyterNotebookExample';
}
