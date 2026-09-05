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
import type { ComponentType, ReactNode } from 'react';
/* Type only, so the core carries no runtime dependency on jupyter-react: the
   indicator's vocabulary is shared, its implementation is not. */
import type { ExecutionState } from '@datalayer/jupyter-react/kernel-indicator';
import type { ToolbarItem } from '@datalayer/primer-addons';
import type { FrontendToolDefinition } from '../../types/tools';

/** Lifecycle of the sandbox a workspace is attached to. */
export type SandboxState =
  'idle' | 'starting' | 'running' | 'stopping' | 'error';

/** What the workspace knows about the sandbox behind it. */
export type SandboxSnapshot = {
  state: SandboxState;
  /**
   * Why, when the state is `error`.
   *
   * Carried because `error` on its own is the least useful thing a sandbox
   * can say: the indicator drew "connected-dead" with every field unknown,
   * which tells a reader that something is wrong and nothing about what.
   * Whoever sets the state knows the reason; this is where it travels.
   */
  errorReason?: string;
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
  /**
   * Whatever the host wants in the chat's title bar.
   *
   * The plugin road to the same place is `LoopSlots.chatHeader`, and it is the
   * better one for anything that belongs to a capability. This is for the host
   * that is embedding the workspace and has one button to add — a page that
   * mounts `LoopWorkspace` should not have to write a plugin to put an icon
   * next to the agent's name.
   *
   * Rendered before the chat's own controls, so the host's additions read as
   * part of the page and the chat's stay together at the trailing edge.
   */
  chatHeaderActions?: ReactNode;
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
  /** Start the view's work over — the chat resets its conversation. */
  newChat?: () => void;
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
  /**
   * A keystroke that runs it, written once for every platform.
   *
   * `'Mod+Alt+G'` is ⌘⌥G on a Mac and Ctrl+Alt+G elsewhere. Optional, and most
   * commands have none: a slash command is reached by typing its name, and a
   * shortcut is worth spending only on the few things somebody does often.
   *
   * Bound by whichever surface owns the keyboard — the command palette, when
   * it is mounted. The Python side has no equivalent because a terminal has no
   * keystrokes to give away.
   */
  keybinding?: string;
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
/**
 * Editors the shell hosts beside the conversation.
 *
 * Owned by the shell plugin, not the chat: which editors exist is a fact
 * about the workspace, and the segmented control that offers them shows
 * nothing at all until a plugin contributes one. The chat renders the chosen
 * editor's column, but the choice is the shell's.
 *
 * `LoopChatSurface` is the same point under its historical name, kept so
 * nothing that contributed to it has to move in the same commit.
 */
export const LoopEditorView =
  defineContributionPoint<ChatSurfaceContribution>('loop.chat.surface');

/** @deprecated Use {@link LoopEditorView}: the shell owns the point now. */
export const LoopChatSurface = LoopEditorView;

/** The shape an editor contributes — one view in the shell's editor point. */
export type EditorViewContribution = ChatSurfaceContribution;

/**
 * Frontend tools the chat hands its agent.
 *
 * Opened by the chat plugin, filled by whoever owns a capability: the
 * notebook contributes its cell tools, the document its lexical ones, and a
 * host plugin can add its own. The factory runs against the live workspace,
 * so a tool addressed by `surfaceId` binds to the session on screen.
 */
export type FrontendToolContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** Build the tools for this workspace. Called on mount and agent switch. */
  tools: (workspace: LoopWorkspaceContext) => FrontendToolDefinition[];
  /**
   * Whether these tools stay in the chat view — the conversation alone, no
   * editor on screen. Off by default: the chat view withholds tools that
   * change a notebook or a document the reader cannot see. A contribution
   * whose tools touch no editor — a deck the agent makes, say — says so here.
   */
  chatView?: boolean;
};

export const LoopFrontendTool =
  defineContributionPoint<FrontendToolContribution>('loop.frontendTool');

/**
 * The composer — the input prompt — arriving as a plugin.
 *
 * The chat view *assembles* everything the composer needs (the draft, the
 * send handler, the menus' data, the placement) and hands it over; the
 * plugin owns the component that renders it. Split this way round because
 * the wiring is the chat's knowledge and the surface is the plugin's: a
 * host can replace the composer's face without re-deriving a single query,
 * and unticking the input-prompt plugin removes the composer the way
 * unticking the notebook removes the editor.
 */
export type LoopChatComposerProps = {
  workspace: LoopWorkspaceContext;
  /** The standard composer's props, fully assembled by the chat view. */
  composer: import('../../chat/prompt/InputPrompt').InputPromptProps;
};

