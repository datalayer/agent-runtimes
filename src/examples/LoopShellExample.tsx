/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Loop Shell: the workspace with almost everything taken away.
 *
 * Where `LoopWorkspaceExample` shows everything Loop can mount, this shows how
 * little it needs: a blank shell, a floating prompt that can be dragged out of
 * the way, and one control in the top-right corner choosing the editor —
 * `None` by default, the notebook and the document on offer. Everything on
 * screen is a plugin; the example itself only picks them.
 *
 * The code runs in the browser sandbox — the in-page kernel reached through
 * the Jupyter service manager — so the page needs no server and no account.
 * The `loop-shell` agentspec pairs with the `None` state: its demonstrations
 * come back as Jupyter outputs rendered straight onto the conversation, which
 * is the whole canvas when no editor is open.
 *
 * @module examples/LoopShellExample
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Box } from '@primer/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useReactor } from '@datalayer/reactor/react';
import { buildLoopReactor, LoopWorkspace } from '../loop/shell';
import { loopPlugins } from '../loop/presets';
import { internalQueryClient } from '../utils';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { ThemedProvider } from './utils/themedProvider';

export type LoopShellExampleProps = {
  /** Server backing the session. Defaults to this page's origin. */
  serverUrl?: string;
  /** Agent bound to the session. */
  agentId?: string;
  /**
   * Which editor the shell opens on.
   *
   * `'none'` is the point of this example: the conversation is the canvas,
   * and the selector in the top-right corner is how an editor arrives.
   */
  defaultEditor?: 'none' | 'notebook' | 'document';
  /** Render without wrapping the shell in a theme provider. */
  inheritTheme?: boolean;
};

export function LoopShellExample({
  serverUrl = resolveExampleAgentRuntimesUrl('local'),
  agentId = 'loop-shell',
  defaultEditor = 'none',
  inheritTheme = false,
}: LoopShellExampleProps): JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor(
        loopPlugins({
          serverUrl,
          // The browser sandbox: the in-page kernel behind the Jupyter
          // service manager, so nothing has to be installed or signed into.
          target: 'browser',
          showAgentVariants: false,
          defaultEditor,
          // The two plugins this example exists to show: the draggable
          // prompt floating over the shell, and the editor choice in the
          // header. Each switches the chat's own copy of itself off.
          floatingPrompt: true,
          editorSelector: true,
          // Naked: the page names the example, and a title bar inside an
          // otherwise blank shell would be the only chrome in sight.
          hideChatHeader: true,
          // First-class commands still deserve their keystrokes.
          commandPalette: true,
          // The spec that pairs the agent with the blank shell: its
          // demonstrations return as Jupyter outputs on the conversation.
          localAgentSpec: 'loop-shell',
        }),
      ),
    [serverUrl, defaultEditor],
  );

  // Registered here rather than inside the workspace, because this component
  // built it; the workspace is told not to manage it a second time.
  useReactor(reactor);

  const shell = (
    <QueryClientProvider client={internalQueryClient}>
      <Box sx={{ height: '100%', minHeight: 0 }}>
        <LoopWorkspace
          serverUrl={serverUrl}
          agentId={agentId}
          reactor={reactor}
          manageReactor={false}
          // The header stays for the one thing living in it — the editor
          // selector on its trailing edge — but offers no view switcher:
          // a blank shell with one control is the example.
          showViewSelector={false}
        />
      </Box>
    </QueryClientProvider>
  );

  if (inheritTheme) {
    return shell;
  }

  // The one theme provider in the tree; see LoopWorkspaceExample for why the
  // editors need it even when the chrome looks right without it.
  return <ThemedProvider>{shell}</ThemedProvider>;
}

export default LoopShellExample;
