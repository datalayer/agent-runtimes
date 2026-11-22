/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent, ready to drop into somebody else's page.
 *
 * The supported way to embed the workspace: a plugin set from `agentPlugins`, a
 * query client, an optional theme, and the shell. Everything a host has to do
 * around Agent, done once here instead of once per host.
 *
 * It exists because the landing page was embedding the *example*. An example is
 * written to be read — its props are demonstration switches, its wiring is
 * whatever made the demo clearest, and none of it is a promise. A page that
 * embeds Agent needs a supported surface, and the two drifting apart should not
 * be able to break somebody's home page.
 *
 * What a host still owns is the frame it puts around this and how much of the
 * page to give it. `WindowFrame` is there for the first; the second is a
 * `height` on whatever wraps this.
 *
 * @module apps/embed/AgentEmbed
 */

import { useMemo, useRef, type ReactNode } from 'react';
import type { PlatformInput } from '@datalayer/reactor';
import { QueryClientProvider } from '@tanstack/react-query';
import { useReactor } from '@datalayer/reactor/react';
import { Box } from '@datalayer/primer-addons';
import { internalQueryClient } from '../../utils';
import { buildAgentReactor, AgentWorkspace } from '../shell';
import { agentPlugins, type AgentPresetOptions } from '../presets';
import { WindowFrame } from '../plugins/window-frame';

export type AgentEmbedProps = AgentPresetOptions & {
  /** Which agent the conversation is with. */
  agentId?: string;
  /** Whether the shell draws its own header row above the views. */
  showHeader?: boolean;
  /** Extra controls for the chat's own header, beside the agent's name. */
  chatHeaderActions?: ReactNode;
  /** The host's own controls for the workspace header row. */
  headerActions?: ReactNode;
  /**
   * An element in the host's own bar to render the header's controls in,
   * instead of a header row. See `AgentWorkspaceProps.headerContainer`.
   */
  headerContainer?: HTMLElement | null;
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
   * The sidebar as a rail of line icons, one panel shown at a time. See `AgentWorkspaceProps.sidebarRail`.
   */
  sidebarRail?: boolean;
  /**
   * The host's own plugins, mounted alongside the preset's.
   *
   * How a page adds something to Agent rather than around it — a button in the
   * window's title bar, a panel of its own, a command. Without this a host
   * would have to rebuild the plugin list to add one thing to it, which is the
   * assembly this component exists to save. An extension groups some of
   * them, as an application's own plugins are (`AppRenderer`).
   */
  plugins?: PlatformInput[];
};

