/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-commands` — the workspace's commands, in the palette.
 *
 * A thin adapter over the reusable `@datalayer/reactor-commands`: that plugin
 * draws a Ctrl-K palette over the reactor's command registry and knows nothing
 * about a workspace, and this one puts the workspace's commands into that
 * registry. Keeping them apart is what lets the palette stay generic — it is
 * the same palette in a music store and in an agent workspace.
 *
 * Every command a plugin already contributes to {@link LoopCommand} appears,
 * rather than each plugin declaring its actions twice. A slash command and a
 * palette entry are the same intent reached two ways, and a plugin that wrote
 * them separately would eventually have them disagree — a `/models` that shows
 * something the palette's *Show the models* does not.
 *
 * What it cannot do from a plugin phase is know which workspace is on screen,
 * because that is built during render. So the registration is driven by a
 * component: it reads the contributions and the workspace it was handed, and
 * re-registers when either changes.
 *
 * @module loop/plugins/commands
 */

import { useEffect } from 'react';
import { definePlugin, type Dispose } from '@datalayer/reactor';
import type { Contribution } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { useContributions } from '@datalayer/reactor/react';
import { CommandsPlugin } from '@datalayer/reactor-commands';
import { ThemePlugin } from '@datalayer/primer-addons/lib/reactor';
import {
  LoopCommand,
  LoopSlots,
  type CommandContribution,
  type LoopWorkspaceContext,
} from '../../core';

export const COMMANDS_PLUGIN_NAME = '@datalayer/loop-plugin-commands';

/** How a slash command's group becomes a palette category. */
const DEFAULT_CATEGORY = 'Workspace';

/**
 * Emoji per group, so the palette has something to show for commands that
 * predate it. A slash command never needed one — `/help` prints text — and
 * backfilling a field onto every contribution to satisfy a surface added
 * later is how a shared type acquires a column that means "for the palette".
 */
const GROUP_EMOJI: Record<string, string> = {
  Agents: '\u{1F916}',
  Open: '\u{1F4C2}',
  Session: '\u{1F9ED}',
  Workspace: '\u{1FA9F}',
};

export type LoopCommandBridgeProps = {
  /** Handed by the slot; the commands run against it. */
  workspace?: LoopWorkspaceContext;
  /** Registers the current set, and returns what undoes it. */
  sync: (
    commands: Contribution<CommandContribution>[],
    workspace: LoopWorkspaceContext | undefined,
  ) => void;
};

/**
 * Renders nothing; keeps the registry in step with the contributions.
 *
 * A component rather than a one-off registration in `register`, because
 * contributions arrive as plugins activate — a plugin switched on from the
 * sidebar has to show up in the palette without a reload.
 */
export function LoopCommandBridge({
  workspace,
  sync,
}: LoopCommandBridgeProps): null {
  const commands = useContributions(LoopCommand);
  useEffect(() => {
    sync(commands, workspace);
  }, [commands, workspace, sync]);
  return null;
}

export const LoopCommandsPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: COMMANDS_PLUGIN_NAME,
  displayName: 'Command palette',
  description:
    'Puts the workspace commands in a Ctrl-K palette, beside every plugin that registers one.',
  octicon: 'command-palette',
  emoji: '\u{2318}',
  // The generic palette is pulled in rather than assumed: mounting this one is
  // enough, whether or not the host remembered the other. The theme plugin
  // rides along for the same reason: it is what creates the themed portal
  // root the palette renders into — and keeps its color mode following the
  // application, which the old inline `setupPrimerPortals()` call never did.
  dependencies: [CommandsPlugin, ThemePlugin],
  build: ctx => {
    /** What each contribution's registration undoes, by command name. */
    const registered = new Map<string, Dispose>();

    /*
     * What was registered last time, so an unchanged set is left alone.
     *
     * Registering and disposing both move the reactor's revision, and the
     * revision is what `useContributions` re-reads on — so a sync that always
     * re-registers wakes the component that called it, which syncs again, for
     * ever. React reports it as "Maximum update depth exceeded", several frames
     * away from the cause.
     */
    let signature = '';
    let lastWorkspace: LoopWorkspaceContext | undefined;

    const sync = (
      commands: Contribution<CommandContribution>[],
      workspace: LoopWorkspaceContext | undefined,
    ) => {
      const next = workspace
        ? commands.map(entry => `${entry.plugin}:${entry.value.name}`).join('|')
        : '';
      if (next === signature && workspace === lastWorkspace) {
        return;
      }
      signature = next;
      lastWorkspace = workspace;

      // Re-registered wholesale rather than diffed: the palette has to invoke
      // against the *current* workspace, so a command registered against a
      // previous one is wrong even when its contribution has not changed.
      for (const dispose of registered.values()) {
        dispose();
      }
      registered.clear();

      if (!workspace) {
        // Nothing to run against. Registering commands that would throw the
        // moment they are chosen is worse than an empty palette.
        return;
      }

      for (const entry of commands) {
        const command = entry.value;
        const group = command.group ?? DEFAULT_CATEGORY;
        registered.set(
          command.name,
          ctx.registerCommand({
            // Namespaced, because a palette is shared with every other plugin
            // and `chat` is not a name anyone else has to avoid.
            id: `loop.${command.name}`,
            name: command.description,
            // The slash form is what a person may already know it by, so it is
            // worth showing beside the description rather than instead of it.
            description: `/${command.name}`,
            emoji: GROUP_EMOJI[group] ?? '\u{1F4A0}',
            category: group,
            // Carried through rather than invented here: a shortcut belongs to
            // the plugin that knows what the command does.
            keybinding: command.keybinding,
            // Slash commands take their arguments as text after the name; the
            // palette has no argument to give, so they run with none. A command
            // that needs one says so when it runs.
            execute: async () => {
              await command.run({ workspace, argv: '' });
            },
          }),
        );
      }
    };

    return {
      components: [
        {
          id: 'loop-command-bridge',
          // Rendered where the workspace already passes itself down, and
          // invisible: the palette is the surface, this only feeds it.
          slot: LoopSlots.status,
          Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
            <LoopCommandBridge workspace={workspace} sync={sync} />
          ),
        },
      ],
    };
  },
});

export default LoopCommandsPlugin;
