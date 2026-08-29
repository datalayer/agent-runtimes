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

import { useMemo } from 'react';
import { Box } from '@primer/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { configurePlugin } from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import { buildLoopReactor, LoopWorkspace } from '../loop/shell';
import { A2uiPlugin } from '../loop/plugins/a2ui';
import { AgentsPlugin } from '../loop/plugins/agents';
import { ChatPlugin } from '../loop/plugins/chat';
import {
  CodeSandboxPlugin,
  type SandboxTarget,
} from '../loop/plugins/code-sandbox';
import { DocumentExtension, NotebookExtension } from '../loop/extensions';
import { ModelsPlugin } from '../loop/plugins/models';
import { GraphViewPlugin } from '../loop/plugins/graph';
import { PluginsPanelPlugin } from '../loop/plugins/plugins-panel';
import { internalQueryClient } from '../utils';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';

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
  agentId = 'default',
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
  return (
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
  );
}

export default LoopWorkspaceExample;
