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

import { defineContributionPoint, defineGate } from '@datalayer/reactor';
import type { ReadonlySignal } from '@datalayer/reactor';
import type { ComponentType } from 'react';
import type { ToolbarItem } from '@datalayer/primer-addons';

/** Lifecycle of the sandbox a workspace is attached to. */
export type SandboxState =
  'idle' | 'starting' | 'running' | 'stopping' | 'error';

/** What the workspace knows about the sandbox behind it. */
export type SandboxSnapshot = {
  state: SandboxState;
  variant?: string;
  kernelId?: string;
  jupyterUrl?: string;
  /**
   * The token that server wants, when it wants one.
   *
   * Carried beside the URL because the two are useless apart: a notebook
   * pointed at a tokened Jupyter server without its token is refused at the
   * first request, and the visible symptom is a cell that runs and produces
   * nothing rather than an error anybody can act on.
   */
  jupyterToken?: string;
  /**
   * Where it runs, as the sandbox plugin names it.
   *
   * Part of the snapshot rather than read from a signal, because this is the
   * path that already re-renders whoever is watching: the workspace holds the
   * snapshot in state, so a plugin asking "is there an agent here?" gets a
   * fresh answer when the target moves instead of a stale closure.
   */
  target?: string;
  /**
   * The agent-runtimes server backing this sandbox, when it is not the host's.
   *
   * A Datalayer runtime brings its own: the agent runs on the pod, not on the
   * server the workspace was opened against, so a chat addressed at
   * `workspace.serverUrl` would be talking to the wrong machine. Absent for
   * every other target, where the two are the same thing.
   */
  agentBaseUrl?: string;
};

/**
 * What a view reads while the sandbox plugin is absent.
 *
 * Every plugin that watches the sandbox has to call `useSignalValue`
 * unconditionally — the plugin can be switched off from the sidebar, and hook
 * order cannot depend on that — so each needs something signal-shaped to read
 * instead. They used to declare their own, and all four made the same mistake:
 * building the value inside `peek()`.
 *
 * `useSignalValue` is a `useSyncExternalStore`, so `peek()` *is* the snapshot
 * and React compares it by identity. A fresh object per call means the snapshot
 * never settles, and the page re-renders without bound — React says "the result
 * of getSnapshot should be cached", and then a nested-update overflow surfaces
 * wherever the fiftieth render happens to land, which is nowhere near here.
 *
 * So: one frozen value, read by every caller. Typed rather than cast, because
 * the `as never` the four copies used is exactly what let the wrong shape
 * through without a word from the compiler.
 */
export const IDLE_SANDBOX_SNAPSHOT: SandboxSnapshot = Object.freeze({
  state: 'idle',
});

/** {@link IDLE_SANDBOX_SNAPSHOT}, shaped as a signal to be read like one. */
export const IDLE_SANDBOX_SNAPSHOT_SIGNAL: ReadonlySignal<SandboxSnapshot> = {
  value: IDLE_SANDBOX_SNAPSHOT,
  peek: () => IDLE_SANDBOX_SNAPSHOT,
};

/**
 * The target read while the sandbox plugin is absent.
 *
 * Typed as `undefined` rather than `string | undefined` so that
 * `service?.target ?? IDLE_SANDBOX_TARGET_SIGNAL` keeps whatever the service
 * says a target is: widening it here would quietly turn every caller's
 * `SandboxTarget` into a bare string.
 */
export const IDLE_SANDBOX_TARGET_SIGNAL: ReadonlySignal<undefined> = {
  value: undefined,
  peek: () => undefined,
};

/**
 * The id the workspace's surfaces are known by.
 *
 * One expression in one place, because three things have to agree on it: the
 * notebook that renders, the document that renders, and the frontend tools an
 * in-page agent is given to reach them. A tool addressed to a different id than
 * the surface on screen edits nothing and reports success, which is the worst
 * way for this to be wrong.
 *
 * Keyed on the *session*, never on the agent. Keying it on the agent meant
 * every switch renamed the surface, and a renamed surface is a new one: the
 * notebook remounted empty, so changing who you were talking to silently threw
 * away the work you were talking about. The notebook belongs to the workspace;
 * the agent is only a visitor to it.
 */
