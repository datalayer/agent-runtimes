/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's block on the Canvas: what a person meets
 * before they write — its face, its welcome, its suggested questions — and
 * what they may set, edited where they are seen.
 *
 * Every change is written into the fields the Appspec already has, and
 * nowhere else: `avatar` (the face), `interface.welcome`,
 * `interface.starters` (`label`, `message`), `interface.commands` and
 * `interface.modes` and `interface.settings` — the JSON Schema
 * of a form, each setting one of its fields: a choice (`enum`), words,
 * on or off, or a number (`minimum`, `maximum`), with its `title` and its
 * `default`. Each is edited here as a {@link ChatSetting} and written back as
 * its field, what else the field says kept. A setting's name is made once,
 * from its first label, and never changed after: the page reads it at
 * `/inputs/<name>`, and a renamed setting keeps what reads it.
 *
 * Pure: no React, no network.
 *
 * @module apps/composer/chatBlock
 */

import type {
  AppCommandSpec,
  AppFormField,
  AppFormSchema,
  AppModeOptionSpec,
  AppModeSpec,
  AppSpec,
  AppStarterSpec,
} from '../../types/agentspecs';

/** The kinds of setting a Maker picks from: each a kind of field of the settings' form. */
export type SettingType = 'select' | 'text' | 'toggle' | 'number';

/** A setting as the block edits it: one field of the settings' form. */
export type ChatSetting = {
  /** Its name in the form: what the application reads it by. */
  id: string;
  type: SettingType;
  /** Its field's `title`. */
  label: string;
  /** A choice's options: its field's `enum`. */
  options: string[];
  default?: string | boolean | number;
  /** A number's least and most: its field's `minimum` and `maximum`. */
  min?: number;
  max?: number;
};

/** The kinds of setting, in a Maker's words, in the order they are offered. */
export const SETTING_TYPES: Array<{ type: SettingType; says: string }> = [
  { type: 'select', says: 'A choice' },
  { type: 'text', says: 'Words' },
  { type: 'toggle', says: 'On or off' },
  { type: 'number', says: 'A number' },
];

/** A field of the settings' form as the block edits it. */
export function settingOfField(id: string, field: AppFormField): ChatSetting {
  const type: SettingType =
    field.type === 'boolean'
      ? 'toggle'
      : field.type === 'integer' || field.type === 'number'
        ? 'number'
        : Array.isArray(field.enum)
          ? 'select'
          : 'text';
  const setting: ChatSetting = {
    id,
    type,
    label: typeof field.title === 'string' ? field.title : '',
    options: type === 'select' ? (field.enum ?? []).map(String) : [],
  };
  if (['string', 'boolean', 'number'].includes(typeof field.default)) {
    setting.default = field.default as string | boolean | number;
  }
  if (type === 'number' && typeof field.minimum === 'number') {
    setting.min = field.minimum;
  }
  if (type === 'number' && typeof field.maximum === 'number') {
    setting.max = field.maximum;
  }
  return setting;
}

/** What the block edits of a field, written anew from a setting; the rest of the field kept. */
const EDITED = ['type', 'title', 'enum', 'default', 'minimum', 'maximum'];

/** A setting as its field of the settings' form, what else `before` said kept. */
export function fieldOfSetting(
  setting: ChatSetting,
  before: AppFormField = {},
): AppFormField {
  const field: AppFormField = Object.fromEntries(
    Object.entries(before).filter(([key]) => !EDITED.includes(key)),
  );
  field.type =
    setting.type === 'toggle'
      ? 'boolean'
      : setting.type === 'number'
        ? before.type === 'integer'
          ? 'integer'
          : 'number'
        : 'string';
  field.title = setting.label;
  if (setting.type === 'select') {
    field.enum = [...setting.options];
  }
  if (setting.type === 'number' && setting.min !== undefined) {
    field.minimum = setting.min;
  }
  if (setting.type === 'number' && setting.max !== undefined) {
    field.maximum = setting.max;
  }
  if (setting.default !== undefined) {
    field.default = setting.default;
  }
  return field;
}

/** The settings of a spec, as the block edits them, in the order its form says them. */
export function settingsOfSpec(spec: AppSpec): ChatSetting[] {
  const properties = spec.interface.settings?.properties ?? {};
  return Object.entries(properties).map(([id, field]) =>
    settingOfField(id, field),
  );
}

