/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The LOOP workspace: contracts, shell, and the plugins that come with it.
 *
 * A host embeds the workspace through this surface — never by deep import — so
 * what is public is a decision rather than an accident of file layout (§3.5).
 *
 * @module loop
 */

// The contracts. A plugin depends on these and on the reactor, never on the shell.
export {
  LoopCommand,
  LoopDocumentToolbar,
  LoopMention,
  LoopNotebookToolbar,
  LoopSlots,
  LoopViewType,
  canOpenView,
  createPromptChannel,
  parseCommand,
  type CommandArgSpec,
  type CommandContribution,
  type CommandResult,
  type EditorToolbarContext,
  type EditorToolbarContribution,
  type LoopCommandContext,
  type LoopViewProps,
  type LoopWorkspaceContext,
  type MentionCandidate,
  type MentionContribution,
  type PromptChannel,
  type SandboxSnapshot,
  type SandboxState,
  type ViewControls,
  type ViewTypeContribution,
  useLoopPromptStore,
  suggestLoopPrompt,
  focusPrompt,
  onPromptFocusRequest,
  type LoopPromptState,
  type SuggestedPrompt,
} from './core';
export { useEditorToolbar } from './core/toolbar';

// The shell.
export {
  LoopWorkspace,
  PluginToggles,
  ViewSwitcher,
  WorkspaceFullScreenAction,
  buildLoopReactor,
  useWorkspaceFullScreen,
  type LoopWorkspaceProps,
  type PluginTogglesProps,
  type ViewSwitcherProps,
} from './shell';

