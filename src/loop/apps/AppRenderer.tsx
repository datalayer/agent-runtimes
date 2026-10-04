/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application, rendered: the LOOP workspace configured from an Appspec
 * (LOOP R-01).
 *
 * One renderer for every place an application appears — the Studio's
 * Preview, its hosted page, an embed, the home page — so that what a builder
 * sees while building is what its users get. It is not a second shell: it is
 * `LoopEmbed`, given
 *
 * - an **application plugin** (`defineAppPlugin`): the agent that answers,
 *   created with the application in its payload — so the runtime reaches only
 *   what the application connects to and enforces its rules before every tool
 *   call — and the application's starters as the openers of the empty chat;
 * - its **layout**, as `interface.layout` says (`appLayoutOptions`, LOOP
 *   T-07), on the workspace's own `page-layout` plugin: `chat` is the
 *   conversation alone, with the A2UI surfaces its answers draw; `page` is
 *   the page on a sheet with the composer over it and the conversation in a
 *   panel the composer's display modes open; `split` is the conversation and
 *   the page side by side, a hairline between them to drag;
 * - its **page**, when it has one (`hasAppPage`: a chat, a widget or a worker
 *   with a `page` or `split` layout): its A2UI surface drawn by the
 *   `app-page` plugin, in place of the notebook and the document, fed from
 *   the conversation and answered through it (`APP_KIND_PATHS`). A
 *   decision's page stays the Studio's run page (R-02); its layout keeps the
 *   editors;
 * - its **frame**, when the host asks (`frame`): the `window-frame` plugin's
 *   window, its title the application's face and name.
 *
 * @module loop/apps/AppRenderer
 */

import { useMemo } from 'react';
import type { PluginRef, ReactorPlugin } from '@datalayer/reactor';
import type { AppSpec } from '../../types/agentspecs';
import { defineAgentCapacityPlugin } from '../plugins/agent-capacity';
import {
  APP_PAGE_SURFACE,
  defineAppPagePlugin,
  hasAppPage,
} from '../plugins/app-page';
import { LoopEmbed, type LoopEmbedProps } from '../embed/LoopEmbed';
import type { LoopPresetOptions } from '../presets';
import { dumpAppspec } from './appspec';
import type { PresenceState } from '../../chat/presence/presenceStatus';

/** The id of an agent or a Cog, without its version. */
export const agentIdOf = (app: Pick<AppSpec, 'agent' | 'team'>): string => {
  const reference = app.agent || app.team;
  const at = reference.lastIndexOf(':');
  return at > 0 && reference.slice(at + 1).includes('.')
    ? reference.slice(0, at)
    : reference;
};

/**
 * The plugin that makes a LOOP workspace run an application.
 *
 * The agent is created with the application's own document (`app_spec`) in
 * its payload; a runtime that knows applications configures the agent from
 * it, and one that does not creates the agent alone — the application is
 * then shown and not enforced, which is why a hosted application only runs
 * on a runtime that does.
 *
 * An application run by a team is not supported in the workspace yet: a team
 * is not an agent spec, and is refused here rather than launched as one.
 */
export function defineAppPlugin(
  app: AppSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  if (!app.agent) {
    throw new Error(
      `“${app.name}” is run by a team, which the workspace does not run as an application yet.`,
    );
  }
  return defineAgentCapacityPlugin({
    key: `app-${app.id}`,
    displayName: app.name,
    description: app.description || `The ${app.name} application`,
    specId: agentIdOf(app),
    emoji: app.emoji,
    createPayload: {
      name: app.id,
      app_spec: dumpAppspec(app),
      ...(app.model ? { model: app.model } : {}),
    },
    suggestions: app.interface.starters.map(starter => ({
      text: starter.label,
      message: starter.message,
    })),
  });
}

/** Which instance of an application runs, as the platform knows it (LOOP R-07). */
export type AppInstance = {
  /** Its `app` item. */
  appUid?: string;
  /** The deployment it runs as, when it is one. */
  deploymentUid?: string;
  /** The version that runs. */
  version?: number;
};

export type AppRendererProps = Omit<LoopEmbedProps, 'agentId'> & {
  /** The application to render. */
  app: AppSpec;
  /** What its record is kept under, on Datalayer: the application, its deployment. */
  instance?: AppInstance;
  /**
   * Told what the application is doing — idle, thinking, working, waiting for
   * you — for a host that draws its face in a frame of its own (T-08). A
   * stable function, such as a state setter.
   */
  onPresence?: (state: PresenceState) => void;
  /**
   * Draw the application in a window (the `window-frame` plugin), its title
   * the application's face and name. A host's own `frameTitle` wins.
   */
  frame?: boolean;
};

/** What `interface.layout` sets on the workspace. */
export type AppLayoutOptions = Pick<
  LoopPresetOptions,
  | 'editors'
  | 'showViewSelector'
  | 'defaultEditor'
  | 'pageLayout'
  | 'pageLayoutArrangement'
  | 'pageLayoutPrompt'
  | 'pageLayoutPromptAnchor'
  | 'pageLayoutTurnPanelFooter'
>;

/**
 * The workspace an application's layout asks for (LOOP T-07).
 *
 * - `chat`: the conversation alone — no editor, no page, no strip.
 * - `page`: the page layout — its page (or, without one, the editors) on the
 *   sheet; the composer a card over it, starting at the bottom, whose display
 *   modes put it in the conversation panel beside, over or in the corner of
 *   the page; the current turn under the composer, its copy and dismiss only.
 * - `split`: the page layout's split — the conversation on the left with its
 *   composer, the page on the right, a hairline between them to drag.
 *
 * With a page, the page is the one editor, opened, without a strip to swap
 * it; without one (a decision, whose page is the Studio's), the editors stay.
 */
