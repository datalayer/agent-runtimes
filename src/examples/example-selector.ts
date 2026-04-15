/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

export type ExampleLoader = () => Promise<{ default: React.ComponentType }>;

export interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  loader: ExampleLoader;
}

function humanizeExampleName(name: string): string {
  return name
    .replace(/Example$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s+/, '')
    .trim();
}

function inferTags(id: string): string[] {
  const tags = new Set<string>(['example']);
  if (id.startsWith('Agent')) tags.add('agent');
  if (id.startsWith('AgUi')) tags.add('ag-ui');
  if (id.startsWith('A2Ui')) tags.add('a2ui');
  if (id.includes('Notebook')) tags.add('notebook');
  if (id.includes('Lexical')) tags.add('lexical');
  if (id.includes('Chat')) tags.add('chat');
  if (id.includes('Sandbox')) tags.add('sandbox');
  if (id.includes('Monitoring') || id.includes('Otel'))
    tags.add('observability');
  if (id.includes('Skills')) tags.add('skills');
  if (id.includes('MCP')) tags.add('mcp');
  return Array.from(tags);
}

function makeEntry(
  id: string,
  loader: ExampleLoader,
  description: string,
  tags?: string[],
): ExampleEntry {
  return {
    id,
    title: humanizeExampleName(id),
    description,
    tags: tags ?? inferTags(id),
    loader,
  };
}

/**
 * Central examples registry. Keep all example definitions in this list so
 * the header dropdown and the home cards always stay in sync.
 */