export function loopSurfaceId(sessionId: string | undefined): string {
  return `loop-${sessionId || 'default'}`;
}

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
  /**
   * Point the session at a different agent.
   *
   * For whichever plugin offers the choice. It used to keep the new name in
   * its own state, which changed the label and nothing else: everything that
   * matters — the chat's endpoint, the sandbox connection, the notebook's id —
   * reads `agentId` from here, so a switch that does not reach this context is
   * a switch that did not happen.
   */
  setAgentId: (agentId: string) => void;
  /** Conversation being continued, when there is one. */
  conversationId?: string;
  /**
   * The id the notebook and the document on screen are addressed by.
   *
   * Fixed for the life of the workspace, so it survives an agent switch — see
   * `loopSurfaceId`. Read this rather than deriving one, or the tools an agent
   * is handed will address a surface nobody is looking at.
   */
  surfaceId: string;
  /** Active model id, as an agentspecs catalog id. */
  model?: string;
  /** The sandbox, as last reported. */
  sandbox: SandboxSnapshot;
  /**
   * For whichever plugin owns the sandbox to keep the workspace informed.
   *
   * The shell does not know which plugin that is — it just needs the value,
   * because `canOpen` gates are asked about the live workspace and a stale
   * snapshot would grey out a notebook that has a perfectly good kernel.
   */
  setSandbox: (sandbox: SandboxSnapshot) => void;
  /** Which view is on screen. */
  activeViewType: string;
  /** Put another view on screen. */
  setActiveViewType: (viewType: string) => void;
  /** Prompts typed by whoever renders the prompt, for whichever view answers. */
  prompts: PromptChannel;
  /**
   * Run what a person typed: a slash command when it is one, the prompt
   * channel otherwise.
   *
   * The prompt is not the shell's any more — the chat plugin renders it — but
   * dispatch still belongs to the workspace, which is the only thing that can
   * see every command every plugin contributed. A plugin rendering a prompt
   * calls this and shows whatever comes back.
   */
  submit: (message: string) => Promise<SubmitOutcome>;
  /** What the active view is doing, as it last reported. */
  viewControls: ViewControls;
  /** For a view to report itself. Pass `null` on unmount. */
  setViewControls: (controls: ViewControls | null) => void;
};

/**
 * How a prompt typed in the shell reaches whatever should answer it.
 *
 * The prompt belongs to the shell and the answer belongs to a view, so
 * something has to carry a message across without the shell knowing which
 * plugin is listening. A channel does that in both directions: the shell
 * publishes, a mounted view subscribes, and neither imports the other.
 */
export type PromptChannel = {
  /** Publish a prompt. Returns whether anything was listening. */
  submit: (message: string) => boolean;
  /** Listen for prompts. Returns an unsubscribe. */
  subscribe: (listener: (message: string) => void) => () => void;
};

