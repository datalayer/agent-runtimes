/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Commands and modes in the composer (LOOP P-19), as rules: what a command
 * sends, and which option of each mode a run is in. agentspecs' own
 * (`command_prompt`, `AppInterface.mode_choice`), said again for the page.
 *
 * Pure: no React, no network.
 *
 * @module loop/apps/composer
 */

import type { AppCommandSpec, AppSpec } from '../../types/agentspecs';

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
