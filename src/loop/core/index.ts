/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-core` — the contracts, and nothing else.
 *
 * Everything the workspace can be extended with is declared here: the points
 * plugins contribute to, and the shapes they contribute. No React, no server
 * calls, no opinions about layout — a plugin depends on this and on the reactor,
 * never on the shell, so the shell can be replaced (a browser page, a JupyterLab
 * panel) without touching a single plugin.
 *
 * @module loop/core
 */

import { defineExtensionPoint } from '@datalayer/reactor';
import type { ComponentType } from 'react';

/** Lifecycle of the sandbox a workspace is attached to. */
export type SandboxState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

/** What the workspace knows about the sandbox behind it. */
export type SandboxSnapshot = {
  state: SandboxState;
  variant?: string;
  kernelId?: string;
  jupyterUrl?: string;
};

/**
 * What a view or a command is allowed to know about the session it runs in.
 *
 * Deliberately small: a plugin that needs more should get it from the plugin
 * that owns it (the sandbox service, the agent service), not from a context
 * object that grows to mean everything.
 */
export type LoopWorkspaceContext = {
  /** Base URL of the agent-runtimes server backing this session. */
  serverUrl: string;
  /** Agent spec bound to the session. */
  agentId: string;
  /** Conversation being continued, when there is one. */
  conversationId?: string;
  /** Active model id, as an agentspecs catalog id. */
  model?: string;
  /** The sandbox, as last reported. */
  sandbox: SandboxSnapshot;
  /** Which view is on screen. */
  activeViewType: string;
  /** Put another view on screen. */
  setActiveViewType: (viewType: string) => void;
};

/** Props every view receives. */
export type LoopViewProps = {
  viewType: string;
  workspace: LoopWorkspaceContext;
};

/** A view the workspace may open. */
export type ViewTypeContribution = {
  /** Stable id: 'chat' | 'notebook' | 'document' | 'sandbox' | 'a2ui'. */
  viewType: string;
  title: string;
  /** Drawn beside the title in the switcher. Any component: an octicon,
   *  a Datalayer icon, or something a plugin brings itself. */
  icon?: ComponentType<any>;
  /** Ordering in the view switcher. Lower is earlier. */
  order?: number;
  /**
   * Whether the view can be opened right now, judged against the live
   * workspace. A notebook says "only with a running sandbox"; the reactor
   * holds no opinion about it, and neither does the switcher.
   */
  canOpen?: (workspace: LoopWorkspaceContext) => boolean;
  /**
   * Why it cannot be opened, for a disabled tab's tooltip. A tab that is
   * greyed out with no explanation is worse than no tab.
   */
  unavailableReason?: (workspace: LoopWorkspaceContext) => string;
  /**
   * Lazy module. Non-negotiable: the document view pulls
   * `@datalayer/jupyter-lexical` and its Lumino side effects, and must not be
   * in the shell's bundle until someone opens it.
   */
  load: () => Promise<{ default: ComponentType<LoopViewProps> }>;
};

/** What a command run produces. */
export type CommandResult = {
  /** Rendered by the shell as a transient panel. */
  content?: unknown;
  /** Sent to the agent as if the user had typed it. */
  prompt?: string;
};

/** One argument of a command, for completion in either front-end. */
export type CommandArgSpec = {
  name: string;
  description?: string;
  required?: boolean;
  choices?: readonly string[] | (() => readonly string[] | Promise<readonly string[]>);
};

/** What a command is given when it runs. */
export type LoopCommandContext = {
  workspace: LoopWorkspaceContext;
  /** The raw text after the command name. */
  argv: string;
};

/**
 * A slash command. Mirrored one-for-one by `SlashCommandSpec` in Python, so a
 * command is described the same way in the terminal and here even when the two
 * implementations differ — a Rich panel there, a React panel here.
 */
export type CommandContribution = {
  name: string;
  aliases?: readonly string[];
  description: string;
  /** Grouping in `/help`. */
  group?: string;
  args?: readonly CommandArgSpec[];
  run: (ctx: LoopCommandContext) => Promise<CommandResult | void>;
};

/** A candidate offered by an `@` namespace. */
export type MentionCandidate = {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
};

/** What a resolved mention adds to the turn. */
export type MentionBinding = {
  /** Text substituted into the prompt. */
  text: string;
  /** Anything the shell should attach to the turn (a delegate, context). */
  payload?: unknown;
};

/** An `@` namespace: `@agent` first, `@file` and `@cell` later. */
export type MentionContribution = {
  namespace: string;
  trigger?: string;
  list: (
    workspace: LoopWorkspaceContext,
    query: string,
  ) => Promise<readonly MentionCandidate[]>;
  resolve: (
    workspace: LoopWorkspaceContext,
    id: string,
  ) => Promise<MentionBinding>;
};

/** Views the workspace may open. */
export const LoopViewType =
  defineExtensionPoint<ViewTypeContribution>('loop.viewType');

/** Slash commands, shared in shape with the CLI. */
export const LoopCommand =
  defineExtensionPoint<CommandContribution>('loop.command');

/** `@` namespaces. */
export const LoopMention =
  defineExtensionPoint<MentionContribution>('loop.mention');

/** Slot names the shell renders. Slots render everything; points choose one. */
export const LoopSlots = {
  /** Agent picker, model chip, status indicators. */
  header: 'loop.header',
  /** Buttons beside the prompt. */
  promptAction: 'loop.promptAction',
  /** Small status items under the prompt. */
  status: 'loop.status',
} as const;

/** Whether a view can be opened right now. */
export function canOpenView(
  contribution: ViewTypeContribution,
  workspace: LoopWorkspaceContext,
): boolean {
  return contribution.canOpen ? contribution.canOpen(workspace) : true;
}

/** Parse `/name rest` into its parts. Returns undefined when it is not a command. */
export function parseCommand(
  input: string,
): { name: string; argv: string } | undefined {
  const text = input.trimStart();
  if (!text.startsWith('/')) {
    return undefined;
  }
  const [head, ...rest] = text.slice(1).split(/\s+/);
  if (!head) {
    return undefined;
  }
  return { name: head.toLowerCase(), argv: rest.join(' ').trim() };
}