// The plugins that ship with it.
export { A2uiPlugin, A2UI_PLUGIN_NAME } from './plugins/a2ui';
export { AgentspecsPlugin, AGENTSPECS_PLUGIN_NAME } from './plugins/agentspecs';
export {
  ChatPlugin,
  CHAT_PLUGIN_NAME,
  type ChatPluginConfig,
} from './plugins/chat';
export {
  ChatHeaderPlugin,
  CHAT_HEADER_PLUGIN_NAME,
} from './plugins/chat-header';
export {
  InputPromptPlugin,
  INPUT_PROMPT_PLUGIN_NAME,
} from './plugins/input-prompt';
export { ChatViewPlugin, CHAT_VIEW_PLUGIN_NAME } from './plugins/chat-view';
export {
  NotebookViewPlugin,
  NOTEBOOK_VIEW_PLUGIN_NAME,
} from './plugins/notebook-view';
export {
  DocumentViewPlugin,
  DOCUMENT_VIEW_PLUGIN_NAME,
} from './plugins/document-view';
export {
  defineViewPlugin,
  type ViewPluginOptions,
} from './plugins/view-switch';
export {
  defineAgentCapacityPlugin,
  type AgentCapacityOptions,
} from './plugins/agent-capacity';
// The agent-capacity plugins: one folder per capacity, one line each.
export {
  AgentCheckpointsPlugin,
  AGENT_CHECKPOINTS_PLUGIN_NAME,
} from './plugins/agent-checkpoints';
export {
  AgentCodeSandboxPlugin,
  AGENT_CODE_SANDBOX_PLUGIN_NAME,
} from './plugins/agent-code-sandbox';
export {
  AgentCodemodePlugin,
  AgentNoCodemodePlugin,
  AGENT_CODEMODE_PLUGIN_NAME,
  AGENT_NO_CODEMODE_PLUGIN_NAME,
} from './plugins/agent-codemode';
export {
  AgentCompactionPlugin,
  AGENT_COMPACTION_PLUGIN_NAME,
} from './plugins/agent-compaction';
export {
  AgentEvalsPlugin,
  AGENT_EVALS_PLUGIN_NAME,
} from './plugins/agent-evals';
export {
  AgentGuardrailsPlugin,
  AGENT_GUARDRAILS_PLUGIN_NAME,
} from './plugins/agent-guardrails';
export {
  AgentHooksPlugin,
  AGENT_HOOKS_PLUGIN_NAME,
} from './plugins/agent-hooks';
export {
  AgentInferencePlugin,
  AGENT_INFERENCE_PLUGIN_NAME,
} from './plugins/agent-inference';
export { AgentMcpPlugin, AGENT_MCP_PLUGIN_NAME } from './plugins/agent-mcp';
export {
  AgentMemoryPlugin,
  AGENT_MEMORY_PLUGIN_NAME,
} from './plugins/agent-memory';
export {
  AgentMonitoringPlugin,
  AGENT_MONITORING_PLUGIN_NAME,
} from './plugins/agent-monitoring';
export {
  AgentNotificationsPlugin,
  AGENT_NOTIFICATIONS_PLUGIN_NAME,
} from './plugins/agent-notifications';
export { AgentOtelPlugin, AGENT_OTEL_PLUGIN_NAME } from './plugins/agent-otel';
export {
  AgentOutputsPlugin,
  AGENT_OUTPUTS_PLUGIN_NAME,
} from './plugins/agent-outputs';
export {
  AgentParametersPlugin,
  AGENT_PARAMETERS_PLUGIN_NAME,
} from './plugins/agent-parameters';
export {
  AgentSkillsPlugin,
  AGENT_SKILLS_PLUGIN_NAME,
} from './plugins/agent-skills';
export {
  AgentSubagentsPlugin,
  AGENT_SUBAGENTS_PLUGIN_NAME,
} from './plugins/agent-subagents';
export {
  AgentToolApprovalsPlugin,
  AGENT_TOOL_APPROVALS_PLUGIN_NAME,
} from './plugins/agent-tool-approvals';
export {
  AgentTriggersPlugin,
  AGENT_TRIGGERS_PLUGIN_NAME,
} from './plugins/agent-triggers';
export {
  SANDBOX_CAPACITIES,
  SandboxCapacityPlugins,
} from './plugins/agent-code-sandboxes';
export { AgentA2uiPlugin, AGENT_A2UI_PLUGIN_NAME } from './plugins/agent-a2ui';
export {
  AgentA2uiJupyterOutputPlugin,
  AGENT_A2UI_JUPYTER_OUTPUT_PLUGIN_NAME,
} from './plugins/agent-a2ui-jupyter-output';
export {
  defineA2uiScenePlugin,
  type A2uiSceneOptions,
} from './plugins/a2ui-scene';
export {
  GraphViewPlugin,
  GRAPH_PLUGIN_NAME,
  GRAPH_VIEW_TYPE,
} from './plugins/graph';
export {
  PluginsPanelPlugin,
  PLUGINS_PANEL_PLUGIN_NAME,
  PluginsPanel,
} from './plugins/plugins-panel';
export {
  AGENTS_PLUGIN_NAME,
  AgentsPlugin,
  SandboxSelector,
  browserSource,
  createBrowserSandboxService,
  createServerSandboxService,
  createSwitchableSandboxService,
  suppliedSource,
  useOptionalSandboxService,
  useSandboxService,
  type AgentsConfig,
  type AgentsOutput,
  type SandboxExecution,
  type SandboxService,
  type SandboxTarget,
  type ServiceManagerSource,
  type SwitchableSandboxService,
} from './plugins/agents';
export { DocumentPlugin, DOCUMENT_PLUGIN_NAME } from './plugins/document';
export {
  DocumentToolbarPlugin,
  DOCUMENT_TOOLBAR_PLUGIN_NAME,
} from './plugins/document-toolbar';
export {
  ShellPlugin,
  EditorSelector,
  SHELL_PLUGIN_NAME,
  NONE_EDITOR,
  chooseEditor,
  // The names this plugin outgrew, kept so nothing breaks in the same step.
  EditorsPlugin,
  EDITORS_PLUGIN_NAME,
  type ShellPluginConfig,
} from './plugins/shell';
export { ModelsPlugin, MODELS_PLUGIN_NAME } from './plugins/models';
export { NotebookPlugin, NOTEBOOK_PLUGIN_NAME } from './plugins/notebook';
export {
  NotebookToolbarPlugin,
  NOTEBOOK_TOOLBAR_PLUGIN_NAME,
} from './plugins/notebook-toolbar';

// The window a page puts around Loop, and the slots that make its title bar
// extensible.
export {
  WindowFrame,
  WindowFramePlugin,
  WINDOW_ACTIONS_SLOT,
  WINDOW_CONTROLS_SLOT,
  WINDOW_FRAME_PLUGIN_NAME,
  type WindowFrameProps,
} from './plugins/window-frame';
export { LoopCommandsPlugin, COMMANDS_PLUGIN_NAME } from './plugins/commands';
export { PromptPlugin, PROMPT_PLUGIN_NAME } from './plugins/prompt';
// Loop, ready to drop into somebody else's page.
export { LoopEmbed, type LoopEmbedProps } from './embed/LoopEmbed';

// The set a workspace normally has, so a host starts from a working Loop
// rather than assembling one — and never from the example.
export { loopPlugins, type LoopPresetOptions } from './presets';

// The extensions that group them, for hosts that would rather install a
// capability than assemble one.
export { DocumentExtension, NotebookExtension } from './extensions';