export function appLayoutOptions(
  app: Pick<AppSpec, 'kind' | 'interface' | 'agent'>,
): AppLayoutOptions {
  const layout = app.interface.layout;
  if (layout === 'chat') {
    return { editors: false, showViewSelector: false };
  }
  const withPage = hasAppPage(app);
  return {
    editors: !withPage,
    showViewSelector: !withPage,
    ...(withPage ? { defaultEditor: APP_PAGE_SURFACE } : {}),
    pageLayout: true,
    pageLayoutArrangement: layout === 'split' ? 'split' : 'page',
    pageLayoutPrompt: 'floating',
    pageLayoutPromptAnchor: 'bottom',
    pageLayoutTurnPanelFooter: 'actions',
  };
}

/**
 * What an application's agent is created with on a Datalayer runtime: under
 * the application's id, over AG-UI, with the application's own document —
 * so that the runtime registers it and decides every tool call by its rules
 * (LOOP R-03, R-05), as `loop apps run --cloud` does. One payload for every
 * place it runs: the workspace (`AppRenderer`) and the embed's floating
 * modes (`AppEmbed`).
 */
export function appDatalayerCreatePayload(
  app: AppSpec,
  instance?: AppInstance,
): Record<string, unknown> {
  return {
    // Under the application's id, over AG-UI: what the workspace's
    // chat addresses (`AppRenderer` gives it as `agentId`).
    name: app.id,
    transport: 'ag-ui',
    agent_spec_id: agentIdOf(app),
    app_spec: dumpAppspec(app),
    // Code Mode calls every tool through `execute_code`, which an
    // application without a shell is refused: its tools are called
    // one by one instead, each decided by its rules.
    enable_codemode: Boolean(app.permissions?.computer?.shell),
    ...(instance
      ? {
          app_instance: {
            app_uid: instance.appUid ?? '',
            deployment_uid: instance.deploymentUid ?? '',
            version: instance.version ?? 0,
          },
        }
      : {}),
  };
}

/**
 * An application in a LOOP workspace: its agent, its starters, its layout.
 *
 * Every other prop is `LoopEmbed`'s, and wins over what the application
 * implies — a host that wants the editors beside a chat still says so.
 */
/** No host plugins: one array, so that it never reads as a change. */
/** The agentspec a runtime is allocated with before an application's agent is created on it. */
export const DATALAYER_BOOTSTRAP_AGENTSPEC = 'example-simple';

const NO_PLUGINS: PluginRef[] = [];

export function AppRenderer({
  app,
  plugins = NO_PLUGINS,
  instance,
  onPresence,
  frame = false,
  ...embed
}: AppRendererProps): React.JSX.Element {
  /*
   * The application plugin, made once per application. `LoopEmbed` rebuilds
   * its whole reactor when its plugins change, so a new plugin on every
   * render of the host would restart the running workspace. The key is the
   * application as its file holds it: a change to it is a new application.
   */
  const source = JSON.stringify(dumpAppspec(app));
  const appPlugin = useMemo(
    () => (app.agent ? defineAppPlugin(app) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source],
  );
  const withPage = hasAppPage(app);
  const pagePlugin = useMemo(
    () => (withPage ? defineAppPagePlugin(app) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, withPage],
  );
  const allPlugins = useMemo(
    () =>
      appPlugin
        ? [appPlugin, ...(pagePlugin ? [pagePlugin] : []), ...plugins]
        : plugins,
    [appPlugin, pagePlugin, plugins],
  );
  /*
   * On Datalayer, the application runs on a runtime: allocated with a plain
   * agentspec, its agent created there with the application's spec — so that
   * the runtime registers it and decides every tool call by its rules (LOOP
   * R-03, R-05), as `loop apps run --cloud` does.
   */
  const datalayerCreatePayload = useMemo(
    () => (app.agent ? appDatalayerCreatePayload(app, instance) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, instance?.appUid, instance?.deploymentUid, instance?.version],
  );
  if (!appPlugin) {
    return (
      <div role="status" style={{ padding: 16 }}>
        “{app.name}” is run by a team, which the workspace does not run as an
        application yet.
      </div>
    );
  }
  return (
    <LoopEmbed
      // The application's own agent: created under its id, so that its
      // spec is applied to an agent of its own, never to the one it extends.
      agentId={app.id}
      // Drawn as its layout says: the conversation alone, the page with
      // the conversation over it, or the two side by side.
      {...appLayoutOptions(app)}
      {...(frame
        ? {
            frameTitle: [app.emoji, app.name].filter(Boolean).join(' '),
          }
        : {})}
      teamPicker={false}
      showAgentVariants={false}
      graph={false}
      pluginsPanel={false}
      datalayerAgentSpecId={DATALAYER_BOOTSTRAP_AGENTSPEC}
      // Where an application runs is decided by its host — the Studio's
      // Preview, the hosted page — not offered to its user.
      targetFixed
      // Applications first (LOOP T-12): an application's conversation wears
      // the `loop` theme; a host may say otherwise.
      themeVariant="loop"
      // Its own face, name and welcome in the chat (T-08); no counters: a
      // person using an application is not asking about tokens.
      presence={{
        name: app.name,
        face: app.emoji,
        welcome: app.interface.welcome || app.description,
        onPresence,
      }}
      showTokenUsage={false}
      datalayerCreatePayload={datalayerCreatePayload}
      {...embed}
      plugins={allPlugins}
    />
  );
}

export default AppRenderer;