/** The settings written back as the settings' form; none when there is none left. */
function withSettings(spec: AppSpec, settings: ChatSetting[]): AppSpec {
  const before = spec.interface.settings;
  if (settings.length === 0) {
    const rest = { ...spec.interface };
    delete rest.settings;
    return { ...spec, interface: rest };
  }
  const ids = settings.map(setting => setting.id);
  const form: AppFormSchema = {
    ...(before ?? {}),
    type: 'object',
    properties: Object.fromEntries(
      settings.map(setting => [
        setting.id,
        fieldOfSetting(setting, before?.properties[setting.id]),
      ]),
    ),
  };
  if (before?.required) {
    form.required = before.required.filter(id => ids.includes(id));
  }
  return withInterface(spec, { settings: form });
}

/** The most suggested questions a chat offers: the chat block draws six. */
export const MAX_STARTERS = 6;

/** The block's words, in one place for the page and its test. */
export const CHAT_BLOCK_WORDS = {
  heading: 'The chat',
  about: 'What a person meets before they write. Click any part to change it.',
  face: 'Its face',
  welcome: 'What it says first',
  welcomeEmpty: 'It says nothing first: its description stands in.',
  starters: 'Suggested questions',
  startersAbout:
    'Offered as buttons before the first message. The button says its label; choosing it sends its message.',
  starterLabel: 'Button',
  starterMessage: 'Sends',
  addStarter: 'Add a suggested question',
  settings: 'What a person may set',
  settingsAbout:
    'Shown beside the chat. The application reads each one by the name it was first given.',
  settingLabel: 'Name',
  settingType: 'Set with',
  settingOptions: 'Choices, one per line',
  settingDefault: 'At the start',
  settingMin: 'Least',
  settingMax: 'Most',
  addSetting: 'Add a setting',
  commands: 'Commands',
  commandsAbout:
    'Typing / in the chat lists them. Choosing one sends its prompt; {input} stands for the words written after the command.',
  commandName: 'After the slash',
  commandDescription: 'What the list says',
  commandPrompt: 'Sends',
  addCommand: 'Add a command',
  modes: 'Modes',
  modesAbout:
    'A switch beside the chat. The option chosen goes with every message: the agent is told its instructions.',
  modeLabel: 'Called',
  modeDefault: 'Starts on',
  modeOptions: 'Its options, one per line',
  optionLabel: 'Option',
  optionInstructions: 'The agent is told',
  addOption: 'Add an option',
  addMode: 'Add a mode',
} as const;

/** The parts of a chat a person meets first, as its spec holds them. */
export type ChatBlock = {
  welcome: string;
  starters: AppStarterSpec[];
  commands: AppCommandSpec[];
  modes: AppModeSpec[];
  settings: ChatSetting[];
  avatar: string;
};

/** What a chat's spec says it shows first. */
export function chatBlockOf(spec: AppSpec): ChatBlock {
  return {
    welcome: spec.interface.welcome ?? '',
    starters: spec.interface.starters ?? [],
    commands: spec.interface.commands ?? [],
    modes: spec.interface.modes ?? [],
    settings: settingsOfSpec(spec),
    avatar: spec.avatar ?? '',
  };
}

const withInterface = (
  spec: AppSpec,
  patch: Partial<AppSpec['interface']>,
): AppSpec => ({
  ...spec,
  interface: { ...spec.interface, ...patch },
});

/** Its face: one of the drawings people choose from. */
export const writeAvatar = (spec: AppSpec, avatar: string): AppSpec => ({
  ...spec,
  avatar,
});

/** What it says first. */
export const writeWelcome = (spec: AppSpec, welcome: string): AppSpec =>
  withInterface(spec, { welcome });

/** One item of a list moved by one place; refused past either end. */
function moved<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) {
    throw new Error('It is already at that end.');
  }
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

const at = <T>(items: T[], index: number): T => {
  if (index < 0 || index >= items.length) {
    throw new Error(`There is no item ${index + 1}.`);
  }
  return items[index];
};

/** A suggested question added: refused without both its words, or past six. */
export function addStarter(spec: AppSpec, starter: AppStarterSpec): AppSpec {
  const starters = spec.interface.starters ?? [];
  const label = starter.label.trim();
  const message = starter.message.trim();
  if (!label || !message) {
    throw new Error(
      'A suggested question needs the words on its button and the message it sends.',
    );
  }
  if (starters.length >= MAX_STARTERS) {
    throw new Error(
      `A chat offers at most ${MAX_STARTERS} suggested questions.`,
    );
  }
  if (
    starters.some(
      other => other.label.trim().toLowerCase() === label.toLowerCase(),
    )
  ) {
    throw new Error(`There is already a suggested question “${label}”.`);
  }
  return withInterface(spec, { starters: [...starters, { label, message }] });
}

