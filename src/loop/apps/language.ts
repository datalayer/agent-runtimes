/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application in the person's language (LOOP P-26).
 *
 * An Appspec says its words in its own language (`interface.language`, `en`
 * unless said) and may say them in others (`interface.translations`, by BCP
 * 47 tag): its name, description and welcome, its starters by label and
 * their categories, its settings' fields, its commands' descriptions, its
 * modes and its profiles. The page shows the first language the person
 * prefers that the application has — the browser's, unless its host says
 * another — and its own words otherwise; what is not translated stays in its
 * own words. Only what is shown changes: ids, values and prompts are the same
 * in every language, and a starter's message is sent in the person's.
 *
 * agentspecs' `LANGUAGE_TAG`, `pick_language`, `AppSpec.translated` and the
 * translation checks, said again for the page. The interface's own words —
 * the composer's, the profile picker's — are {@link interfaceWords}.
 *
 * Pure: no React, no network ({@link preferredLanguages} reads the browser's).
 *
 * @module loop/apps/language
 */

import type {
  AppInterfaceSpec,
  AppSpec,
  AppStarterSpec,
  AppTranslationSpec,
} from '../../types/agentspecs';
import { DEFAULT_LANGUAGE } from './appspec';

/**
 * A language as BCP 47 tags it: two or three letters, then optionally a
 * script, a region and variants — `fr`, `pt-BR`, `zh-Hant-TW`.
 */
export const LANGUAGE_TAG =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

/**
 * The first language a person prefers that is available, or null. Tags are
 * compared without case; a preferred tag also takes one of its language
 * alone, then one of the same language (`fr-CA` takes `fr`, then `fr-FR`).
 */
export function pickLanguage(
  available: readonly string[],
  preferred: readonly string[],
): string | null {
  const byTag = new Map(available.map(tag => [tag.toLowerCase(), tag]));
  for (const wanted of preferred) {
    const tag = wanted.trim().toLowerCase();
    if (!tag) {
      continue;
    }
    const exact = byTag.get(tag);
    if (exact) {
      return exact;
    }
    const language = tag.split('-')[0];
    const alone = byTag.get(language);
    if (alone) {
      return alone;
    }
    for (const [candidate, original] of byTag) {
      if (candidate.split('-')[0] === language) {
        return original;
      }
    }
  }
  return null;
}

/** The languages the browser says the person prefers, in their order; none outside one. */
export function preferredLanguages(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  const languages = navigator.languages?.length
    ? [...navigator.languages]
    : [navigator.language];
  return languages.filter(Boolean);
}

/** The language an application is read in by a person who prefers these. */
export function appLanguage(
  app: Pick<AppSpec, 'interface'>,
  preferred: readonly string[],
): string {
  const own = app.interface.language ?? DEFAULT_LANGUAGE;
  return (
    pickLanguage(
      [own, ...Object.keys(app.interface.translations ?? {})],
      preferred,
    ) ?? own
  );
}

function translatedStarter(
  starter: AppStarterSpec,
  words: AppTranslationSpec,
): AppStarterSpec {
  const said = words.starters[starter.label];
  const category = starter.category
    ? words.categories[starter.category] || starter.category
    : undefined;
  return {
    label: said?.label || starter.label,
    message: said?.message || starter.message,
    ...(category ? { category } : {}),
  };
}

/** The settings' uiSchema, a translated field's values named in the language. */
function namedOptions(
  ui: Record<string, unknown> | undefined,
  words: AppTranslationSpec,
  settings: AppInterfaceSpec['settings'],
): Record<string, unknown> | undefined {
  const named = Object.entries(words.settings).filter(
    ([, field]) => Object.keys(field.options).length > 0,
  );
  if (named.length === 0 || !settings) {
    return ui;
  }
  const drawn = JSON.parse(JSON.stringify(ui ?? {})) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [name, field] of named) {
    const schema = (settings.properties?.[name] ?? {}) as Record<
      string,
      unknown
    >;
    const items = (schema.items ?? {}) as Record<string, unknown>;
    const values = ((schema.enum ?? items.enum ?? []) as unknown[]).map(String);
    drawn[name] = {
      ...(drawn[name] ?? {}),
      'ui:enumNames': values.map(value => field.options[value] ?? value),
    };
  }
  return drawn;
}

