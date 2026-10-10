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
  [/\bA2 A\b/g, 'A2A'],
  [/\bPap\b/g, 'PAP'],
  [/\bCopilot Kit\b/g, 'CopilotKit'],
  [/\bGen Ui\b/g, 'Gen UI'],
  [/\bM C P\b/g, 'MCP'],
  [/\bOtel\b/g, 'OTEL'],
  [/\bAgentspecs\b/g, 'Agent Specifications'],
  // The document editor is Lexical underneath; the examples are about the
  // document.
  [/\bLexical\b/g, 'Document'],
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
  if (id.startsWith('AgentA2A')) tags.add('a2a');
  if (id.startsWith('Pap')) tags.add('pap');
  if (id.includes('Notebook')) tags.add('notebook');
  if (id.includes('Lexical') || id.includes('Document')) tags.add('document');
  if (id.includes('Chat')) tags.add('chat');
  if (id.startsWith('Assistant')) tags.add('assistant');
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
    'A2UI Agent with built-in chat component and Python A2UI UI plugin surface.',
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
    'NotebookPageAgent',
    () => import('./NotebookPageAgent'),
    'A notebook as a page: floating prompt on top, a team of agents working in it.',
  ),
  makeEntry(
    'DocumentPageAgent',
    () => import('./DocumentPageAgent'),
    'A document as a page: floating prompt on top, an agent writing in it.',
  ),
  makeEntry(
    'DecksAgent',
    () => import('./DecksAgent'),
    'A deck beside the chat: the decks plugin in a Loop, and an agent that writes presentations as data.',
  ),
  makeEntry(
    'CellExample',
    () => import('./CellExample'),
    'Simple cell example.',
  ),
  makeEntry(
    'AssistantExample',
    () => import('./AssistantExample'),
    'The floating assistant: the chat as a character on the page.',
  ),
  makeEntry(
    'VoiceChatExample',
    () => import('./VoiceChatExample'),
    'A voice chat with the floating assistant: push-to-talk heard in the page, answers read aloud by the speech service, the mouth moving with the sound.',
  ),
  makeEntry(
    'AssistantGalleryExample',
    () => import('./AssistantGalleryExample'),
    'Every representation of the floating assistant: each character in each state, its balloon, light and dark, still or moving, one at a time or as a grid.',
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
    'CopilotKit integration with the document editor.',
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
    'AgentDecideExample',
    () => import('./AgentDecideExample'),
    'Decide: typed decisions asked of Jev — yes or no, a choice, a score — from the chat, where the agent calls decide, and from the floating assistant’s Ask a decision.',
    ['example', 'agent', 'loop', 'app', 'decisions', 'jev', 'assistant'],
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
    'LoopAppComputerExample',
    () => import('./LoopAppComputerExample'),
    'An application beside its computer: what its agent ran on its sandbox, its files, and Take over and Hand back (LOOP R-23).',
    ['example', 'loop', 'app', 'computer', 'sandbox', 'owns-sandbox-control'],
  ),
  makeEntry(
    'ScenesExample',
    () => import('./ScenesExample'),
    'The scenes of the catalogue in tabs — Sales & Accounting, Month-end Close, Crop Monitoring, Disaster Assessment — each its graph and transcript, its cues as suggestions, played against the local servers (LOOP A-15).',
    ['example', 'loop', 'scenes', 'a2a', 'agentspecs', 'team'],
  ),
  makeEntry(
    'LoopShellExample',
    () => import('./LoopShellExample'),
    'The Loop shell at its most naked: a blank canvas, a floating draggable prompt, and an editor selector in the corner — none, notebook or document.',
    // `owns-sandbox-control`: the shell is pinned to the browser sandbox, so
    // the page's selector would offer three targets it cannot move to.
    ['example', 'loop', 'shell', 'prompt', 'editors', 'owns-sandbox-control'],
  ),
  makeEntry(
    'LoopStrategyExample',
    () => import('./LoopStrategyExample'),
    'Define and launch an agent reasoning strategy (a control loop: observe/think/act/evaluate) over a live notebook, driven by generic strategy specs.',
    ['example', 'agent', 'strategy', 'notebook', 'agentspecs'],
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
    'AgentA2AExample',
    () => import('./AgentA2AExample'),
    'Delegation to separate agents over the A2A protocol, launched locally or on Datalayer runtimes.',
  ),
  makeEntry(
    'AgentA2ATeamExample',
    () => import('./AgentA2ATeamExample'),
    'Two applications as a team over A2A: Sales in the browser (@a2a-js/sdk) asks Accounting on a runtime (fasta2a, Odoo read only), each an Office Assistant character.',
  ),
  makeEntry(
    'PapCompanyDiscoveryExample',
    () => import('./PapCompanyDiscoveryExample'),
    'Validate a PAP company document and reduce it to the public capabilities safe for an agent or UI.',
  ),
  makeEntry(
    'PapAgentIdentityExample',
    () => import('./PapAgentIdentityExample'),
    'Verify personal-agent client metadata and signing policy without exposing JWK coordinates.',
  ),
  makeEntry(
    'PapAuthorizationBoundaryExample',
    () => import('./PapAuthorizationBoundaryExample'),
    'Generate real Session and Direct Sign-In security material while showing only safe policy status.',
  ),
  makeEntry(
    'PapDpopProofExample',
    () => import('./PapDpopProofExample'),
    'Create fresh request-bound DPoP proofs while withholding proof, token, nonce, identifiers, and key material.',
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
    'Document agent integration example.',
  ),
  makeEntry(
    'LexicalAgentSidebarExample',
    () => import('./LexicalAgentSidebarExample'),
    'Document agent with sidebar orchestration example.',
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
