/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The examples' groups, in the menu's order, and the group of each example
 * by its id: a module of its own so the order can be tested without the
 * examples shell.
 *
 * @module examples/exampleGroups
 */

export const EXAMPLE_GROUP_ORDER = [
  'Loop',
  'Applications',
  'Avatar',
  'A2UI',
  'A2A',
  'Personal Agent Protocol',
  'Agent protocols',
  'Shield',
  'AG-UI',
  'Chat',
  'Document',
  'Notebook',
  'Capabilities',
  'Cell',
  'CopilotKit',
  'Navigation',
] as const;

export const getExampleGroup = (id: string): string => {
  // The Loop examples together, first (the user, 22 November 2026): the
  // shells, the workspace, an application beside its computer, the Loop
  // Application, the strategy.
  if (id.startsWith('Loop')) return 'Loop';
  // The library of specs, the scenes of the catalogue and the decks: what is
  // staged with the applications.
  if (
    id === 'AgentspecsExample' ||
    id === 'ScenesExample' ||
    id === 'DecksAgent'
  ) {
    return 'Applications';
  }
  if (id.startsWith('A2Ui')) return 'A2UI';
  // Agents reached over the A2A protocol: their own category, after A2UI.
  if (id.startsWith('AgentA2A')) return 'A2A';
  if (id.startsWith('Pap')) return 'Personal Agent Protocol';
  // The other agent protocols' examples: signed requests, commerce.
  if (id.startsWith('Protocol')) return 'Agent protocols';
  // The Shield: a coding agent behind it, and its policy.
  if (id.startsWith('Shield')) return 'Shield';
  if (id.startsWith('AgUi')) return 'AG-UI';
  if (id.startsWith('CopilotKit')) return 'CopilotKit';
  // Each remaining Agent* example demonstrates one capability of the
  // runtime: checkpoints, hooks, memory, guardrails…
  if (id.startsWith('Agent')) return 'Capabilities';
  // The floating assistant's avatar, and its gallery: before the chat they wrap.
  if (id.startsWith('Avatar')) return 'Avatar';
  if (id.startsWith('Chat') || id === 'VoiceChatExample') return 'Chat';
  // The document examples: the ones on the Lexical editor, and the page
  // with a document on it.
  if (id.startsWith('Lexical') || id.startsWith('Document')) return 'Document';
  if (id.startsWith('Notebook') || id === 'DatalayerNotebookExample')
    return 'Notebook';
  // Core's navigation hooks, with a router and without one.
  if (id === 'ReactRouterExample' || id === 'NativeNavigationExample')
    return 'Navigation';
  return 'Cell';
};
