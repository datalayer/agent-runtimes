/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Commands, modes and profiles in the composer (LOOP P-19, P-20), as rules:
 * what a command sends, which option of each mode a run is in, which profile
 * a conversation is with and what it offers. agentspecs' own
 * (`command_prompt`, `AppInterface.mode_choice`, `mode_effect`,
 * `profile_choice`, `starters_for`), said again for the page.
 *
 * Pure: no React, no network.
 *
 * @module loop/apps/composer
 */

import type {
  AppCommandSpec,
  AppModeEffect,
  AppProfileSpec,
  AppSpec,
  AppStarterSpec,
} from '../../types/agentspecs';

/** Where a command's prompt takes the words typed after it. */
export const COMMAND_INPUT = '{input}';

/** What follows the slash: lower-case letters, digits and hyphens, a letter first. */
export const COMMAND_NAME = /^[a-z](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** The id of a mode or of one of its options. */
export const MODE_ID = /^[a-z][a-z0-9_-]{0,39}$/;

/**
 * What a command sends: its prompt, the words typed after it in place of
 * `{input}` — or after the prompt, when it has no `{input}`.
 */
export function commandPrompt(
  command: Pick<AppCommandSpec, 'prompt'>,
  words = '',
): string {
  const said = words.trim();
  if (command.prompt.includes(COMMAND_INPUT)) {
    return command.prompt.split(COMMAND_INPUT).join(said).trim();
  }
  return said ? `${command.prompt}\n\n${said}` : command.prompt;
}

/** The option each mode starts on: its default, else its first. */
export function modeDefaults(
  app: Pick<AppSpec, 'interface'>,
): Record<string, string> {
  return Object.fromEntries(
    (app.interface.modes ?? [])
      .filter(mode => mode.options.length > 0)
      .map(mode => [mode.id, mode.default || mode.options[0].id]),
  );
}

/**
 * The option of every mode a run is in: what was chosen, else where each
 * starts. A mode or an option the application does not have is refused, in a
 * sentence, as the runtime refuses it.
 */
export function modeChoice(
  app: Pick<AppSpec, 'name' | 'interface'>,
  chosen: Record<string, string> = {},
): Record<string, string> {
  const modes = app.interface.modes ?? [];
  for (const [modeId, optionId] of Object.entries(chosen)) {
    const mode = modes.find(candidate => candidate.id === modeId);
    if (!mode) {
      throw new Error(`${app.name} has no mode “${modeId}”.`);
    }
    if (!mode.options.some(option => option.id === optionId)) {
      throw new Error(`The mode ${mode.label} has no option “${optionId}”.`);
    }
  }
  return { ...modeDefaults(app), ...chosen };
}

/**
 * The profile a conversation is with (LOOP P-20): the one chosen, else the
 * first; undefined for an application without profiles. One it does not have
 * is refused, in a sentence, as the runtime refuses it.
 */
export function profileChoice(
  app: Pick<AppSpec, 'name' | 'interface'>,
  chosen?: string,
): AppProfileSpec | undefined {
  const profiles = app.interface.profiles ?? [];
  if (chosen) {
    const profile = profiles.find(candidate => candidate.id === chosen);
    if (!profile) {
      throw new Error(
        profiles.length === 0
          ? `${app.name} has no profiles: “${chosen}” cannot be chosen.`
          : `${app.name} has no profile “${chosen}”.`,
      );
    }
    return profile;
  }
  return profiles[0];
}

/** The starters offered with a profile: its own, else the application's (P-20). */
export function startersFor(
  app: Pick<AppSpec, 'name' | 'interface'>,
  profile?: string,
): AppStarterSpec[] {
  const chosen = profileChoice(app, profile);
  return chosen && chosen.starters.length > 0
    ? chosen.starters
    : app.interface.starters;
}

/**
 * What a run in the modes chosen, with the profile chosen, is told, and the
 * model it runs on — agentspecs' `mode_effect`, and the runtime's
 * `run_effect`: the profile's instructions first, then those of every option
 * chosen, in the order of the modes; the model of the first option that
 * names one, else the profile's. Refused as {@link modeChoice} and
 * {@link profileChoice} refuse.
 */
export function modeEffect(
  app: Pick<AppSpec, 'name' | 'interface'>,
  chosen: Record<string, string> = {},
  profile?: string,
): AppModeEffect {
  const choice = modeChoice(app, chosen);
  const withProfile = profileChoice(app, profile);
  const options = (app.interface.modes ?? []).flatMap(mode =>
    mode.options.filter(option => option.id === choice[mode.id]),
  );
  const instructions = [
    withProfile?.instructions ?? '',
    ...options.map(option => option.instructions ?? ''),
  ]
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');
  const model =
    options.find(option => option.model)?.model ??
    withProfile?.model ??
    undefined;
  return model ? { instructions, model } : { instructions };
}