export type ChatComposerContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  Component: ComponentType<LoopChatComposerProps>;
};

export const LoopChatComposer =
  defineContributionPoint<ChatComposerContribution>('loop.chat.composer');

/**
 * The chat's title bar, arriving as a plugin.
 *
 * Same shape as the composer point: the chat assembles the header's full
 * props — title, kernel indicator, runtime status, the actions row — and the
 * plugin renders them, by default with the standard `ChatBaseHeader`. No
 * contribution, no title bar.
 */
export type LoopChatHeaderProps = {
  workspace: LoopWorkspaceContext;
  /** The standard header's props, fully assembled by the chat. */
  header: import('../../chat/header/ChatHeaderBase').ChatBaseHeaderProps;
};

export type ChatHeaderContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  Component: ComponentType<LoopChatHeaderProps>;
};

export const LoopChatHeader =
  defineContributionPoint<ChatHeaderContribution>('loop.chat.header');

/**
 * The agent a capacity plugin wants the workspace to run.
 *
 * A capacity plugin — codemode, hooks, guardrails — is a statement about
 * *which agent* answers and *how it is created*: an agentspec id and the
 * create-payload details the server needs. Contributed here rather than
 * configured on the agents plugin, so mounting the capacity is the whole
 * gesture: the agents plugin reads the first blueprint when its Local
 * target creates the agent, and a workspace with no blueprint behaves as
 * before. The workspace's `agentId` still names the instance; the blueprint
 * says what that instance is made from.
 */
export type AgentBlueprintContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The agentspec the agent is created from. */
  specId?: string;
  /** Extra fields merged into the server's create-agent payload. */
  createPayload?: Record<string, unknown>;
};

export const LoopAgentBlueprint =
  defineContributionPoint<AgentBlueprintContribution>('loop.agent.blueprint');

/** One conversation opener a plugin offers on the empty chat. */
export type ChatSuggestionItem = {
  /** The chip's words. */
  text: string;
  /** What is submitted; the chip's words when absent. */
  message?: string;
  emoji?: string;
};

/**
 * Conversation openers, contributed ahead of the spec's own.
 *
 * A capacity plugin knows what its agent is worth asking; when anything is
 * contributed here the chat shows it instead of the spec's generic list.
 */
export type ChatSuggestionContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  suggestions: ChatSuggestionItem[];
};

export const LoopChatSuggestion =
  defineContributionPoint<ChatSuggestionContribution>('loop.chat.suggestion');

/**
 * The per-example chat extras a host feeds the loop's conversation live.
 *
 * An example that keeps its bespoke panels around a `LoopEmbed` still has
 * things to say to the chat *column* — an error banner it computes from its
 * own state, the codemode toggle and the MCP/codemode status the footer
 * shows. These change over the life of the page, so the contribution carries
 * a **signal** rather than a value: the example updates `.value`, and the
 * chat view re-renders through `useSignalValue`. `createChatExtrasPlugin`
 * builds the plugin and hands back the setter.
 */
export type LoopChatExtrasValue = {
  /** A banner drawn above the transcript — the example's own diagnostics. */
  errorBanner?: { message: string; variant: 'danger' | 'warning' };
  /** Whether the codemode toggle in the footer reads as on. */
  codemodeEnabled?: boolean;
  /** Called when the reader flips the codemode toggle. */
  onToggleCodemode?: (enabled: boolean) => void | Promise<void>;
  /** Live MCP toolset status for the footer indicator. */
  mcpStatusData?: import('../../types/mcp').McpToolsetsStatusResponse | null;
  /** Live codemode status for the footer indicator. */
  codemodeStatusData?: import('../../types/stream').CodemodeStatusData | null;
  /**
   * A custom renderer for tool results in the transcript.
   *
   * For an example whose demonstration *is* how a tool result is drawn — the
   * A2UI examples render their agent's surface here. Wins over the notebook
   * tool-surface rendering when set. See `ChatBase.renderToolResult`.
   */
  renderToolResult?: import('../../types/chat').RenderToolResult;
  /**
   * Extra frontend tools the agent may call, from the host example.
   *
   * Folded into the loop's frontend-tool set alongside the notebook and
   * document tools (first name wins). For an example whose demo is a bespoke
   * client tool — A2UI Jupyter Output's `run_jupyter_output_demo`.
   */
  frontendTools?: FrontendToolDefinition[];
  /**
   * Take the composer off the screen, live.
   *
   * The chat plugin's `hidePrompt` is configuration — set once when the
   * reactor is built. This is the same switch as a signal, for a host whose
   * page changes what owns the typing while the workspace is running: a
   * landing page that swaps the prompt for a connection panel when the
   * visitor chooses to bring their own agent, without rebuilding the reactor
   * and losing the notebook the visitor was just working in.
   */
  hidePrompt?: boolean;
  /**
   * Whether the composer draws its usage band — context, session, turn.
   * True unless a host says otherwise: a public page turns the counters off,
   * because they answer questions a visitor is not asking.
   */
  showTokenUsage?: boolean;
};

