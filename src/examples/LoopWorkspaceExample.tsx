/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The LOOP workspace: a blank shell, and everything else on a checkbox.
 *
 * Two claims made checkable in one page.
 *
 * The **sidebar** says the extension model is real. The workspace itself
 * renders one view host and some slots — no prompt, no chat, no editor. Untick
 * the chat and the prompt goes with it, because the prompt is the chat's.
 * Untick the notebook and it leaves the chat's editor picker. The panel doing
 * the unticking is itself a plugin, which is the joke and also the proof — and
 * the button above it draws the whole graph, so the relationships being claimed
 * here can be looked at rather than taken on trust.
 *
 * The **browser / local / cloud** control in the header says the sandbox is an
 * interface rather than one implementation with a type annotation. `browser` is
 * Pyodide in this page; `local` and `cloud` are server-backed and differ in the
 * variant the server runs. The notebook binds to whichever kernel is there, and
 * does not know the difference.
 *
 * It starts on `browser` because that is the target that needs nothing: no
 * server, no runtime, no credentials. Move it once there is something to move
 * it to.
 *
 * @module examples/LoopWorkspaceExample
 */

import type { JSX } from 'react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Box } from '@primer/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useReactor, useSignalValue } from '@datalayer/reactor/react';
import { buildLoopReactor, LoopWorkspace } from '../loop/shell';
import { loopPlugins } from '../loop/presets';
import {
  IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  IDLE_SANDBOX_TARGET_SIGNAL,
} from '../loop/core';
import {
  AGENTS_PLUGIN_NAME,
  type AgentsOutput,
  type SandboxTarget,
} from '../loop/plugins/agents';
import { internalQueryClient } from '../utils';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { ThemedProvider } from './utils/themedProvider';
import { agentSummaryStore } from './utils/agentSummaryStore';
import { targetHasAgent } from './utils/runtimeTargetStore';

export type LoopWorkspaceExampleProps = {
  /** Server backing the session. Defaults to this page's origin. */
  serverUrl?: string;
  /**
   * Render without wrapping the workspace in a theme provider.
   *
   * For a host that owns the theme — the landing page embeds this example, and
   * `ThemedProvider` does not merely provide a theme: it writes the examples'
   * own choice into the shared primer-addons singleton, which is where that
   * host reads its theme from. Mounting this unconditionally overwrote the
   * reader's theme the moment the workspace finished loading.
   */
  inheritTheme?: boolean;
  /**
   * Which editor opens beside the chat.
   *
   * `'none'` leaves the chat full width; the others open that editor as soon
   * as it can be opened — its plugin has loaded and, for these two, a sandbox
   * is running.
   */
  defaultEditor?: 'none' | 'notebook' | 'document';
  /** Agent to start with. */
  agentId?: string;
  /** Where the sandbox starts. Defaults to the browser, which needs nothing. */
  initialTarget?: SandboxTarget;
  /**
   * Whether a reader may choose where the agent runs.
   *
   * True by default: the segmented control in the header is most of what this
   * example is for.
   *
   * False pins the workspace to the browser and hides the control. That is
   * what a public page needs — a visitor with no account cannot reach a local
   * server or a Datalayer runtime, so offering all four is offering three
   * doors of which two are locked.
   */
  showAgentVariants?: boolean;
  /**
   * The team to work with, by id.
   *
   * Given one, the header gains a control for choosing which member the next
   * prompt reaches. `jupyter-notebook` is the tutor and the compactor behind a
   * supervising tutor.
   */
  teamId?: string;
  /**
   * Whether the plugin graph is available.
   *
   * True by default: the graph is one of the things this example exists to
   * show, and switching it off in the sidebar is part of that.
   *
   * False leaves the plugin out entirely — no view, and no button in the
   * sidebar, since the graph plugin owns that button. What a public page
   * wants: a visitor came for a notebook and an agent, and a diagram of the
   * plugin system is a developer's tool shown to somebody who did not ask for
   * one.
   */
  showGraph?: boolean;
  /** Whether Ctrl-K opens the command palette. */
  showCommandPalette?: boolean;
  /**
   * Whether the plugin manager is mounted.
   *
   * True by default: the sidebar is how this example shows that the extension
   * model is real, and switching plugins on and off is the point of it.
   *
   * False leaves the plugin out, which takes the sidebar with it — the column
   * exists because something contributed to it, so there is no empty gutter
   * to tidy up afterwards. What a public page wants: a visitor came for a
   * notebook and an agent, not for a list of the parts they are made of.
   */
  showPluginsManager?: boolean;
  /**
   * Whether the header offers a choice of view.
   *
   * True by default. False opens on `defaultEditor` and stays there, for a
   * host embedding the workspace to show one thing.
   */
  showViewSelector?: boolean;
  /**
   * Whether to hide the chat's own title bar.
   *
   * False by default. True for a host whose page already names the workspace,
   * where the bar repeats a heading the reader has just read.
   */
  hideChatHeader?: boolean;
  /**
   * Whether the workspace draws its header row.
   *
   * True by default. False removes the row and every control a plugin put in
   * it, for a host whose page already frames the workspace. The plugins stay
   * switched on — this is about where their controls render, not what they do.
   */
  showHeader?: boolean;
  /**
   * Where the prompt sits.
   *
   * `bottom` (the default) spans the workspace; `bottom-chat` keeps it inside
   * the chat column, under the transcript, as the other examples do.
   */
  promptPlacement?: 'bottom' | 'bottom-chat';
  /**
   * Extra controls for the chat's own title bar.
   *
   * For a host with something to add beside the agent's name without writing
   * a plugin to add it. Plugins reach the same row through
   * `LoopSlots.chatHeader`, which is where anything belonging to a capability
   * belongs — the trial-key countdown arrives that way.
   */
  chatHeaderActions?: ReactNode;
};