/** A suggested question changed in place. */
export function writeStarter(
  spec: AppSpec,
  index: number,
  patch: Partial<AppStarterSpec>,
): AppSpec {
  const starters = spec.interface.starters ?? [];
  const next = { ...at(starters, index), ...patch };
  return withInterface(spec, {
    starters: starters.map((starter, i) => (i === index ? next : starter)),
  });
}

export const removeStarter = (spec: AppSpec, index: number): AppSpec => {
  const starters = spec.interface.starters ?? [];
  at(starters, index);
  return withInterface(spec, {
    starters: starters.filter((_, i) => i !== index),
  });
};

export const moveStarter = (
  spec: AppSpec,
  index: number,
  delta: -1 | 1,
): AppSpec =>
  withInterface(spec, {
    starters: moved(spec.interface.starters ?? [], index, delta),
  });

/**
 * The name a new setting is read by: its label in lower-case letters, digits
 * and underscores, unique among the others.
 */
export function settingIdOf(label: string, taken: string[]): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'setting';
  let id = /^[a-z]/.test(base) ? base : `setting_${base}`;
  for (let n = 2; taken.includes(id); n += 1) {
    id = `${base}_${n}`;
  }
  return id;
}

/** What a new setting of a type starts at. */
export function newSetting(
  label: string,
  type: SettingType,
  taken: string[],
): ChatSetting {
  const words = label.trim();
  if (!words) {
    throw new Error('A setting needs the name a person reads.');
  }
  const setting: ChatSetting = {
    id: settingIdOf(words, taken),
    type,
    label: words,
    options: [],
  };
  if (type === 'toggle') {
    setting.default = false;
  }
  return setting;
}

export function addSetting(
  spec: AppSpec,
  label: string,
  type: SettingType,
): AppSpec {
  const settings = settingsOfSpec(spec);
  if (
    settings.some(
      other => other.label.trim().toLowerCase() === label.trim().toLowerCase(),
    )
  ) {
    throw new Error(`There is already a setting “${label.trim()}”.`);
  }
  const setting = newSetting(
    label,
    type,
    settings.map(other => other.id),
  );
  return withSettings(spec, [...settings, setting]);
}

/**
 * A setting changed in place. Its name is never changed here; a change of
 * type keeps only what the new type reads.
 */
export function writeSetting(
  spec: AppSpec,
  index: number,
  patch: Partial<Omit<ChatSetting, 'id'>>,
): AppSpec {
  const settings = settingsOfSpec(spec);
  const before = at(settings, index);
  let next: ChatSetting = { ...before, ...patch, id: before.id };
  for (const key of ['default', 'min', 'max'] as const) {
    if (key in patch && patch[key] === undefined) {
      delete next[key];
    }
  }
  if (patch.type && patch.type !== before.type) {
    // What the new type starts at, its choices kept only by a choice.
    const fresh = newSetting(next.label.trim() || 'setting', patch.type, []);
    next = {
      ...fresh,
      id: before.id,
      label: next.label,
      options: patch.type === 'select' ? next.options : [],
    };
  }
  return withSettings(
    spec,
    settings.map((setting, i) => (i === index ? next : setting)),
  );
}

export const removeSetting = (spec: AppSpec, index: number): AppSpec => {
  const settings = settingsOfSpec(spec);
  at(settings, index);
  return withSettings(
    spec,
    settings.filter((_, i) => i !== index),
  );
};

export const moveSetting = (
  spec: AppSpec,
  index: number,
  delta: -1 | 1,
): AppSpec => withSettings(spec, moved(settingsOfSpec(spec), index, delta));