export type ChatExtrasContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The live extras. Updated by the example; read by the chat view. */
  extras: ReadonlySignal<LoopChatExtrasValue>;
};

export const LoopChatExtras =
  defineContributionPoint<ChatExtrasContribution>('loop.chat.extras');

/**
 * What the notebook already holds when the workspace opens.
 *
 * The notebook plugin ships one opening cell with a result in it, so a visitor
 * never meets a blank editor. A host whose argument needs more — a landing
 * page showing several cells and an output in the first viewport — contributes
 * its own here, and the notebook view opens on that instead. First
 * contribution wins.
 *
 * `notebook` is a factory rather than a document: `EphemeralNotebook` keeps
 * the object it is first given and edits it in place, so a shared literal
 * would be a shared notebook. `prime` is the code the view runs on the sandbox
 * as soon as one is ready, so the kernel agrees with the cells on screen —
 * without it a variable the cells show is undefined the first time anyone
 * uses it. Left unset, the code cells' own source is run, top to bottom.
 */
export type OpeningNotebookContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The document to open on, built fresh per mount. */
  notebook: () => import('@jupyterlab/nbformat').INotebookContent;
  /** Code to run on the sandbox so it matches the cells; defaults to them. */
  prime?: string;
};

export const LoopOpeningNotebook =
  defineContributionPoint<OpeningNotebookContribution>('loop.notebook.opening');

/**
 * What the document editor holds when it opens.
 *
 * The document's twin of {@link LoopOpeningNotebook}: a host that wants the
 * editor to open on something — a heading, a paragraph, a cell that has
 * already run — contributes it here, as a serialised Lexical editor state
 * built fresh per mount. Nothing contributed means the document plugin's own
 * opening document, which is a short one of exactly that shape.
 */
export type OpeningDocumentContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The editor state to open on, built fresh per mount. */
  document: () => import('lexical').SerializedEditorState;
};

export const LoopOpeningDocument =
  defineContributionPoint<OpeningDocumentContribution>('loop.document.opening');

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

// Asking the chat to open a surface, from a command that runs outside it.
export {
  onSurfaceRequest,
  requestSurface,
  type SurfaceRequestListener,
} from './surfaceRequests';

// Asking whatever renders the prompt to focus it, the same way.
export { focusPrompt, onPromptFocusRequest } from './focusRequests';

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
  /**
   * The chat's own title bar, beside the agent's name.
   *
   * Distinct from `header`, which is the workspace's row above every view: a
   * host can hide one and keep the other, and what belongs here is what is
   * true of the *conversation* rather than of the workspace — how long the
   * visitor's trial key has left, say.
   *
   * Empty for most workspaces, and the chat asks whether anyone contributed
   * before it draws anything, so an unfilled slot costs nothing.
   */
  chatHeader: 'loop.chatHeader',
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
   * A mount point for plugins that position themselves.
   *
   * Rendered once, with no layout of its own. What goes here paints over the
   * workspace from a portal — the command palette does — so the slot only has
   * to exist somewhere the reactor is running. It is `root` rather than
   * `loop.root` because it is the reactor's convention rather than the loop's:
   * the music and CMS applications render the same name for the same plugins.
   */
  root: 'root',
  /**
   * The trailing edge, beside the view: the plugin list, and anything else
   * that belongs next to the work rather than in front of it.
   *
   * A slot, so a workspace with no sidebar plugin has no sidebar at all — the
   * column is not drawn when nothing fills it.
   */
  sidebar: 'loop.sidebar',
} as const;

/**
 * The sandbox's lifecycle, in the vocabulary a kernel indicator speaks.
 *
 * Here rather than beside either renderer because two of them draw the same
 * fact — the control in the workspace header, and the chat's own header for a
 * host that hides the workspace's. Two copies of this mapping would eventually
 * disagree about what `starting` looks like, and a workspace showing two
 * indicators that disagree is worse than one showing none.
 *
 * The execution state is the finer answer and wins when there is one: a
 * running sandbox is either working or waiting, and which of the two is the
 * thing a person actually watches for.
 */