/**
 * The application as a person who prefers these languages reads it: its
 * name, description and interface in the first of them it is translated
 * into, else itself. What it does — its agent, its rules, its ids, its
 * values, its prompts — is the same.
 */
export function translatedAppspec(
  app: AppSpec,
  preferred: readonly string[],
): AppSpec {
  const tag = appLanguage(app, preferred);
  const words = app.interface.translations?.[tag];
  if (!words) {
    return app;
  }
  const ui = app.interface;
  let settings = ui.settings;
  if (settings && Object.keys(words.settings).length > 0) {
    settings = JSON.parse(JSON.stringify(settings)) as NonNullable<
      typeof settings
    >;
    for (const [name, field] of Object.entries(words.settings)) {
      const target = settings.properties?.[name] as
        Record<string, unknown> | undefined;
      if (!target) {
        continue;
      }
      if (field.title) {
        target.title = field.title;
      }
      if (field.description) {
        target.description = field.description;
      }
    }
  }
  const settingsUi = namedOptions(ui.settingsUi, words, settings);
  return {
    ...app,
    name: words.name || app.name,
    description: words.description || app.description,
    interface: {
      ...ui,
      welcome: words.welcome || ui.welcome,
      starters: ui.starters.map(starter => translatedStarter(starter, words)),
      commands: ui.commands.map(command => ({
        ...command,
        description: words.commands[command.name] || command.description,
      })),
      modes: ui.modes.map(mode => {
        const said = words.modes[mode.id];
        return said
          ? {
              ...mode,
              label: said.label || mode.label,
              options: mode.options.map(option => ({
                ...option,
                label: said.options[option.id]?.label || option.label,
                ...(said.options[option.id]?.description
                  ? { description: said.options[option.id].description }
                  : {}),
              })),
            }
          : mode;
      }),
      profiles: (ui.profiles ?? []).map(profile => ({
        ...profile,
        label: words.profiles[profile.id]?.label || profile.label,
        description:
          words.profiles[profile.id]?.description || profile.description,
        starters: profile.starters.map(starter =>
          translatedStarter(starter, words),
        ),
      })),
      ...(settings ? { settings } : {}),
      ...(settingsUi ? { settingsUi } : {}),
      language: tag,
      translations: {},
    },
  };
}

/**
 * What is wrong with an application's translations, in agentspecs'
 * sentences: its own language, and each translation's, a BCP 47 tag; no
 * translation into its own language, nor into one twice; nothing translated
 * that it does not say.
 */
