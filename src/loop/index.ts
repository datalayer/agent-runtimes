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
  LoopMention,
  LoopSlots,
  LoopViewType,
  canOpenView,
  createPromptChannel,
  parseCommand,
  type CommandArgSpec,
  type CommandContribution,
  type CommandResult,
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
} from './core';

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
export { A2uiExtension, A2UI_EXTENSION_NAME } from './plugins/a2ui';
export { AgentsExtension, AGENTS_EXTENSION_NAME } from './plugins/agents';
export { ChatExtension } from './plugins/chat';
export {
  CODE_SANDBOX_EXTENSION_NAME,
  CodeSandboxExtension,
  SandboxSelector,
  browserSource,
  createBrowserSandboxService,
  createServerSandboxService,
  createSwitchableSandboxService,
  suppliedSource,
  useOptionalSandboxService,
  useSandboxService,
  type CodeSandboxConfig,
  type CodeSandboxOutput,
  type SandboxExecution,
  type SandboxService,
  type SandboxTarget,
  type ServiceManagerSource,
  type SwitchableSandboxService,
} from './plugins/code-sandbox';
export { DocumentExtension, DOCUMENT_EXTENSION_NAME } from './plugins/document';
export { ModelsExtension, MODELS_EXTENSION_NAME } from './plugins/models';
export { NotebookExtension, NOTEBOOK_EXTENSION_NAME } from './plugins/notebook';