export function sandboxIndicatorState(
  state: SandboxState,
  executionState?: string,
  isExecuting?: boolean,
): ExecutionState {
  if (state === 'error') return 'connected-dead';
  if (state === 'starting') return 'connected-starting';
  if (state === 'stopping') return 'disconnecting';
  if (state !== 'running') return 'disconnected';
  return executionState === 'busy' || isExecuting
    ? 'connected-busy'
    : 'connected-idle';
}

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

/**
 * How the chat view arranges its parts.
 *
 * The chat view assembles everything — the editor surfaces, the transcript
 * column, the composer, the openers, the surface picker — and by default lays
 * them out as a split: editor beside transcript, prompt underneath. A layout
 * contribution takes those same parts, already wired, and arranges them
 * differently: the page-layout plugin puts the editor on a centred sheet like
 * a document and floats the prompt at the top of it. First contribution wins.
 *
 * The parts are elements, not data: the composer's draft, the transcript's
 * streaming, the surfaces' hidden mounts all stay the view's business. A
 * layout decides where things go, never what they do.
 */
export type ChatLayoutParts = {
  workspace: LoopWorkspaceContext;
  /** The editor surfaces — every mountable surface, the active one shown. */
  editors: ReactNode;
  /** Whether an editor surface is on screen (false: the transcript is all). */
  hasEditor: boolean;
  /** The conversation column: transcript, banner, expired-key cover. */
  transcript: ReactNode;
  /** The composer, or null when hidden. Floating when the layout asked. */
  prompt: ReactNode;
  /** The openers as chips, or null. */
  chips: ReactNode;
  /** The surface picker strip, or null. */
  picker: ReactNode;
  /** A transient notice (a command's output), or null. */
  transient: ReactNode;
};

export type ChatLayoutContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** Arranges the parts. */
  Component: ComponentType<ChatLayoutParts>;
  /**
   * How this layout wants the composer built.
   *
   * `floating-top` is a floating card anchored to the top edge rather than
   * the bottom — a command line over the document, sized by the card.
   * `docked-top` is that same command line standing in the flow instead: the
   * layout gives it a mount point and the composer fills it, so its width is
   * the layout's to decide and the page below starts under it rather than
   * behind it.
   */
  prompt?: 'docked' | 'floating' | 'floating-top' | 'docked-top';
};

export const LoopChatLayout =
  defineContributionPoint<ChatLayoutContribution>('loop.chat.layout');

/**
 * A panel attached to the composer, above or below it.
 *
 * The input-prompt plugin opens this point and renders every contribution
 * inside the prompt's own card — so on a floating composer the panel floats
 * with it. The page layout uses it to show the current turn beside a prompt
 * whose transcript is out of sight; a host could hang anything else there.
 */
export type PromptPanelContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** Which side of the composer. `below` when unsaid. */
  placement?: 'above' | 'below';
  /** Among panels on the same side; lower first. */
  order?: number;
  Component: ComponentType<{ workspace: LoopWorkspaceContext }>;
};

export const LoopPromptPanel =
  defineContributionPoint<PromptPanelContribution>('loop.prompt.panel');

/**
 * The conversation's current turn, as a live value.
 *
 * What was just asked and what is being answered — the last user message,
 * the assistant's reply as it streams, and where the turn stands. The chat
 * plugin contributes one of these and its view keeps it current; anything
 * that shows a conversation without the transcript (the page layout's turn
 * panel) reads it. A new turn replaces the old one entirely, which is what
 * "cleared on each turn" means for a reader.
 */
export type ChatTurnStatus =
  'idle' | 'thinking' | 'streaming' | 'done' | 'error';

export type ChatTurnSnapshot = {
  /** Counts up per turn, so a reader can tell a new turn from an edit. */
  id: number;
  /** What the person sent. */
  user?: string;
  /** What the agent has said so far. */
  assistant?: string;
  status: ChatTurnStatus;
  /**
   * The context window as the agent last reported it — what a turn footer
   * draws: the window's fill, and this turn's tokens in and out.
   */
  usage?: import('../../types').ContextSnapshotData;
  /**
   * What the agent is doing right now, in a short line — "Analyst is adding
   * a cell…" — while a tool runs; cleared when it returns. For a layout that
   * shows the work rather than the transcript.
   */
  activity?: string;
};

export type ChatTurnContribution = {
  /** Stable id, for the registry and the graph. */
  id: string;
  /** The turn, live. */
  turn: ReadonlySignal<ChatTurnSnapshot>;
};

export const LoopChatTurn =
  defineContributionPoint<ChatTurnContribution>('loop.chat.turn');