export function translationProblems(ui: AppInterfaceSpec): string[] {
  const own = ui.language ?? DEFAULT_LANGUAGE;
  const problems: string[] = [];
  if (!LANGUAGE_TAG.test(own)) {
    problems.push(
      `“${own}” is no language as BCP 47 tags it: \`en\`, \`fr\`, \`pt-BR\`.`,
    );
  }
  const profiles = ui.profiles ?? [];
  const starters = new Set([
    ...ui.starters.map(starter => starter.label),
    ...profiles.flatMap(profile => profile.starters.map(item => item.label)),
  ]);
  const categories = new Set(
    [...ui.starters, ...profiles.flatMap(profile => profile.starters)]
      .map(starter => starter.category)
      .filter(Boolean),
  );
  const fields = (ui.settings?.properties ?? {}) as Record<string, unknown>;
  const seen = new Map<string, string>();
  for (const [tag, words] of Object.entries(ui.translations ?? {})) {
    if (!LANGUAGE_TAG.test(tag)) {
      problems.push(
        `The translation “${tag}” is of no language as BCP 47 tags it: \`fr\`, \`pt-BR\`.`,
      );
      continue;
    }
    if (tag.toLowerCase() === own.toLowerCase()) {
      problems.push(`Its own words are in “${own}”: no translation into it.`);
      continue;
    }
    const first = seen.get(tag.toLowerCase());
    if (first) {
      problems.push(`“${first}” and “${tag}” are the same language.`);
      continue;
    }
    seen.set(tag.toLowerCase(), tag);
    const unknown = [
      ...Object.keys(words.starters)
        .filter(label => !starters.has(label))
        .map(label => `the starter “${label}”`),
      ...Object.keys(words.categories)
        .filter(name => !categories.has(name))
        .map(name => `the category “${name}”`),
      ...Object.keys(words.settings)
        .filter(name => !(name in fields))
        .map(name => `the setting “${name}”`),
      ...Object.keys(words.commands)
        .filter(name => !ui.commands.some(command => command.name === name))
        .map(name => `the command “${name}”`),
      ...Object.entries(words.modes).flatMap(([id, mode]) => {
        const known = ui.modes.find(item => item.id === id);
        if (!known) {
          return [`the mode “${id}”`];
        }
        return Object.keys(mode.options)
          .filter(option => !known.options.some(item => item.id === option))
          .map(option => `the option “${option}” of “${id}”`);
      }),
      ...Object.keys(words.profiles)
        .filter(id => !profiles.some(profile => profile.id === id))
        .map(id => `the profile “${id}”`),
      ...Object.entries(words.settings).flatMap(([name, field]) => {
        const schema = (fields[name] ?? {}) as Record<string, unknown>;
        const items = (schema.items ?? {}) as Record<string, unknown>;
        const values = ((schema.enum ?? items.enum ?? []) as unknown[]).map(
          String,
        );
        return name in fields
          ? Object.keys(field.options)
              .filter(value => !values.includes(value))
              .map(value => `the value “${value}” of “${name}”`)
          : [];
      }),
    ];
    if (unknown.length > 0) {
      problems.push(
        `The translation “${tag}” translates what the application does not say: ${unknown.join(', ')}.`,
      );
    }
  }
  return problems;
}

/** The words the application's interface says itself, in one language. */
export type InterfaceWords = {
  /** The profile picker's name. */
  profile: string;
  /** Beside the profile a conversation started with: it is kept. */
  profileKept: string;
  /** The paper clip's. */
  attach: string;
};

/**
 * The words the application's own interface says — the profile picker, the
 * paper clip — in the languages it is said in. Another language reads
 * English.
 */
export const INTERFACE_WORDS: Record<string, InterfaceWords> = {
  en: {
    profile: 'Profile',
    profileKept: 'kept for this conversation',
    attach: 'Attach a file',
  },
  fr: {
    profile: 'Profil',
    profileKept: 'gardé pour cette conversation',
    attach: 'Joindre un fichier',
  },
  es: {
    profile: 'Perfil',
    profileKept: 'se mantiene en esta conversación',
    attach: 'Adjuntar un archivo',
  },
  de: {
    profile: 'Profil',
    profileKept: 'für dieses Gespräch beibehalten',
    attach: 'Datei anhängen',
  },
  it: {
    profile: 'Profilo',
    profileKept: 'mantenuto per questa conversazione',
    attach: 'Allega un file',
  },
  pt: {
    profile: 'Perfil',
    profileKept: 'mantido nesta conversa',
    attach: 'Anexar um arquivo',
  },
};

/** The interface's own words in a language: its own, else its language's, else English. */
export function interfaceWords(language: string): InterfaceWords {
  const tag = pickLanguage(Object.keys(INTERFACE_WORDS), [language]);
  return INTERFACE_WORDS[tag ?? 'en'];
}
