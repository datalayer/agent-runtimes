/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The plugins a Loop workspace normally has.
 *
 * A host builds a workspace by choosing plugins, which is the point of the
 * architecture and also a lot to get right before seeing anything. This is the
 * set the examples app runs, as a function, so a third party can start from a
 * working Loop and take things out rather than assemble one from nothing.
 *
 * It exists because the landing page was importing the *example* to get it.
 * An example is written to be read: its props are demonstration switches, its
 * wiring is whatever made the demo clearest, and nothing about it is a promise.
 * A page that embeds Loop needs the plugins, not the demonstration — and the
 * two drifting apart should not be able to break somebody's home page.
 *
 * ```tsx
 * const reactor = buildLoopReactor(loopPlugins({ serverUrl, target: 'browser' }));
 * <LoopWorkspace reactor={reactor} serverUrl={serverUrl} agentId={agentId} />
 * ```
 *
 * @module loop/presets
 */

import { configurePlugin, type PluginRef } from '@datalayer/reactor';
import { ThemePlugin } from '@datalayer/primer-addons/lib/reactor';
import { A2uiPlugin } from './plugins/a2ui';
import { ShellPlugin } from './plugins/shell';
import { PromptPlugin } from './plugins/prompt';
import { AgentspecsPlugin } from './plugins/agentspecs';
import {
  AgentsPlugin,
  type AgentsConfig,
  type SandboxTarget,
} from './plugins/agents';
import { ChatPlugin, type ChatPluginConfig } from './plugins/chat';
import { LoopCommandsPlugin } from './plugins/commands';
import { GraphViewPlugin } from './plugins/graph';
import { ModelsPlugin } from './plugins/models';
import { PluginsPanelPlugin } from './plugins/plugins-panel';
import { WindowFramePlugin } from './plugins/window-frame';
import { DocumentExtension, NotebookExtension } from './extensions';

export type LoopPresetOptions = {
  /** Where the agent runtimes service is. */
  serverUrl?: string;
  /** Where code runs: in the page, on a local server, or on Datalayer. */
  target?: SandboxTarget;
  /**
   * Which surface opens beside the chat.
   *
   * A surface id rather than a fixed union, because the surfaces are
   * contributed: an editor plugin the preset has never heard of is still a
   * valid answer, and `'none'` is how a host asks for the chat alone.
   */
  defaultEditor?: ChatPluginConfig['defaultSurface'];
  /** Whether the chat offers its surface switcher. */
  showViewSelector?: boolean;
  /** Whether the chat draws its own header. */
  hideChatHeader?: boolean;
  /** Where the prompt sits. Passed through to the chat plugin. */
  promptPlacement?: ChatPluginConfig['promptPlacement'];
  /** Whether a person may choose between agent variants. */
  showAgentVariants?: boolean;
  /**
   * The agent summary badge in the workspace header. On by default; a host
   * whose page already introduces the agent switches it off.
   */
  agentSummary?: boolean;
  /** The team whose agents are offered. */
  teamId?: string;
  /** What a local agent is created from, when one is. */
  localAgent?: AgentsConfig['localAgent'];
  /**
   * The agentspec the local agent is created from, by id.
   *
   * Shorthand for the `localAgent` payload every host was writing out by
   * hand; `localAgent`, when both are given, wins — it is the longhand.
   */
  localAgentSpec?: string;
  /**
   * The chat's composer in a floating, draggable card.
   *
   * Sets the chat's `promptPlacement` to `'floating'` — it is the same
   * composer, card included — and mounts `PromptPlugin` for the `/prompt`
   * command that focuses it: the two halves of one decision, taken together.
   * Wins over `promptPlacement` when both are given.
   */
  floatingPrompt?: boolean;
  /**
   * The editor choice in the workspace header rather than above the chat.
   *
   * Mounts `EditorsPlugin` and switches the chat's own surface strip off —
   * again both halves of one decision: two controls offering the same choice
   * would eventually disagree about what is open.
   */
  editorSelector?: boolean;
  /**
   * The plugin graph, reachable from the sidebar.
   *
   * Left out rather than mounted-and-hidden: it pulls the generic
   * `@datalayer/reactor-graph` in as a dependency, and mounting both to show
   * neither would put two plugins in the sidebar that do nothing.
   */
  graph?: boolean;
  /** Ctrl-K over whatever the mounted plugins contribute. */
  commandPalette?: boolean;
  /** The sidebar that switches plugins on and off. */
  pluginsPanel?: boolean;
  /**
   * The window chrome's slots.
   *
   * The frame itself is composed by the host — see `WindowFrame` — but the
   * plugin is what opens its title bar to contributions, so a host that frames
   * Loop wants this on.
   */
  windowFrame?: boolean;
};

/**
 * The standard set, with the options a host usually varies.
 *
 * Defaults are the embeddable ones: code runs in the page, so nothing has to
 * be installed or signed into, and the switches a demonstration wants are off.
 */
export function loopPlugins(options: LoopPresetOptions = {}): PluginRef[] {
  const {
    serverUrl,
    target = 'browser',
    defaultEditor = 'notebook',
    showViewSelector = true,
    hideChatHeader = false,
    promptPlacement,
    showAgentVariants = false,
    agentSummary = true,
    teamId,
    localAgent,
    localAgentSpec,
    floatingPrompt = false,
    editorSelector = false,
    graph = false,
    commandPalette = false,
    pluginsPanel = false,
    windowFrame = false,
  } = options;

  return [
    // The chat owns the editor beside it, so which one opens is its
    // configuration rather than the workspace's.
    configurePlugin(ChatPlugin, {
      defaultSurface: defaultEditor,
      // The chat's strip stands down when the header selector offers the
      // same choice; see `editorSelector`.
      showSurfaceSelector: showViewSelector && !editorSelector,
      hideHeader: hideChatHeader,
      promptPlacement: floatingPrompt ? 'floating' : promptPlacement,
    }),
    configurePlugin(AgentsPlugin, {
      serverUrl,
      target,
      showAgentVariants,
      showAgentSummary: agentSummary,
      teamId,
      localAgent:
        localAgent ??
        (localAgentSpec
          ? {
              createPayload: {
                description: `Local agent from the ${localAgentSpec} spec`,
                agent_library: 'pydantic-ai',
                agent_spec_id: localAgentSpec,
                enable_codemode: false,
              },
            }
          : undefined),
    }),
    // Two extensions rather than four plugins: each delivers an editor and the
    // toolbar that reports on it. Every member is still switched individually.
    NotebookExtension,
    DocumentExtension,
    A2uiPlugin,
    AgentspecsPlugin,
    ModelsPlugin,
    // The Primer portal root, kept in the application's color mode, and the
    // command that toggles it. Unconditional: every workspace portals
    // something, and the palette's dependency alone would tie the theme to
    // whether Ctrl-K happens to be mounted.
    ThemePlugin,
    // The shell plugin is unconditional: it declares the points the others
    // extend, and a workspace where extending works only if a selector
    // happens to be on is a workspace with a trap in it. The selector itself
    // stays behind the old switch.
    configurePlugin(ShellPlugin, {
      defaultEditor,
      showSelector: editorSelector,
    }),
    ...(floatingPrompt ? [PromptPlugin] : []),
    ...(graph ? [GraphViewPlugin] : []),
    ...(commandPalette ? [LoopCommandsPlugin] : []),
    ...(pluginsPanel ? [PluginsPanelPlugin] : []),
    ...(windowFrame ? [WindowFramePlugin] : []),
  ] as PluginRef[];
}

export default loopPlugins;
