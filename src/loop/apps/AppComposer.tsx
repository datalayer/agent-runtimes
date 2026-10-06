/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's commands and modes in the composer (LOOP P-19).
 *
 * - Each of its **commands** is a workspace command (`LoopCommand`), listed
 *   in the composer's `/` menu (`composer`): picking it writes `/<name> `,
 *   and sending runs it — its prompt goes to the agent, the words typed
 *   after it in place of `{input}`.
 * - Its **modes** are switches beside the composer (`LoopSlots.promptAction`),
 *   one menu each; the option picked goes with every run as
 *   `forwardedProps.loop.modes` (`LoopRunProps`), and the runtime tells the
 *   agent its instructions, on the model it names, for that run.
 *
 * @module loop/apps/AppComposer
 */

import type { JSX } from 'react';
import { ActionList, ActionMenu } from '@primer/react';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import type { AppSpec } from '../../types/agentspecs';
import { LoopCommand, LoopRunProps, LoopSlots } from '../core';
import { commandPrompt, modeChoice, modeDefaults } from './composer';

/** The plugin's name, before the application's id. */
export const APP_COMPOSER_PLUGIN_NAME = '@datalayer/loop-plugin-app-composer';

/**
 * The plugin that puts an application's commands in the composer's `/` menu
 * and its modes beside the composer. Nothing for an application with
 * neither: its plugin contributes nothing.
 */
export function defineAppComposerPlugin(app: AppSpec) {
  const modes = app.interface.modes ?? [];
  /** The option of each mode the person is in. */
  const chosen = signal<Record<string, string>>(modeDefaults(app));

  function ModeSwitches(): JSX.Element | null {
    const now = useSignalValue(chosen);
    return (
      <>
        {modes.map(mode => {
          const on =
            mode.options.find(option => option.id === now[mode.id]) ??
            mode.options[0];
          return (
            <ActionMenu key={mode.id}>
              <ActionMenu.Button
                size="small"
                variant="invisible"
                aria-label={`${mode.label}: ${on.label}`}
              >
                {mode.label}: {on.label}
              </ActionMenu.Button>
              <ActionMenu.Overlay width="medium">
                <ActionList selectionVariant="single">
                  <ActionList.Group>
                    <ActionList.GroupHeading>
                      {mode.label}
                    </ActionList.GroupHeading>
                    {mode.options.map(option => (
                      <ActionList.Item
                        key={option.id}
                        selected={option.id === on.id}
                        onSelect={() => {
                          chosen.value = modeChoice(app, {
                            ...chosen.peek(),
                            [mode.id]: option.id,
                          });
                        }}
                      >
                        {option.label}
                        {option.description ? (
                          <ActionList.Description variant="block">
                            {option.description}
                          </ActionList.Description>
                        ) : null}
                      </ActionList.Item>
                    ))}
                  </ActionList.Group>
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          );
        })}
      </>
    );
  }

  return definePlugin({
    name: `${APP_COMPOSER_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: commands and modes`,
    description: `The commands and modes ${app.name} offers in its composer.`,
    octicon: 'command-palette',
    emoji: '\u{2318}',
    contributes: [
      ...(app.interface.commands ?? []).map(command =>
        contribution(
          LoopCommand,
          {
            name: command.name,
            description: command.description,
            group: app.name,
            composer: true,
            run: async ({ argv }) => ({ prompt: commandPrompt(command, argv) }),
          },
          { id: `app-command-${command.name}` },
        ),
      ),
      ...(modes.length > 0
        ? [
            contribution(
              LoopRunProps,
              {
                id: 'app-modes',
                props: () => ({ loop: { modes: { ...chosen.peek() } } }),
              },
              { id: 'app-modes' },
            ),
          ]
        : []),
    ],
    build: () => ({
      components:
        modes.length > 0
          ? [
              {
                id: 'app-modes',
                slot: LoopSlots.promptAction,
                order: 5,
                Component: ModeSwitches,
              },
            ]
          : [],
    }),
  });
}