export function AgentEmbed({
  agentId = '',
  showHeader = false,
  chatHeaderActions,
  headerActions,
  headerContainer,
  frameTitle,
  frameHeight,
  sidebarRail = false,
  plugins = [],
  ...preset
}: AgentEmbedProps): React.JSX.Element {
  /*
   * The latest `firstPromptHook`, kept in a ref rather than closed over
   * directly.
   *
   * The reactor below is built once — see the comment on it — and a host's
   * hook is exactly the kind of prop that is *not* stable across renders (it
   * usually closes over the page's own state). Closing over it directly
   * would either freeze the plugin config at whichever value happened to be
   * current on the one render that built the reactor, or force this into the
   * dependency array and restart every plugin whenever the host re-renders
   * with a fresh inline function. The ref sidesteps both: the wrapper handed
   * to `agentPlugins` below never changes identity, and it always reaches
   * whatever the host most recently passed.
   */
  const firstPromptHookRef = useRef(preset.firstPromptHook);
  firstPromptHookRef.current = preset.firstPromptHook;
  // *Sign in* for an anonymous visitor, through a ref for the same reason.
  const onSignInRef = useRef(preset.onSignIn);
  onSignInRef.current = preset.onSignIn;
  const hasOnSignIn = Boolean(preset.onSignIn);
  // The box's call to action: its words by content, its action through a ref.
  const callToActionRef = useRef(preset.callToAction);
  callToActionRef.current = preset.callToAction;
  const callToActionSays = preset.callToAction?.says;
  const callToActionLabel = preset.callToAction?.label;

  // Built once: rebuilding would restart every plugin on each render.
  const reactor = useMemo(
    () =>
      buildAgentReactor([
        ...agentPlugins({
          ...preset,
          // A framed embed wants the title bar's slots open; a host that
          // asked for a frame should not also have to remember the plugin.
          windowFrame: preset.windowFrame || frameTitle !== undefined,
          firstPromptHook: () => firstPromptHookRef.current?.(),
          onSignIn: hasOnSignIn ? () => onSignInRef.current?.() : undefined,
          callToAction:
            callToActionSays !== undefined && callToActionLabel !== undefined
              ? {
                  says: callToActionSays,
                  label: callToActionLabel,
                  onAction: () => callToActionRef.current?.onAction(),
                }
              : undefined,
        }),
        ...plugins,
      ]),
    // `preset.firstPromptHook` is deliberately absent — see the ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      preset.serverUrl,
      preset.target,
      preset.datalayerAgentSpecId,
      preset.targetFixed,
      preset.themeVariant,
      // By its content, as the payload below.
      JSON.stringify(preset.themeOverrides ?? null),
      preset.colorMode,
      preset.presence?.name,
      preset.presence?.face,
      preset.presence?.welcome,
      preset.presence?.paused,
      preset.showTokenUsage,
      preset.runAsAnonymous,
      preset.maxTurns,
      preset.signInUrl,
      hasOnSignIn,
      callToActionSays,
      callToActionLabel,
      // Its voice by its content, the packages that hear aside (functions),
      // and its token aside: a renewed sign-in must not restart the workspace.
      JSON.stringify({
        ...(preset.voice ?? {}),
        engines: undefined,
        token: undefined,
      }),
      // The thread a reloaded embed goes on with, by its id.
      preset.thread?.id,
      // By its content: an application's spec written inline is a new object each render.
      JSON.stringify(preset.datalayerCreatePayload ?? null),
      JSON.stringify(preset.datalayerVisitors ?? null),
      preset.datalayerKept?.url,
      // The agent's own UI plugins, by their ids.
      JSON.stringify(preset.uiPlugins ?? []),
      // What the limited preview names as disabled, by content.
      JSON.stringify(preset.disabledUi ?? []),
      preset.embedToken,
      preset.defaultEditor,
      preset.showViewSelector,
      preset.hideChatHeader,
      preset.chatHeaderButtons,
      preset.promptPlacement,
      preset.autoFocusPrompt,
      preset.suggestionLabels,
      preset.fullScreenTopOffset,
      preset.showAgentVariants,
      preset.agentSummary,
      preset.teamId,
      preset.visitorFor,
      preset.teamPicker,
      preset.pageLayout,
      preset.pageLayoutTurnPanel,
      preset.pageLayoutTurnPanelFooter,
      preset.pageLayoutPrompt,
      preset.pageLayoutPromptAnchor,
      // By its fields: a host that writes the size inline hands over a new
      // object every render, and the reactor must not be rebuilt for that.
      preset.pageLayoutSize?.format,
      preset.pageLayoutSize?.width,
      preset.pageLayoutSize?.height,
      preset.localAgentSpec,
      preset.floatingPrompt,
      preset.editorSelector,
      preset.editors,
      preset.conversation,
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
   * page reads from: an embedded Agent would overwrite the reader's theme the
   * moment it finished loading. Installing a global from inside a component
   * somebody dropped into their page is not this component's business.
   *
   * A host provides `DatalayerThemeProvider` (or `ThemedProvider`) once, which
   * every Datalayer application already does.
   */
  /*
   * Started here, because this is what built it.
   *
   * `AgentWorkspace` starts the platform only when it is managing it, and it is
   * told not to below — the reactor is this component's, and a shell that
   * stopped it on unmount would be stopping somebody else's. Registering
   * without starting leaves every plugin inactive, so nothing contributes a
   * view and the workspace draws "No view is available yet".
   */
  useReactor(reactor);

  const shell = (
    <AgentWorkspace
      serverUrl={preset.serverUrl ?? ''}
      agentId={agentId}
      reactor={reactor}
      manageReactor={false}
      showViewSelector={preset.showViewSelector}
      showHeader={showHeader}
      chatHeaderActions={chatHeaderActions}
      headerActions={headerActions}
      headerContainer={headerContainer}
      sidebarRail={sidebarRail}
    />
  );

  return (
    <QueryClientProvider client={internalQueryClient}>
      {frameTitle !== undefined ? (
        <WindowFrame title={frameTitle} height={frameHeight}>
          {shell}
        </WindowFrame>
      ) : (
        // Filling its host, whatever the host is: in a flex row it used to
        // shrink to the chat's own width and leave the rest of the frame bare.
        <Box
          height="100%"
          minHeight={0}
          width="100%"
          flex="1 1 auto"
          minWidth={0}
        >
          {shell}
        </Box>
      )}
    </QueryClientProvider>
  );
}

export default AgentEmbed;
