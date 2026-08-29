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

import { useEffect, useMemo } from 'react';
import { Box } from '@primer/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { configurePlugin } from '@datalayer/reactor';
import { useReactor, useSignalValue } from '@datalayer/reactor/react';
import { buildLoopReactor, LoopWorkspace } from '../loop/shell';
import { A2uiPlugin } from '../loop/plugins/a2ui';
import { AgentsPlugin } from '../loop/plugins/agents';
import { ChatPlugin } from '../loop/plugins/chat';
import {
  CODE_SANDBOX_PLUGIN_NAME,
  CodeSandboxPlugin,
  type CodeSandboxOutput,
  type SandboxTarget,
} from '../loop/plugins/code-sandbox';
import { DocumentExtension, NotebookExtension } from '../loop/extensions';
import { ModelsPlugin } from '../loop/plugins/models';
import { GraphViewPlugin } from '../loop/plugins/graph';
import { PluginsPanelPlugin } from '../loop/plugins/plugins-panel';
import { internalQueryClient } from '../utils';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { ThemedProvider } from './utils/themedProvider';
import { agentSummaryStore } from './utils/agentSummaryStore';
import { targetHasAgent } from './utils/runtimeTargetStore';

export type LoopWorkspaceExampleProps = {
  /** Server backing the session. Defaults to this page's origin. */
  serverUrl?: string;
  /** Agent to start with. */
  agentId?: string;
  /** Where the sandbox starts. Defaults to the browser, which needs nothing. */
  initialTarget?: SandboxTarget;
};

export function LoopWorkspaceExample({
  // The examples Vite server deliberately has no /api proxy. Using the page
  // origin here sends sandbox switches to port 3000 and produces the exact
  // "clicked, nothing happened" failure this example is meant to expose.
  serverUrl = resolveExampleAgentRuntimesUrl('local'),
  agentId = 'loop-workspace',
  initialTarget = 'browser',
}: LoopWorkspaceExampleProps): JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor([
        ChatPlugin,
        configurePlugin(CodeSandboxPlugin, {
          serverUrl,
          target: initialTarget,
          localAgent: {
            createPayload: {
              description: 'Local agent for the Loop workspace example',
              agent_library: 'pydantic-ai',
              agent_spec_id: 'example-simple',
              enable_codemode: false,
            },
          },
        }),
        // Two extensions rather than four plugins: each delivers an editor
        // and the toolbar that reports on it, and the sidebar lists them as
        // capabilities rather than as peers. Every member is still switched
        // on and off individually.
        NotebookExtension,
        DocumentExtension,
        A2uiPlugin,
        AgentsPlugin,
        ModelsPlugin,
        GraphViewPlugin,
        PluginsPanelPlugin,
      ]),
    [serverUrl, initialTarget],
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
  const sandbox = reactor.getOutput<CodeSandboxOutput>(
    CODE_SANDBOX_PLUGIN_NAME,
  )?.sandbox;
  const sandboxTarget = useSignalValue(sandbox?.target ?? IDLE_TARGET);
  const sandboxSnapshot = useSignalValue(sandbox?.snapshot ?? IDLE_SNAPSHOT);
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
    <ThemedProvider>
      <QueryClientProvider client={internalQueryClient}>
        <Box sx={{ height: '100%', minHeight: 0 }}>
          <LoopWorkspace
            serverUrl={serverUrl}
            agentId={agentId}
            reactor={reactor}
            manageReactor={false}
          />
        </Box>
      </QueryClientProvider>
    </ThemedProvider>
  );
}

/**
 * Read while the sandbox plugin is absent, so the hook order never changes.
 *
 * `useSignalValue` has to be called unconditionally, and the plugin can be
 * switched off from the sidebar.
 */
const IDLE_TARGET = {
  value: undefined as SandboxTarget | undefined,
  peek: () => undefined as SandboxTarget | undefined,
} as never;

const IDLE_SNAPSHOT = {
  value: { state: 'idle' as const },
  peek: () => ({ state: 'idle' as const }),
} as never;

export default LoopWorkspaceExample;
