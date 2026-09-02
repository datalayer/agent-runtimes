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
  buildLoopReactor,
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
  EditorsPlugin,
  EditorSelector,
  EDITORS_PLUGIN_NAME,
  NONE_EDITOR,
  chooseEditor,
  type EditorsPluginConfig,
} from './plugins/editors';
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
