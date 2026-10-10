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
  'Apps',
  'Assistant',
  'A2UI',
  'A2A',
  'Personal Agent Protocol',
  'AG-UI',
  'Chat',
  'Document',
  'Notebook',
  'Capabilities',
  'Cell',
  'CopilotKit',
] as const;

export const getExampleGroup = (id: string): string => {
  // The library of specs, the Loop shells, and the scenes of the catalogue
  // (LOOP A-15): the applications and what is staged with them.
  if (
    id === 'AgentspecsExample' ||
    id === 'ScenesExample' ||
    id.startsWith('Loop') ||
    id === 'DecksAgent'
  ) {
    return 'Apps';
  }
  if (id.startsWith('A2Ui')) return 'A2UI';
  // Agents reached over the A2A protocol: their own category, after A2UI.
  if (id.startsWith('AgentA2A')) return 'A2A';
  if (id.startsWith('Pap')) return 'Personal Agent Protocol';
  if (id.startsWith('AgUi')) return 'AG-UI';
  if (id.startsWith('CopilotKit')) return 'CopilotKit';
  // Each remaining Agent* example demonstrates one capability of the
  // runtime: checkpoints, hooks, memory, guardrails…
  if (id.startsWith('Agent')) return 'Capabilities';
  // The floating assistant, and its gallery: before the chat they wrap.
  if (id.startsWith('Assistant')) return 'Assistant';
  if (id.startsWith('Chat') || id === 'VoiceChatExample') return 'Chat';
  // The document examples: the ones on the Lexical editor, and the page
  // with a document on it.
  if (id.startsWith('Lexical') || id.startsWith('Document')) return 'Document';
  if (id.startsWith('Notebook')) return 'Notebook';
  return 'Cell';
};