/** Create a prompt channel. The shell owns one per workspace. */
export function createPromptChannel(): PromptChannel {
  const listeners = new Set<(message: string) => void>();
  return {
    submit(message: string) {
      if (listeners.size === 0) {
        return false;
      }
      for (const listener of [...listeners]) {
        listener(message);
      }
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * What the active view tells the shell about itself.
 *
 * The prompt lives in the shell but the work happens in a view, so the spinner
 * and the stop button would otherwise be in the wrong place: a chat streaming a
 * reply, a notebook running a cell and a sandbox starting up all need the same
 * two facts said the same way.
 */
export type ViewControls = {
  /** Whether the view is working on something. */
  busy?: boolean;
  /** How to stop it, when it can be stopped. */
  stop?: () => void;
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

/**
 * What running a typed message did.
 *
 * `handled` distinguishes the two silences: a command that ran and printed
 * nothing, and a prompt nobody was listening for. Only the second is worth
 * telling the person about.
 */
export type SubmitOutcome = {
  /** Whether anything took the message — a command, or a listening view. */
  handled: boolean;
  /** The command's name, when it was one. */
  command?: string;
  /** What the command returned, for the caller to render. */
  result?: CommandResult;
  /** Why it was not handled, in the person's terms. */
  reason?: string;
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
  choices?:
    readonly string[] | (() => readonly string[] | Promise<readonly string[]>);
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

/**
 * An editor the chat can host beside the conversation.
 *
 * A notebook and a document are not alternatives *to* the chat — they are what
 * the conversation is about, and a person reading a reply wants the cell it
 * just changed in view, not one tab away. So they are contributed to the chat
 * rather than to the workspace, and the chat decides where they sit.
 *
 * The shape is deliberately close to `ViewTypeContribution`: the same gating,
 * the same lazy `load`, so a plugin author who has written one has written the
 * other.
 */
export type ChatSurfaceContribution = {
  /** Stable id: 'notebook' | 'document'. */
  surfaceId: string;
  title: string;
  icon?: ComponentType<any>;
  /** Ordering in the chat's surface picker. Lower is earlier. */
  order?: number;
  /** Whether it can be opened right now, judged against the live workspace. */
  canOpen?: (workspace: LoopWorkspaceContext) => boolean;
  /** Why it cannot be, for the disabled control's tooltip. */
  unavailableReason?: (workspace: LoopWorkspaceContext) => string;
  /** Lazy module, for the same reason views are lazy. */
  load: () => Promise<{ default: ComponentType<ChatSurfaceProps> }>;
};

/** Props a chat surface receives. */
export type ChatSurfaceProps = {
  surfaceId: string;
  workspace: LoopWorkspaceContext;
};

/** Views the workspace may open. */
export const LoopViewType =
  defineContributionPoint<ViewTypeContribution>('loop.viewType');

/** Editors the chat hosts beside the conversation. */
export const LoopChatSurface =
  defineContributionPoint<ChatSurfaceContribution>('loop.chat.surface');

/**
 * Whether there is anything to chat with.
 *
 * A gate rather than an extension point of its own: `defineGate` is the
 * reactor's primitive for exactly this — one plugin asking the others whether
 * something may happen, and being told why not in words it can show. The chat
 * asks; the sandbox plugin answers, because only some of the places code runs
 * bring an agent with them. Neither imports the other.
 *
 * Nothing answering means allowed, so a workspace with no sandbox plugin has a
 * working chat.
 */
export const LoopAgentGate = defineGate<LoopWorkspaceContext>(
  'loop.agent.available',
);

/** @deprecated Use `LoopAgentGate`; chat is one consumer of agent availability. */
export const LoopChatGate = LoopAgentGate;

/**
 * What an editor hands a toolbar contributor.
 *
 * The workspace, so an item can submit a prompt or switch views, and the id of
 * the editor instance, so an item that reports on *this* editor — a kernel
 * light, a dirty marker — can find it. Deliberately not the editor's adapter:
 * a toolbar item that could reach inside the editor would couple every
 * contributor to the editor's internals, and the point of the split is that
 * they do not know each other.
 */
export type EditorToolbarContext = {
  workspace: LoopWorkspaceContext;
  /** The id of the editor this toolbar belongs to. */
  editorId: string;
};

/**
 * The toolbar of an editor, provided by a plugin.
 *
 * A contribution here does not decorate a toolbar — it *is* the toolbar. An
 * editor with nothing contributed to its toolbar point renders no toolbar at
 * all, which is the difference between a toolbar plugin and a plugin that adds
 * a button: switch this off and the bar goes, not just what was on it.
 *
 * `items` is what the providing plugin puts on its own toolbar. Everyone else
 * uses the item point below, so that "who owns the toolbar" and "who is
 * allowed to add to it" stay separate questions.
 */
export type EditorToolbarContribution = {
  items?: (context: EditorToolbarContext) => ToolbarItem[];
};

/**
 * Something a plugin adds to a toolbar another plugin provides.
 *
 * `items` is called during the editor's render and must be pure — build the
 * descriptors, do the work in `onClick` or inside a `render` component. It
 * returns a list rather than a single item so one plugin can contribute a
 * spacer and the thing after it as one indivisible unit.
 *
 * Nothing is rendered from here when no plugin provides the toolbar. That is
 * deliberate: a button with no bar to sit on has nowhere to go, and drawing
 * one anyway would make the toolbar plugin look optional when it is not.
 */
export type EditorToolbarItemContribution = {
  items: (context: EditorToolbarContext) => ToolbarItem[];
};

/**
 * The notebook editor's toolbar.
 *
 * Offered by the notebook plugin and filled by the notebook toolbar plugin.
 * The notebook names neither the toolbar nor anything on it.
 */
export const LoopNotebookToolbar =
  defineContributionPoint<EditorToolbarContribution>('loop.notebook.toolbar');

/**
 * What goes on the notebook's toolbar, once something provides one.
 *
 * Offered by the *toolbar* plugin, not by the editor: the bar is what accepts
 * buttons, so the plugin that owns the bar is the one that opens the point.
 * The chat puts its agent actions here.
 */
export const LoopNotebookToolbarItem =
  defineContributionPoint<EditorToolbarItemContribution>(
    'loop.notebook.toolbar.item',
  );

/** The document editor's toolbar. The same arrangement, for prose. */
export const LoopDocumentToolbar =
  defineContributionPoint<EditorToolbarContribution>('loop.document.toolbar');

/** What goes on the document's toolbar, once something provides one. */
export const LoopDocumentToolbarItem =
  defineContributionPoint<EditorToolbarItemContribution>(
    'loop.document.toolbar.item',
  );

/** Slash commands, shared in shape with the CLI. */
export const LoopCommand =
  defineContributionPoint<CommandContribution>('loop.command');

/** `@` namespaces. */
export const LoopMention =
  defineContributionPoint<MentionContribution>('loop.mention');

/** Slot names the shell renders. Slots render everything; points choose one. */
export const LoopSlots = {
  /** Agent picker, model chip, status indicators. */
  header: 'loop.header',
  /** Buttons beside the prompt. */
  promptAction: 'loop.promptAction',
  /**
   * The strip inside the prompt, above where the typing goes.
   *
   * Kept and rendered, and nothing contributes to it today: the controls that
   * decide what the next message does — agent, tools, skills, model — live in
   * the footer under the prompt, which already had three of the four. This is
   * for whatever wants to sit *in* the prompt rather than under it, and it
   * draws nothing while it is empty.
   */
  inpromptMenu: 'loop.inpromptMenu',
  /**
   * Under the view, above the status line.
   *
   * Where the chat plugin puts its prompt. A slot rather than a fixed place in
   * the shell, so a workspace mounted without a chat has nothing there instead
   * of an input box wired to nothing.
   */
  footer: 'loop.footer',
  /** Small status items under the prompt. */
  status: 'loop.status',
  /**
   * The trailing edge, beside the view: the plugin list, and anything else
   * that belongs next to the work rather than in front of it.
   *
   * A slot, so a workspace with no sidebar plugin has no sidebar at all — the
   * column is not drawn when nothing fills it.
   */
  sidebar: 'loop.sidebar',
} as const;

/** Whether a view or a chat surface can be opened right now. */
export function canOpenView(
  contribution: Pick<ViewTypeContribution, 'canOpen'>,
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

export {
  useLoopPromptStore,
  suggestLoopPrompt,
  type LoopPromptState,
  type SuggestedPrompt,
} from './promptStore';
