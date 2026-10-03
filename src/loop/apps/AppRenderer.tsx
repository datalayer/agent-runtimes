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
 * - the **layout of its kind**: a chat is the conversation alone, with the
 *   A2UI surfaces its answers draw; the other layouts keep the editors.
 *
 * @module loop/apps/AppRenderer
 */

import { useMemo } from 'react';
import type { PluginRef, ReactorPlugin } from '@datalayer/reactor';
import type { AppSpec } from '../../types/agentspecs';
import { defineAgentCapacityPlugin } from '../plugins/agent-capacity';
import { LoopEmbed, type LoopEmbedProps } from '../embed/LoopEmbed';
import { dumpAppspec } from './appspec';

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

export type AppRendererProps = Omit<LoopEmbedProps, 'agentId'> & {
  /** The application to render. */
  app: AppSpec;
};

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
  ...embed
}: AppRendererProps): React.JSX.Element {
  const chatOnly = app.interface.layout === 'chat';
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
  const allPlugins = useMemo(
    () => (appPlugin ? [appPlugin, ...plugins] : plugins),
    [appPlugin, plugins],
  );
  /*
   * On Datalayer, the application runs on a runtime: allocated with a plain
   * agentspec, its agent created there with the application's spec — so that
   * the runtime registers it and decides every tool call by its rules (LOOP
   * R-03, R-05), as `loop apps run --cloud` does.
   */
  const datalayerCreatePayload = useMemo(
    () =>
      app.agent
        ? {
            // Under the application's id, over AG-UI: what the workspace's
            // chat addresses (`agentId` below).
            name: app.id,
            transport: 'ag-ui',
            agent_spec_id: agentIdOf(app),
            app_spec: dumpAppspec(app),
            // Code Mode calls every tool through `execute_code`, which an
            // application without a shell is refused: its tools are called
            // one by one instead, each decided by its rules.
            enable_codemode: Boolean(app.permissions?.computer?.shell),
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source],
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
      editors={!chatOnly}
      showViewSelector={!chatOnly}
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
      datalayerCreatePayload={datalayerCreatePayload}
      {...embed}
      plugins={allPlugins}
    />
  );
}

export default AppRenderer;
