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
 * - Its **profiles** (LOOP P-20, `interface.profiles`): a picker beside the
 *   composer, on the first unless another is picked. The profile picked goes
 *   with every run as `forwardedProps.loop.profile`, and its starters (else
 *   the application's) are what the empty chat offers, by category
 *   (`LoopChatExtras.openers`). Once the first message is sent, the
 *   conversation keeps its profile: the picker says so and picks no other.
 *
 * Given the application as the person reads it (`translatedAppspec`, LOOP
 * P-26), its words are theirs; the composer's own, `language`'s.
 *
 * @module loop/apps/AppComposer
 */

import { useRef, type JSX } from 'react';
import { ActionList, ActionMenu, IconButton, Text, Token } from '@primer/react';
import { PaperclipIcon } from '@primer/octicons-react';
import {
  computed,
  contribution,
  definePlugin,
  signal,
} from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';
import type { AppSpec, AppStarterSpec } from '../../types/agentspecs';
import {
  readFile,
  type GivenFile,
} from '../../components/a2ui/datalayer/FileUpload';
import {
  LoopChatExtras,
  LoopCommand,
  LoopRunProps,
  LoopSlots,
  type ChatSuggestionItem,
  type LoopChatExtrasValue,
} from '../core';
import {
  commandPrompt,
  modeChoice,
  modeDefaults,
  profileChoice,
  startersFor,
} from './composer';
import { DEFAULT_LANGUAGE } from './appspec';
import { interfaceWords } from './language';
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

/** Starters as the empty chat offers them: each under its category (P-20). */
export function startersAsOpeners(
  starters: readonly AppStarterSpec[],
): ChatSuggestionItem[] {
  return starters.map(starter => ({
    text: starter.label,
    message: starter.message,
    ...(starter.category ? { group: starter.category } : {}),
  }));
}

/**
 * Whether an application needs its composer plugin: commands, modes,
 * uploads or profiles to offer there.
 */
export const needsAppComposer = (app: AppSpec): boolean =>
  (app.interface.commands ?? []).length > 0 ||
  (app.interface.modes ?? []).length > 0 ||
  (app.interface.profiles ?? []).length > 0 ||
  Boolean(app.interface.uploads);

/**
 * The plugin that puts an application's commands in the composer's `/` menu
 * and its modes, its profiles and its paper clip beside the composer.
 * Nothing for an application with none: its plugin contributes nothing.
 */
export function defineAppComposerPlugin(app: AppSpec) {
  const words = interfaceWords(app.interface.language ?? DEFAULT_LANGUAGE);
  const profiles = app.interface.profiles ?? [];
  /** The profile picked, and whether the conversation has started with it. */
  const profile = signal<string | undefined>(profileChoice(app)?.id);
  const started = signal(false);
  const openers = computed<LoopChatExtrasValue>(() => ({
    openers: startersAsOpeners(startersFor(app, profile.value)),
  }));

  function ProfilePicker(): JSX.Element | null {
    const now = profileChoice(app, useSignalValue(profile));
    const kept = useSignalValue(started);
    if (!now) {
      return null;
    }
    const said = `${words.profile}: ${now.label}`;
    if (kept) {
      return (
        <Text
          title={`${said} (${words.profileKept})`}
          sx={{ fontSize: 0, color: 'fg.muted', px: 2 }}
        >
          {said}
        </Text>
      );
    }
    return (
      <ActionMenu>
        <ActionMenu.Button size="small" variant="invisible" aria-label={said}>
          {said}
        </ActionMenu.Button>
        <ActionMenu.Overlay width="medium">
          <ActionList selectionVariant="single">
            <ActionList.Group>
              <ActionList.GroupHeading>{words.profile}</ActionList.GroupHeading>
              {profiles.map(item => (
                <ActionList.Item
                  key={item.id}
                  selected={item.id === now.id}
                  onSelect={() => {
                    profile.value = profileChoice(app, item.id)?.id;
                  }}
                >
                  {item.label}
                  {item.description ? (
                    <ActionList.Description variant="block">
                      {item.description}
                    </ActionList.Description>
                  ) : null}
                </ActionList.Item>
              ))}
            </ActionList.Group>
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
    );
  }

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
          aria-label={`${words.attach}. ${uploadsInWords(uploads)}`}
          onClick={() => input.current?.click()}
        />
        <input
          ref={input}
          type="file"
          hidden
          multiple={uploads.maxFiles > 1}
          accept={uploadsAccept(uploads)}
          aria-label={words.attach}
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
    displayName: `${app.name}: commands, modes, profiles and uploads`,
    description: `The commands, modes, profiles and files ${app.name} takes in its composer.`,
    octicon: 'command-palette',
    emoji: '\u{2318}',
    contributes: [
      ...(profiles.length > 0
        ? [
            contribution(
              LoopRunProps,
              {
                id: 'app-profile',
                // Sent with every run; from the first, the conversation keeps it.
                props: () => {
                  started.value = true;
                  return { loop: { profile: profile.peek() } };
                },
              },
              { id: 'app-profile' },
            ),
            contribution(
              LoopChatExtras,
              { id: 'app-profile-starters', extras: openers },
              { id: 'app-profile-starters' },
            ),
          ]
        : []),
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
        ...(profiles.length > 0
          ? [
              {
                id: 'app-profile',
                slot: LoopSlots.promptAction,
                order: 3,
                Component: ProfilePicker,
              },
            ]
          : []),
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
