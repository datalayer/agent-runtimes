/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The LOOP workspace: every plugin on a checkbox, and the sandbox on a switch.
 *
 * Two claims made checkable in one page.
 *
 * The **checkboxes** say the extension model is real: untick the notebook and
 * its tab and its `/notebook` command leave together, and nothing else changes.
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
import { configExtension } from '@datalayer/reactor';
import { useReactor } from '@datalayer/reactor/react';
import { buildLoopReactor, LoopWorkspace, PluginToggles } from '../loop/shell';
import { A2uiExtension } from '../loop/plugins/a2ui';
import { AgentsExtension } from '../loop/plugins/agents';
import { ChatExtension } from '../loop/plugins/chat';
import {
  CODE_SANDBOX_EXTENSION_NAME,
  CodeSandboxExtension,
  type CodeSandboxOutput,
  type SandboxTarget,
} from '../loop/plugins/code-sandbox';
import { DocumentExtension } from '../loop/plugins/document';
import { ModelsExtension } from '../loop/plugins/models';
import { NotebookExtension } from '../loop/plugins/notebook';

export type LoopWorkspaceExampleProps = {
  /** Server backing the session. Defaults to this page's origin. */
  serverUrl?: string;
  /** Agent to start with. */
  agentId?: string;
  /** Where the sandbox starts. Defaults to the browser, which needs nothing. */
  initialTarget?: SandboxTarget;
};

export function LoopWorkspaceExample({
  serverUrl = typeof window === 'undefined' ? '' : window.location.origin,
  agentId = 'default',
  initialTarget = 'browser',
}: LoopWorkspaceExampleProps): JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor([
        ChatExtension,
        configExtension(CodeSandboxExtension, {
          serverUrl,
          target: initialTarget,
        }),
        NotebookExtension,
        DocumentExtension,
        A2uiExtension,
        AgentsExtension,
        ModelsExtension,
      ]),
    [serverUrl, initialTarget],
  );

  // Registered here rather than inside the workspace: the checkbox list below
  // renders first and reads the platform, so it has to exist by then.
  useReactor(reactor);

  // Connect the sandbox on open. Pyodide takes seconds to boot, and a notebook
  // that waits for a tab press to *begin* loading reads as broken.
  useEffect(() => {
    const sandbox = reactor.getOutput<CodeSandboxOutput>(
      CODE_SANDBOX_EXTENSION_NAME,
    )?.sandbox;
    return sandbox?.connect(agentId);
  }, [reactor, agentId]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PluginToggles
        title="Plugins — untick one and watch its view and its command leave together"
        // The chat plugin is what makes the workspace usable at all here; the
        // shell survives without it, but an example that can be switched into
        // an empty room is not demonstrating anything.
        locked={['@datalayer/loop-plugin-chat']}
      />
      <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
        <LoopWorkspace
          serverUrl={serverUrl}
          agentId={agentId}
          reactor={reactor}
          manageReactor={false}
        />
      </Box>
    </Box>
  );
}

export default LoopWorkspaceExample;