export const EXAMPLE_ENTRIES: ExampleEntry[] = [
  makeEntry(
    'HomeExample',
    () => import('./HomeExample'),
    'Browse all available examples with search and quick navigation.',
    ['home', 'navigation'],
  ),
  makeEntry(
    'A2UiComponentGalleryExample',
    () => import('./A2UiComponentGalleryExample'),
    'Gallery showcasing A2UI component patterns.',
  ),
  makeEntry(
    'A2UiContactCardExample',
    () => import('./A2UiContactCardExample'),
    'A2UI example rendering contact card interactions.',
  ),
  makeEntry(
    'A2UiRestaurantExample',
    () => import('./A2UiRestaurantExample'),
    'A2UI restaurant flow example.',
  ),
  makeEntry(
    'A2UiViewerExample',
    () => import('./A2UiViewerExample'),
    'A2UI viewer integration example.',
  ),
  makeEntry(
    'AgUiAgenticExample',
    () => import('./AgUiAgenticExample'),
    'AG-UI agentic workflow example.',
  ),
  makeEntry(
    'AgUiBackendToolRenderingExample',
    () => import('./AgUiBackendToolRenderingExample'),
    'AG-UI backend tool rendering example.',
  ),
  makeEntry(
    'AgUiHaikuGenUiExample',
    () => import('./AgUiHaikuGenUiExample'),
    'AG-UI generative UI Haiku example.',
  ),
  makeEntry(
    'AgUiHumanInTheLoopExample',
    () => import('./AgUiHumanInTheLoopExample'),
    'AG-UI human-in-the-loop approvals example.',
  ),
  makeEntry(
    'AgUiSharedStateExample',
    () => import('./AgUiSharedStateExample'),
    'AG-UI shared state synchronization example.',
  ),
  makeEntry(
    'AgUiToolsBasedGenUiExample',
    () => import('./AgUiToolsBasedGenUiExample'),
    'AG-UI tool-based generative UI example.',
  ),
  makeEntry(
    'AgentSpecExample',
    () => import('./AgentSpecExample'),
    'Configure and run agents from specs and transports.',
  ),
  makeEntry(
    'CellSimpleExample',
    () => import('./CellSimpleExample'),
    'Simple Jupyter cell integration example.',
  ),
  makeEntry(
    'ChatCustomExample',
    () => import('./ChatCustomExample'),
    'Custom chat experience composition example.',
  ),
  makeEntry(
    'ChatExample',
    () => import('./ChatExample'),
    'Baseline chat integration example.',
  ),
  makeEntry(
    'ChatStandaloneExample',
    () => import('./ChatStandaloneExample'),
    'Standalone chat component usage example.',
  ),
  makeEntry(
    'CopilotKitLexicalExample',
    () => import('./CopilotKitLexicalExample'),
    'CopilotKit integration with Lexical editor.',
  ),
  makeEntry(
    'CopilotKitNotebookExample',
    () => import('./CopilotKitNotebookExample'),
    'CopilotKit integration with notebook workflows.',
  ),
  makeEntry(
    'DatalayerNotebookExample',
    () => import('./DatalayerNotebookExample'),
    'Datalayer notebook runtime integration example.',
  ),
  makeEntry(
    'AgentCheckpointsExample',
    () => import('./AgentCheckpointsExample'),
    'Checkpoint and resume lifecycle for agents.',
  ),
  makeEntry(
    'AgentCodemodeExample',
    () => import('./AgentCodemodeExample'),
    'Code mode execution and tool orchestration example.',
  ),
  makeEntry(
    'AgentEvalsExample',
    () => import('./AgentEvalsExample'),
    'Evaluation workflows for agent outputs.',
  ),
  makeEntry(
    'AgentGuardrailsExample',
    () => import('./AgentGuardrailsExample'),
    'Guardrails and safety checks for agent runs.',
  ),
  makeEntry(
    'AgentToolApprovalsExample',
    () => import('./AgentToolApprovalsExample'),
    'Tool approval workflows and manual decisions.',
  ),
  makeEntry(
    'AgentMemoryExample',
    () => import('./AgentMemoryExample'),
    'Memory-aware conversation and retrieval example.',
  ),
  makeEntry(
    'AgentSkillsExample',
    () => import('./AgentSkillsExample'),
    'Skills discovery, execution, and monitoring example.',
  ),
  makeEntry(
    'AgentMCPExample',
    () => import('./AgentMCPExample'),
    'MCP servers and toolset integration example.',
  ),
  makeEntry(
    'AgentOtelExample',
    () => import('./AgentOtelExample'),
    'OpenTelemetry instrumentation and traces example.',
  ),
  makeEntry(
    'AgentSandboxExample',
    () => import('./AgentSandboxExample'),
    'Sandbox execution variants and context controls.',
  ),
  makeEntry(
    'AgentMonitoringExample',
    () => import('./AgentMonitoringExample'),
    'Runtime monitoring and live metrics example.',
  ),
  makeEntry(
    'AgentNotificationsExample',
    () => import('./AgentNotificationsExample'),
    'Notifications and event routing example.',
  ),
  makeEntry(
    'AgentOutputsExample',
    () => import('./AgentOutputsExample'),
    'Structured outputs and rendering patterns.',
  ),
  makeEntry(
    'AgentTriggersExample',
    () => import('./AgentTriggersExample'),
    'Scheduled and one-shot trigger flows.',
  ),
  makeEntry(
    'LexicalExample',
    () => import('./LexicalExample'),
    'Lexical document integration example.',
  ),
  makeEntry(
    'LexicalSidebarExample',
    () => import('./LexicalSidebarExample'),
    'Lexical with sidebar orchestration example.',
  ),
  makeEntry(
    'NotebookExample',
    () => import('./NotebookExample'),
    'Notebook orchestration and runtime example.',
  ),
  makeEntry(
    'NotebookSidebarExample',
    () => import('./NotebookSidebarExample'),
    'Notebook plus sidebar controls example.',
  ),
  makeEntry(
    'NotebookSimpleExample',
    () => import('./NotebookSimpleExample'),
    'Minimal notebook integration example.',
  ),
];

/**
 * Registry of available examples with dynamic imports.
 */
export const EXAMPLES: Record<string, ExampleLoader> = Object.fromEntries(
  EXAMPLE_ENTRIES.map(entry => [entry.id, entry.loader]),
) as Record<string, ExampleLoader>;

/**
 * Get the list of available example names
 */
export function getExampleNames(): string[] {
  return EXAMPLE_ENTRIES.map(entry => entry.id);
}

export function getExampleEntries(): ExampleEntry[] {
  return [...EXAMPLE_ENTRIES];
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
