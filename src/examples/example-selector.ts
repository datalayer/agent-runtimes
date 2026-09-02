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

const DISPLAY_NAME_EXCEPTIONS: [RegExp, string][] = [
  [/\bAg Ui\b/g, 'AG-UI'],
  [/\bA2 Ui\b/g, 'A2UI'],
  [/\bCopilot Kit\b/g, 'CopilotKit'],
  [/\bGen Ui\b/g, 'Gen UI'],
  [/\bM C P\b/g, 'MCP'],
  [/\bOtel\b/g, 'OTEL'],
  [/\bAgentspecs\b/g, 'Agent Specifications'],
];

function humanizeExampleName(name: string): string {
  let result = name
    .replace(/Example$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s+/, '')
    .trim();
  for (const [pattern, replacement] of DISPLAY_NAME_EXCEPTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
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
  if (id.includes('Subagent')) tags.add('subagents');
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
    'A2UiComponentsGalleryExample',
    () => import('./A2UiComponentsGalleryExample'),
    'Consolidated A2UI components gallery with Primer-themed color modes.',
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
    'A2UiJupyterOutputExample',
    () => import('./A2UiJupyterOutputExample'),
    'One Jupyter execution shown twice: raw kernel outputs, and the A2UI surface the server converter makes of them.',
  ),
  makeEntry(
    'A2UiAgentExample',
    () => import('./A2UiAgentExample'),
    'A2UI Agent with built-in chat component and Python A2UI extension surface.',
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
    'AgentspecsExample',
    () => import('./AgentspecsExample'),
    'Configure and run agents from specs and transports.',
  ),
  makeEntry(
    'CellExample',
    () => import('./CellExample'),
    'Simple cell example.',
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
    'AgentCheckpointsExample',
    () => import('./AgentCheckpointsExample'),
    'Checkpoint and resume lifecycle for agents.',
  ),
  makeEntry(
    'AgentCompactionExample',
    () => import('./AgentCompactionExample'),
    'Set a context token budget and watch history compaction summarize older messages, with live from/to token and timing details.',
    ['example', 'agent', 'compaction', 'context', 'tokens'],
  ),
  makeEntry(
    'AgentCodemodeExample',
    () => import('./AgentCodemodeExample'),
    'Code mode execution and tool orchestration example.',
  ),
  makeEntry(
    'AgentCodeSandboxesExample',
    () => import('./AgentCodeSandboxesExample'),
    'Launch sandbox-variant agent specs and compare code execution across backends.',
    ['example', 'agent', 'sandbox', 'codemode'],
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
    'AgentHooksExample',
    () => import('./AgentHooksExample'),
    'Pre-hooks and post-hooks lifecycle execution example.',
  ),
  makeEntry(
    'AgentInferenceProviderExample',
    () => import('./AgentInferenceProviderExample'),
    'Switch local and datalayer inference providers with live low-level provider events.',
    ['example', 'agent', 'inference', 'provider', 'runtime'],
  ),
  makeEntry(
    'LoopWorkspaceExample',
    () => import('./LoopWorkspaceExample'),
    'The LOOP workspace: a blank shell, with the chat, the editors and the plugin list all contributed as plugins.',
    // `owns-sandbox-control`: this example brings its own sandbox switch, so
    // the shell hides the one in its header rather than showing two controls
    // for one sandbox — and a second one that would not agree with the first.
    ['example', 'loop', 'workspace', 'sandbox', 'owns-sandbox-control'],
  ),
  makeEntry(
    'LoopShellExample',
    () => import('./LoopShellExample'),
    'The Loop shell at its most naked: a blank canvas, a floating draggable prompt, and an editor selector in the corner — none, notebook or document.',
    ['example', 'loop', 'shell', 'prompt', 'editors'],
  ),
  makeEntry(
    'AgentLoopExample',
    () => import('./AgentLoopExample'),
    'Define and launch an agent execution loop (observe/think/act/evaluate) over a live notebook, driven by generic loop specs.',
    ['example', 'agent', 'loop', 'notebook', 'agentspecs'],
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
    'AgentCodeSandboxExample',
    () => import('./AgentCodeSandboxExample'),
    'Sandbox execution variants and context controls.',
  ),
  makeEntry(
    'AgentMonitoringExample',
    () => import('./AgentMonitoringExample'),
    'Runtime monitoring and live metrics example.',
  ),
  makeEntry(
    'AgentSubagentsExample',
    () => import('./AgentSubagentsExample'),
    'Multi-agent delegation with the in-repo subagents capability.',
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
    'AgentParametersExample',
    () => import('./AgentParametersExample'),
    'Launch-time parameterized agent creation with JSON schema.',
  ),
  makeEntry(
    'AgentTriggersExample',
    () => import('./AgentTriggersExample'),
    'Scheduled and one-shot trigger flows.',
  ),
  makeEntry(
    'LexicalAgentExample',
    () => import('./LexicalAgentExample'),
    'Lexical document integration example.',
  ),
  makeEntry(
    'LexicalAgentSidebarExample',
    () => import('./LexicalAgentSidebarExample'),
    'Lexical with sidebar orchestration example.',
  ),
  makeEntry(
    'NotebookAgentExample',
    () => import('./NotebookAgentExample'),
    'Notebook orchestration and runtime example.',
  ),
  makeEntry(
    'NotebookAgentSidebarExample',
    () => import('./NotebookAgentSidebarExample'),
    'Notebook plus sidebar controls example.',
  ),
  makeEntry(
    'NotebookExample',
    () => import('./NotebookExample'),
    'Minimal notebook integration example.',
  ),
  makeEntry(
    'NotebookCollaborationExample',
    () => import('./NotebookCollaborationExample'),
    'Notebook collaboration runtime integration example.',
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