/** What follows the slash: lower-case letters, digits and hyphens, a letter first. */
export const COMMAND_NAME = /^[a-z](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** A command's name as typed: the slash and the case dropped, spaces as hyphens. */
export const commandNameOf = (typed: string): string =>
  typed.trim().replace(/^\/+/, '').toLowerCase().replace(/\s+/g, '-');

/** A command added: refused without its words, with a name that is not slash-safe, or one said already. */
export function addCommand(spec: AppSpec, command: AppCommandSpec): AppSpec {
  const commands = spec.interface.commands ?? [];
  const name = commandNameOf(command.name);
  const description = command.description.trim();
  const prompt = command.prompt.trim();
  if (!name || !description || !prompt) {
    throw new Error(
      'A command needs what follows the slash, what the list says, and what it sends.',
    );
  }
  if (!COMMAND_NAME.test(name)) {
    throw new Error(
      `“/${name}” cannot be typed after a slash: small letters, digits and hyphens, a letter first.`,
    );
  }
  if (commands.some(other => other.name === name)) {
    throw new Error(`There is already a command /${name}.`);
  }
  return withInterface(spec, {
    commands: [...commands, { name, description, prompt }],
  });
}

/** A command changed in place; its name is changed by removing it and adding it again. */
export function writeCommand(
  spec: AppSpec,
  index: number,
  patch: Partial<Omit<AppCommandSpec, 'name'>>,
): AppSpec {
  const commands = spec.interface.commands ?? [];
  const next = { ...at(commands, index), ...patch };
  return withInterface(spec, {
    commands: commands.map((command, i) => (i === index ? next : command)),
  });
}

export const removeCommand = (spec: AppSpec, index: number): AppSpec => {
  const commands = spec.interface.commands ?? [];
  at(commands, index);
  return withInterface(spec, {
    commands: commands.filter((_, i) => i !== index),
  });
};

/** The id a mode or an option is sent as: its label in lower-case words, unique among the others. */
export function modeIdOf(label: string, taken: string[]): string {
  return settingIdOf(label, taken).slice(0, 40);
}

/** A mode added: its label and the labels of its options, two at least, the first where it starts. */
export function addMode(
  spec: AppSpec,
  label: string,
  optionLabels: string[],
): AppSpec {
  const modes = spec.interface.modes ?? [];
  const words = label.trim();
  const labels = optionLabels.map(option => option.trim()).filter(Boolean);
  if (!words) {
    throw new Error('A mode needs the name a person reads.');
  }
  if (labels.length < 2) {
    throw new Error('A mode needs two options at least.');
  }
  if (
    modes.some(
      other => other.label.trim().toLowerCase() === words.toLowerCase(),
    )
  ) {
    throw new Error(`There is already a mode “${words}”.`);
  }
  const options: AppModeOptionSpec[] = [];
  for (const option of labels) {
    options.push({
      id: modeIdOf(
        option,
        options.map(taken => taken.id),
      ),
      label: option,
    });
  }
  const mode: AppModeSpec = {
    id: modeIdOf(
      words,
      modes.map(other => other.id),
    ),
    label: words,
    options,
  };
  return withInterface(spec, { modes: [...modes, mode] });
}

const withMode = (
  spec: AppSpec,
  index: number,
  change: (mode: AppModeSpec) => AppModeSpec,
): AppSpec => {
  const modes = spec.interface.modes ?? [];
  const next = change(at(modes, index));
  return withInterface(spec, {
    modes: modes.map((mode, i) => (i === index ? next : mode)),
  });
};

/** A mode's label, or the option it starts on (`undefined`: its first). Its id is never changed. */
export const writeMode = (
  spec: AppSpec,
  index: number,
  patch: { label?: string; default?: string },
): AppSpec =>
  withMode(spec, index, mode => {
    const next: AppModeSpec = {
      ...mode,
      ...('label' in patch ? { label: patch.label ?? '' } : {}),
    };
    if ('default' in patch) {
      if (
        patch.default &&
        !mode.options.some(option => option.id === patch.default)
      ) {
        throw new Error(`“${patch.default}” is not one of its options.`);
      }
      if (patch.default) {
        next.default = patch.default;
      } else {
        delete next.default;
      }
    }
    return next;
  });

export const removeMode = (spec: AppSpec, index: number): AppSpec => {
  const modes = spec.interface.modes ?? [];
  at(modes, index);
  return withInterface(spec, { modes: modes.filter((_, i) => i !== index) });
};

/** An option added to a mode, its id made from its label. */
export function addModeOption(
  spec: AppSpec,
  index: number,
  label: string,
): AppSpec {
  const words = label.trim();
  if (!words) {
    throw new Error('An option needs the words a person reads.');
  }
  return withMode(spec, index, mode => ({
    ...mode,
    options: [
      ...mode.options,
      {
        id: modeIdOf(
          words,
          mode.options.map(option => option.id),
        ),
        label: words,
      },
    ],
  }));
}

/** An option changed in place: what it says, and what the agent is told. Its id is never changed. */
export const writeModeOption = (
  spec: AppSpec,
  index: number,
  optionIndex: number,
  patch: Partial<
    Pick<AppModeOptionSpec, 'label' | 'description' | 'instructions'>
  >,
): AppSpec =>
  withMode(spec, index, mode => {
    const next: AppModeOptionSpec = {
      ...at(mode.options, optionIndex),
      ...patch,
    };
    for (const key of ['description', 'instructions'] as const) {
      if (!next[key]) {
        delete next[key];
      }
    }
    return {
      ...mode,
      options: mode.options.map((option, i) =>
        i === optionIndex ? next : option,
      ),
    };
  });

/** An option removed: refused below two, and the mode starts on its first when it started on this one. */
export const removeModeOption = (
  spec: AppSpec,
  index: number,
  optionIndex: number,
): AppSpec =>
  withMode(spec, index, mode => {
    const gone = at(mode.options, optionIndex);
    if (mode.options.length <= 2) {
      throw new Error('A mode keeps two options at least.');
    }
    const next: AppModeSpec = {
      ...mode,
      options: mode.options.filter((_, i) => i !== optionIndex),
    };
    if (next.default === gone.id) {
      delete next.default;
    }
    return next;
  });

/** A select's options as typed: one per line, blank lines dropped. */
export const optionsOf = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

/**
 * What stands in the way on the block, each said where it is: `where` is
 * `welcome`, `starter:<n>`, `command:<n>`, `mode:<n>` or `setting:<n>`.
 */
export function chatBlockProblems(
  spec: AppSpec,
): Array<{ where: string; problem: string }> {
  const problems: Array<{ where: string; problem: string }> = [];
  const { starters, settings, commands, modes } = chatBlockOf(spec);
  commands.forEach((command, index) => {
    if (!command.description.trim()) {
      problems.push({
        where: `command:${index}`,
        problem: 'The list says nothing of it.',
      });
    }
    if (!command.prompt.trim()) {
      problems.push({
        where: `command:${index}`,
        problem: 'It sends nothing.',
      });
    }
    const other = (command.prompt.match(/\{[^{}]*\}/g) ?? []).find(
      placeholder => placeholder !== '{input}',
    );
    if (other) {
      problems.push({
        where: `command:${index}`,
        problem: `It sends ${other}, which nothing fills: only {input} is.`,
      });
    }
  });
  modes.forEach((mode, index) => {
    if (!mode.label.trim()) {
      problems.push({
        where: `mode:${index}`,
        problem: 'It has no name a person reads.',
      });
    }
    mode.options.forEach((option, optionIndex) => {
      if (!option.label.trim()) {
        problems.push({
          where: `mode:${index}`,
          problem: `Its option ${optionIndex + 1} has no words.`,
        });
      }
    });
  });
  starters.forEach((starter, index) => {
    if (!starter.label.trim()) {
      problems.push({
        where: `starter:${index}`,
        problem: 'Its button has no words.',
      });
    }
    if (!starter.message.trim()) {
      problems.push({
        where: `starter:${index}`,
        problem: 'It sends no message.',
      });
    }
  });
  if (starters.length > MAX_STARTERS) {
    problems.push({
      where: 'starters',
      problem: `Only the first ${MAX_STARTERS} suggested questions are shown.`,
    });
  }
  settings.forEach((setting, index) => {
    if (!setting.label.trim()) {
      problems.push({
        where: `setting:${index}`,
        problem: 'It has no name a person reads.',
      });
    }
    if (setting.type === 'select' && setting.options.length < 2) {
      problems.push({
        where: `setting:${index}`,
        problem: 'A choice needs at least two choices.',
      });
    }
    if (
      setting.type === 'select' &&
      typeof setting.default === 'string' &&
      setting.default &&
      !setting.options.includes(setting.default)
    ) {
      problems.push({
        where: `setting:${index}`,
        problem: `It starts at “${setting.default}”, which is not one of its choices.`,
      });
    }
    if (
      setting.type === 'number' &&
      typeof setting.min === 'number' &&
      typeof setting.max === 'number' &&
      setting.min >= setting.max
    ) {
      problems.push({
        where: `setting:${index}`,
        problem: 'Its least is not below its most.',
      });
    }
  });
  return problems;
}
