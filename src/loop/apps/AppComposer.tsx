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
 * - What a person may **send** without being asked (LOOP P-21,
 *   `interface.uploads`): a paper clip beside the composer takes images,
 *   files and recordings of the kinds and sizes the Appspec says — one it
 *   does not take is refused in a sentence and never read — and the files
 *   held go with the next message as `forwardedProps.loop.files`, then are
 *   let go. The runtime refuses again what was sent all the same.
 *
 * @module loop/apps/AppComposer
 */

import { useRef, type JSX } from 'react';
import { ActionList, ActionMenu, IconButton, Text, Token } from '@primer/react';
import { PaperclipIcon } from '@primer/octicons-react';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import type { AppSpec } from '../../types/agentspecs';
import {
  readFile,
  type GivenFile,
} from '../../components/a2ui/datalayer/FileUpload';
import { LoopCommand, LoopRunProps, LoopSlots } from '../core';
import { commandPrompt, modeChoice, modeDefaults } from './composer';
import { uploadsAccept, uploadsInWords, uploadsRefusal } from './uploads';

/** What the composer holds to send: the files, and why the last were refused. */
export type HeldUploads = { files: GivenFile[]; refused: string | null };

/**
 * Files chosen in the composer, held for the next message: the refusal the
 * runtime would say for what the application does not take, else the files
 * read. Nothing is read when one is refused.
 */
export async function holdUploads(
  app: Pick<AppSpec, 'name' | 'interface'>,
  held: readonly GivenFile[],
  chosen: readonly File[],
  read: (file: File) => Promise<GivenFile> = readFile,
): Promise<HeldUploads> {
  const refused = uploadsRefusal(app, [
    ...held,
    ...chosen.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
  ]);
  if (refused) {
    return { files: [...held], refused };
  }
  return {
    files: [...held, ...(await Promise.all(chosen.map(read)))],
    refused: null,
  };
}

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

  const uploads = app.interface.uploads;
  /** The files held for the next message, and the last refusal (P-21). */
  const held = signal<HeldUploads>({ files: [], refused: null });

  function Attach(): JSX.Element | null {
    const now = useSignalValue(held);
    const input = useRef<HTMLInputElement>(null);
    if (!uploads) {
      return null;
    }
    return (
      <>
        <IconButton
          icon={PaperclipIcon}
          size="small"
          variant="invisible"
          aria-label={`Attach a file. ${uploadsInWords(uploads)}`}
          onClick={() => input.current?.click()}
        />
        <input
          ref={input}
          type="file"
          hidden
          multiple={uploads.maxFiles > 1}
          accept={uploadsAccept(uploads)}
          aria-label="Attach a file"
          onChange={event => {
            const chosen = Array.from(event.target.files ?? []);
            event.target.value = '';
            void holdUploads(app, held.peek().files, chosen).then(next => {
              held.value = next;
            });
          }}
        />
        {now.files.map(file => (
          <Token
            key={file.name}
            text={file.name}
            size="small"
            onRemove={() => {
              held.value = {
                files: held.peek().files.filter(kept => kept !== file),
                refused: null,
              };
            }}
          />
        ))}
        {now.refused ? (
          <Text role="alert" sx={{ fontSize: 0, color: 'danger.fg' }}>
            {now.refused}
          </Text>
        ) : null}
      </>
    );
  }

  return definePlugin({
    name: `${APP_COMPOSER_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: commands, modes and uploads`,
    description: `The commands, modes and files ${app.name} takes in its composer.`,
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
      ...(uploads
        ? [
            contribution(
              LoopRunProps,
              {
                id: 'app-uploads',
                // The files held go with this message, once, and are let go.
                props: () => {
                  const files = held.peek().files;
                  if (files.length === 0) {
                    return {};
                  }
                  held.value = { files: [], refused: null };
                  return { loop: { files } };
                },
              },
              { id: 'app-uploads' },
            ),
          ]
        : []),
    ],
    build: () => ({
      components: [
        ...(modes.length > 0
          ? [
              {
                id: 'app-modes',
                slot: LoopSlots.promptAction,
                order: 5,
                Component: ModeSwitches,
              },
            ]
          : []),
        ...(uploads
          ? [
              {
                id: 'app-uploads',
                slot: LoopSlots.promptAction,
                order: 4,
                Component: Attach,
              },
            ]
          : []),
      ],
    }),
  });
}