export function LoopWorkspaceExample({
  // The examples Vite server deliberately has no /api proxy. Using the page
  // origin here sends sandbox switches to port 3000 and produces the exact
  // "clicked, nothing happened" failure this example is meant to expose.
  serverUrl = resolveExampleAgentRuntimesUrl('local'),
  agentId = 'loop-workspace',
  initialTarget = 'browser',
  showAgentVariants = true,
  teamId = 'jupyter-notebook',
  showGraph = true,
  showCommandPalette = true,
  showPluginsManager = true,
  showViewSelector = true,
  hideChatHeader = false,
  showHeader = true,
  promptPlacement = 'bottom',
  inheritTheme = false,
  defaultEditor = 'notebook',
  chatHeaderActions,
}: LoopWorkspaceExampleProps): JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor(
        loopPlugins({
          serverUrl,
          target: initialTarget,
          defaultEditor,
          showViewSelector,
          hideChatHeader,
          promptPlacement,
          showAgentVariants,
          teamId,
          localAgent: {
            createPayload: {
              description: 'Local agent for the Loop workspace example',
              agent_library: 'pydantic-ai',
              agent_spec_id: 'example-simple',
              enable_codemode: false,
            },
          },
          // The demonstration's switches. Each is left out rather than
          // mounted-and-hidden: the sidebar is drawn only when something
          // contributes to it, so leaving these out is what removes the column.
          graph: showGraph,
          commandPalette: showCommandPalette,
          pluginsPanel: showPluginsManager,
        }),
      ),
    [
      serverUrl,
      initialTarget,
      showAgentVariants,
      teamId,
      showGraph,
      showCommandPalette,
      showPluginsManager,
      showViewSelector,
      hideChatHeader,
      promptPlacement,
      defaultEditor,
    ],
  );

  // Registered here rather than inside the workspace: the checkbox list below
  // renders first and reads the platform, so it has to exist by then.
  useReactor(reactor);

  // The plugin list is a plugin, so it arrives through the sidebar slot rather
  // than being wrapped around the workspace. Nothing here is above the shell.
  // Tell the page where this workspace is running.
  //
  // The examples shell draws its "Active Agent" panel from a summary store,
  // and the workspace's segmented control is a *different* control over a
  // *different* signal — so switching from Browser to Local moved the sandbox
  // and left the header saying `browser` with no agent id.
  //
  // The summary only. Writing the page's `runtimeTargetStore` too looked
  // tidier — one notion of where things run — but the page mounts each example
  // under `key={`${example}:${runtimeTarget}`}`, so changing it tore the
  // workspace down and rebuilt it at its initial target: the control snapped
  // straight back to Browser. The page-level target is which target the
  // *example* was opened for; this workspace moves within that, and the two
  // are not the same fact.
  //
  // This example is where they meet: the plugin must not know an examples page
  // exists, and the page cannot see inside the reactor.
  const sandbox = reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)?.sandbox;
  const sandboxTarget = useSignalValue(
    sandbox?.target ?? IDLE_SANDBOX_TARGET_SIGNAL,
  );
  const sandboxSnapshot = useSignalValue(
    sandbox?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );
  const sandboxState = sandboxSnapshot.state;
  const sandboxJupyterUrl = sandboxSnapshot.jupyterUrl;

  useEffect(() => {
    if (!sandboxTarget) {
      return;
    }
    const summary = {
      exampleId: 'LoopWorkspaceExample',
      agentName: agentId,
      // Only the targets that bring an agent report one. On Browser and
      // Jupyter the panel should say there is none rather than name one that
      // cannot answer.
      agentId: targetHasAgent(sandboxTarget) ? agentId : undefined,
      location: sandboxTarget,
      baseUrl: serverUrl,
      sandboxBaseUrl: sandboxJupyterUrl,
      status: sandboxState,
      isReady: sandboxState === 'running',
    };
    const publish = () => agentSummaryStore.getState().setActive(summary);
    publish();

    // Hold it against the page's own seed.
    //
    // The shell re-seeds a base summary whenever its inputs change, and only
    // spares a richer one whose `location` matches the *page* target — which
    // this one deliberately does not, because the workspace moves within the
    // target it was opened at. Without this, an unrelated change on the page
    // would quietly put the panel back to `browser`.
    //
    // Compared by identity against the exact object published above, so a
    // re-publish cannot trigger itself.
    return agentSummaryStore.subscribe(state => {
      if (state.active !== summary) {
        publish();
      }
    });
  }, [agentId, sandboxTarget, sandboxState, sandboxJupyterUrl, serverUrl]);

  const workspace = (
    <QueryClientProvider client={internalQueryClient}>
      <Box sx={{ height: '100%', minHeight: 0 }}>
        <LoopWorkspace
          serverUrl={serverUrl}
          agentId={agentId}
          reactor={reactor}
          manageReactor={false}
          showViewSelector={showViewSelector}
          showHeader={showHeader}
          chatHeaderActions={chatHeaderActions}
        />
      </Box>
    </QueryClientProvider>
  );

  // A host that owns the theme gets the workspace and nothing else.
  if (inheritTheme) {
    return workspace;
  }

  return (
    // The theme, as every other example provides it.
    //
    // Not decoration: it is what defines the Primer CSS custom properties —
    // `--bgColor-default` among them — on an ancestor of everything below.
    // The workspace's own chrome reads Primer tokens through `sx` and looked
    // right without this, which is why its absence went unnoticed; the
    // document editor reads them as *CSS variables*, because that is how
    // Lexical's stylesheets are written (`background: var(--bgColor-default,
    // #fff)`). With no provider the variable was undefined and every one of
    // those rules took its white fallback, so the document rendered as a white
    // sheet inside a dark workspace.
    //
    // The plugins the views mount pass `inheritTheme`, so this is the one
    // provider in the tree — nested providers fight over BaseStyles and font
    // tokens, and the inner one wins for the wrong reasons.
    <ThemedProvider>{workspace}</ThemedProvider>
  );
}

export default LoopWorkspaceExample;
