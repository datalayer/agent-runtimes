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
 * The agents are the `shared-notebook` team the landing page runs — Analyst,
 * Reviewer, Writer and Decks — with the Analyst at the front door; `@` in the
 * composer reaches the others, and the team picker in the header switches to
 * one. The decks plugin is mounted so the fourth member has its tools and a
 * deck can open beside the conversation, like the notebook and the document.
 *
 * @module examples/LoopShellExample
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Box } from '@primer/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useReactor } from '@datalayer/reactor/react';
import { registerDecks } from '@datalayer/decks';
import { exampleDecks } from '@datalayer/decks/examples';
import { buildLoopReactor, LoopWorkspace } from '../loop/shell';
import { DeckViewPlugin, LoopDecksPlugin } from '../loop/plugins/decks';
import { loopPlugins } from '../loop/presets';
import { internalQueryClient } from '../utils';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { ThemedProvider } from './utils/themedProvider';

/** The team the landing page runs, and this example with it. */
const TEAM_ID = 'shared-notebook';
/** Its front door: the member a prompt reaches unless `@` says otherwise. */
const FRONT_DOOR = 'jupyter-notebook-analyst';

// The package's example decks, so the Decks member has something to open and
// change before it has made one. Once, at module load.
registerDecks(exampleDecks);

export type LoopShellExampleProps = {
  /** Server backing the session. Defaults to this page's origin. */
  serverUrl?: string;
  /** Agent bound to the session; the team's front door by default. */
  agentId?: string;
  /**
   * Which editor the shell opens on.
   *
   * `'none'` is the point of this example: the conversation is the canvas,
   * and the selector in the top-right corner is how an editor arrives.
   */
  defaultEditor?: 'none' | 'notebook' | 'document' | 'deck';
  /** Render without wrapping the shell in a theme provider. */
  inheritTheme?: boolean;
};

export function LoopShellExample({
  serverUrl = resolveExampleAgentRuntimesUrl('local'),
  agentId = FRONT_DOOR,
  defaultEditor = 'none',
  inheritTheme = false,
}: LoopShellExampleProps): JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor([
        ...loopPlugins({
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
          // The landing page's team, front door and all: what `@` offers
          // in the composer and what the header's picker switches between.
          teamId: TEAM_ID,
          localAgentSpec: FRONT_DOOR,
        }),
        // The deck beside the chat — an editor in the selector, a footer
        // icon, a menu in the composer — and the tools the Decks member
        // reads and writes decks with. Without these the fourth member
        // would be a name with nothing behind it.
        LoopDecksPlugin,
        DeckViewPlugin,
      ]),
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
