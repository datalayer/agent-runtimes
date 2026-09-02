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
import { useReactor } from '@datalayer/reactor/react';
import { Box } from '@datalayer/primer-addons';
import { internalQueryClient } from '../../utils';
import { buildLoopReactor, LoopWorkspace } from '../shell';
import { loopPlugins, type LoopPresetOptions } from '../presets';
import { WindowFrame } from '../plugins/window-frame';

export type LoopEmbedProps = LoopPresetOptions & {
  /** Which agent the conversation is with. */
  agentId?: string;
  /** Whether the shell draws its own header row above the views. */
  showHeader?: boolean;
  /** Extra controls for the chat's own header, beside the agent's name. */
  chatHeaderActions?: ReactNode;
  /**
   * Draw the workspace inside a window frame with this title bar.
   *
   * The composition every embedding page was writing for itself: the frame
   * around the shell, the title in its bar. Giving a title is what asks for
   * the frame; it also switches the `windowFrame` plugin on, since a frame
   * whose title-bar slots are closed to plugins is only half the point.
   */
  frameTitle?: ReactNode;
  /**
   * How tall the frame stands. Left unset it fills whatever wraps this,
   * which is what a full-page host wants.
   */
  frameHeight?: number | string;
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
  frameTitle,
  frameHeight,
  plugins = [],
  ...preset
}: LoopEmbedProps): React.JSX.Element {
  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildLoopReactor([
        ...loopPlugins({
          ...preset,
          // A framed embed wants the title bar's slots open; a host that
          // asked for a frame should not also have to remember the plugin.
          windowFrame: preset.windowFrame || frameTitle !== undefined,
        }),
        ...plugins,
      ]),
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
      preset.localAgentSpec,
      preset.floatingPrompt,
      preset.editorSelector,
      preset.graph,
      preset.commandPalette,
      preset.pluginsPanel,
      preset.windowFrame,
      frameTitle !== undefined,
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
  /*
   * Started here, because this is what built it.
   *
   * `LoopWorkspace` starts the platform only when it is managing it, and it is
   * told not to below — the reactor is this component's, and a shell that
   * stopped it on unmount would be stopping somebody else's. Registering
   * without starting leaves every plugin inactive, so nothing contributes a
   * view and the workspace draws "No view is available yet".
   */
  useReactor(reactor);

  const shell = (
    <LoopWorkspace
      serverUrl={preset.serverUrl ?? ''}
      agentId={agentId}
      reactor={reactor}
      manageReactor={false}
      showViewSelector={preset.showViewSelector}
      showHeader={showHeader}
      chatHeaderActions={chatHeaderActions}
    />
  );

  return (
    <QueryClientProvider client={internalQueryClient}>
      {frameTitle !== undefined ? (
        <WindowFrame title={frameTitle} height={frameHeight}>
          {shell}
        </WindowFrame>
      ) : (
        <Box sx={{ height: '100%', minHeight: 0 }}>{shell}</Box>
      )}
    </QueryClientProvider>
  );
}

export default LoopEmbed;
