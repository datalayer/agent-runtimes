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

import type { ReactorPlugin } from '@datalayer/reactor';
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
 */
export function defineAppPlugin(
  app: AppSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
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
export function AppRenderer({
  app,
  plugins = [],
  ...embed
}: AppRendererProps): React.JSX.Element {
  const chatOnly = app.interface.layout === 'chat';
  return (
    <LoopEmbed
      agentId={agentIdOf(app)}
      editors={!chatOnly}
      showViewSelector={!chatOnly}
      teamPicker={false}
      showAgentVariants={false}
      graph={false}
      pluginsPanel={false}
      {...embed}
      plugins={[defineAppPlugin(app), ...plugins]}
    />
  );
}

export default AppRenderer;
