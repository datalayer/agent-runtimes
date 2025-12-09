/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Registry of available examples with dynamic imports.
 * Add new examples here to make them available in the example runner.
 */
export const EXAMPLES: Record<
  string,
  () => Promise<{ default: React.ComponentType }>
> = {
  CellExample: () => import('./CellExample'),
  ChatExample: () => import('./ChatExample'),
  DatalayerNotebookExample: () => import('./DatalayerNotebookExample'),
  NotebookExample: () => import('./NotebookExample'),
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
