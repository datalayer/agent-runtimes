/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Loop, ready to drop into somebody else's page.
 *
 * The supported way to embed the workspace: a plugin set from `loopPlugins`, a
 * query client, an optional theme, and the shell. Everything a host has to do
 * around Loop, done once here instead of once per host.
 *
 * It exists because the landing page was embedding the *example*. An example is
 * written to be read — its props are demonstration switches, its wiring is
 * whatever made the demo clearest, and none of it is a promise. A page that
 * embeds Loop needs a supported surface, and the two drifting apart should not
 * be able to break somebody's home page.
 *
 * What a host still owns is the frame it puts around this and how much of the
 * page to give it. `WindowFrame` is there for the first; the second is a
 * `height` on whatever wraps this.
 *
 * @module loop/embed/LoopEmbed
 */

import { useMemo, type ReactNode } from 'react';
import type { PluginRef } from '@datalayer/reactor';
import { QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { internalQueryClient } from '../../utils';
import { buildLoopReactor, LoopWorkspace } from '../shell';
import { loopPlugins, type LoopPresetOptions } from '../presets';

export type LoopEmbedProps = LoopPresetOptions & {
  /** Which agent the conversation is with. */
  agentId?: string;
  /** Whether the shell draws its own header row above the views. */
  showHeader?: boolean;
  /** Extra controls for the chat's own header, beside the agent's name. */
  chatHeaderActions?: ReactNode;
  /**
   * The host's own plugins, mounted alongside the preset's.
   *
   * How a page adds something to Loop rather than around it — a button in the
   * window's title bar, a panel of its own, a command. Without this a host
   * would have to rebuild the plugin list to add one thing to it, which is the
   * assembly this component exists to save.
   */
  plugins?: PluginRef[];
};

export function LoopEmbed({
  agentId = '',
  showHeader = false,
  chatHeaderActions,
  plugins = [],
  ...preset
}: LoopEmbedProps): React.JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () => buildLoopReactor([...loopPlugins(preset), ...plugins]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      preset.serverUrl,
      preset.target,
      preset.defaultEditor,
      preset.showViewSelector,
      preset.hideChatHeader,
      preset.promptPlacement,
      preset.showAgentVariants,
      preset.teamId,
      preset.graph,
      preset.commandPalette,
      preset.pluginsPanel,
      preset.windowFrame,
      plugins,
    ],
  );

  /*
   * No theme provider here, deliberately.
   *
   * The views read Primer's CSS custom properties — the document editor reads
   * them as variables, because that is how Lexical's stylesheets are written —
   * so *something* above this has to define them. But a provider mounted here
   * writes into the shared primer-addons store, which is the store the host
   * page reads from: an embedded Loop would overwrite the reader's theme the
   * moment it finished loading. Installing a global from inside a component
   * somebody dropped into their page is not this component's business.
   *
   * A host provides `DatalayerThemeProvider` (or `ThemedProvider`) once, which
   * every Datalayer application already does.
   */
  return (
    <QueryClientProvider client={internalQueryClient}>
      <Box sx={{ height: '100%', minHeight: 0 }}>
        <LoopWorkspace
          serverUrl={preset.serverUrl ?? ''}
          agentId={agentId}
          reactor={reactor}
          manageReactor={false}
          showViewSelector={preset.showViewSelector}
          showHeader={showHeader}
          chatHeaderActions={chatHeaderActions}
        />
      </Box>
    </QueryClientProvider>
  );
}

export default LoopEmbed;
