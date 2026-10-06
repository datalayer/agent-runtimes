/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Profiles, starters by category and the nine inputs (LOOP P-20), and an
 * application in the person's language (P-26): read and written as
 * agentspecs says them, checked as it checks them, offered in the composer
 * and the empty chat, applied to a run.
 */

import { describe, expect, it } from 'vitest';
import { APP_CATALOGUE } from '../../specs/apps';
import {
  LoopAgentBlueprint,
  LoopChatExtras,
  LoopRunProps,
  runForwardedProps,
} from '../core';
import {
  defineAppComposerPlugin,
  startersAsOpeners,
} from '../apps/AppComposer';
import { appPreset } from '../apps/AppRenderer';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec, formProblems } from '../apps/checks';
import { modeEffect, profileChoice, startersFor } from '../apps/composer';
import {
  appLanguage,
  interfaceWords,
  pickLanguage,
  translatedAppspec,
} from '../apps/language';
import { formUiProblems, SETTING_INPUTS } from '../apps/settingsInputs';

const BASE = {
  schema: 'loop.app/v1',
  id: 'desk',
  name: 'Desk',
  kind: 'chat',
  agent: 'cog-crawler:0.0.1',
};

const STARTERS = [
  { label: 'Refund', message: 'I want a refund.', category: 'Billing' },
  { label: 'Hello', message: 'Hello!' },
];

const PROFILES = [
  { id: 'support', label: 'Support', instructions: 'Answer briefly.' },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Plans and prices',
    model: 'bedrock:sales-one',
    starters: [
      { label: 'Pricing', message: 'What does it cost?', category: 'Plans' },
    ],
  },
];

const MODES = [
  {
    id: 'depth',
    label: 'Depth',
    options: [
      { id: 'quick', label: 'Quick', instructions: 'Two sentences.' },
      { id: 'deep', label: 'Deep', model: 'bedrock:deep-one' },
    ],
  },
];

const SETTINGS = {
  type: 'object',
  properties: {
    tone: { type: 'string', title: 'Tone', enum: ['warm', 'dry'] },
    seats: { type: 'integer', title: 'Seats', minimum: 1, maximum: 9 },
    live: { type: 'boolean', title: 'Live' },
    topics: { type: 'array', title: 'Topics', items: { type: 'string' } },
  },
};

const SETTINGS_UI = {
  tone: { 'ui:widget': 'radio' },
  seats: { 'ui:widget': 'range' },
  live: { 'ui:widget': 'switch' },
  topics: { 'ui:widget': 'tags' },
};

const TRANSLATIONS = {
  fr: {
    name: 'Bureau',
    welcome: 'Bonjour',
    starters: {
      Refund: { label: 'Remboursement', message: 'Je veux être remboursé.' },
      Pricing: { label: 'Tarifs' },
    },
    categories: { Billing: 'Facturation' },
    settings: { tone: { title: 'Ton', options: { warm: 'Chaleureux' } } },
    modes: {
      depth: { label: 'Profondeur', options: { quick: { label: 'Rapide' } } },
    },
    profiles: { sales: { label: 'Ventes' } },
  },
};

const DESK = {
  ...BASE,
  interface: {
    starters: STARTERS,
    modes: MODES,
    profiles: PROFILES,
    settings: SETTINGS,
    settings_ui: SETTINGS_UI,
    translations: TRANSLATIONS,
  },
};

const contributed = (
  plugin: ReturnType<typeof defineAppComposerPlugin>,
  point: unknown,
) =>
  (plugin.contributes ?? []).filter(
    (item: { point?: unknown }) => item.point === point,
  ) as Array<{ value: Record<string, any> }>;

describe('profiles, starters and settings (LOOP P-20)', () => {
  it('are read and written as the spec says them', () => {
    const { app, problems } = parseAppspec(DESK);
    expect(problems).toEqual([]);
    expect(app.interface.starters).toEqual(STARTERS);
    expect(app.interface.profiles?.[1]).toEqual({
      ...PROFILES[1],
      instructions: '',
    });
    expect(app.interface.settingsUi).toEqual(SETTINGS_UI);
    expect(dumpAppspec(app).interface).toEqual(DESK.interface);
    expect(checkAppspec(DESK).problems).toEqual([
      'The profile “sales” runs on “bedrock:sales-one”, which is no model.',
      'The mode “depth” runs “deep” on “bedrock:deep-one”, which is no model.',
    ]);
  });

  it('pick the first profile unless another is, and offer its starters, else the application’s', () => {
    const app = parseAppspec(DESK).app;
    expect(profileChoice(app)?.id).toBe('support');
    expect(startersFor(app).map(s => s.label)).toEqual(['Refund', 'Hello']);
    expect(startersFor(app, 'sales').map(s => s.label)).toEqual(['Pricing']);
    expect(() => profileChoice(app, 'buyer')).toThrow(
      'Desk has no profile “buyer”.',
    );
    expect(startersAsOpeners(app.interface.starters)).toEqual([
      { text: 'Refund', message: 'I want a refund.', group: 'Billing' },
      { text: 'Hello', message: 'Hello!' },
    ]);
  });

  it('tell a run the profile’s instructions before the modes’, a mode’s model over the profile’s', () => {
    const app = parseAppspec(DESK).app;
    expect(modeEffect(app, {}, 'sales')).toEqual({
      instructions: 'Two sentences.',
      model: 'bedrock:sales-one',
    });
    expect(modeEffect(app, { depth: 'deep' }, 'sales')).toEqual({
      instructions: '',
      model: 'bedrock:deep-one',
    });
    expect(modeEffect(app)).toEqual({
      instructions: 'Answer briefly.\n\nTwo sentences.',
    });
  });

  it('send the profile with every run, keep it once the conversation starts, and offer its starters live', () => {
    const app = parseAppspec(DESK).app;
    const plugin = defineAppComposerPlugin(app);
    const [profileProps] = contributed(plugin, LoopRunProps).filter(
      item => item.value.id === 'app-profile',
    );
    const [extras] = contributed(plugin, LoopChatExtras);
    expect(extras.value.extras.value.openers).toEqual([
      { text: 'Refund', message: 'I want a refund.', group: 'Billing' },
      { text: 'Hello', message: 'Hello!' },
    ]);
    const modes = contributed(plugin, LoopRunProps).find(
      item => item.value.id === 'app-modes',
    );
    expect(
      runForwardedProps([profileProps.value as never, modes!.value as never]),
    ).toEqual({ loop: { profile: 'support', modes: { depth: 'quick' } } });
    // Through its blueprint, an agent turned in the page applies it too.
    const [first] = appPreset(app).plugins as Array<{
      contributes?: Array<{ point?: unknown; value: Record<string, any> }>;
    }>;
    const blueprint = first.contributes?.find(
      item => item.point === LoopAgentBlueprint,
    )?.value;
    expect(blueprint?.modeEffect({}, 'sales').model).toBe('bedrock:sales-one');
    // Only one with profiles, modes, commands or uploads gets the plugin.
    const names = (spec: unknown) =>
      appPreset(parseAppspec(spec).app).plugins.map(
        item => (item as { name: string }).name,
      );
    expect(names({ ...BASE, interface: { profiles: PROFILES } })).toContain(
      '@datalayer/loop-plugin-app-composer-desk',
    );
  });

  it('refuse what agentspecs refuses', () => {
    const problems = (ui: Record<string, unknown>) =>
      checkAppspec({ ...BASE, interface: ui }).problems;
    expect(problems({ profiles: [PROFILES[0]] })).toContain(
      'One profile is the application itself: say two at least, or put its instructions, model and starters on the application.',
    );
    expect(
      problems({ profiles: [PROFILES[0], { id: 'Sales', label: 'S' }] }),
    ).toContain(
      "Cannot use “Sales” as a profile's id: lower-case letters, digits, `_` and `-`, a letter first.",
    );
    expect(
      checkAppspec({
        ...BASE,
        interface: { profiles: [PROFILES[0], { ...PROFILES[1], emoji: 'x' }] },
      }).problems.some(problem => problem.includes('emoji')),
    ).toBe(true);
    expect(
      problems({
        settings: SETTINGS,
        settings_ui: { seats: { 'ui:widget': 'switch' } },
      }),
    ).toEqual([
      "The form “settings”'s field “seats” is drawn with “switch”, which draws a `boolean`.",
    ]);
    expect(problems({ settings_ui: {} })).toEqual([
      '`settings_ui` draws the settings’ fields: say `settings` first.',
    ]);
  });

  it('draw a setting with one of nine inputs, each held to the fields it draws', () => {
    expect(Object.keys(SETTING_INPUTS)).toEqual([
      'Select',
      'Slider',
      'Switch',
      'TextInput',
      'Checkbox',
      'DatePicker',
      'MultiSelect',
      'RadioGroup',
      'Tags',
    ]);
    expect(formUiProblems('The form “f”', SETTINGS, SETTINGS_UI)).toEqual([]);
    expect(
      formUiProblems('The form “f”', SETTINGS, {
        tone: { 'ui:widget': 'range' },
        topics: { 'ui:widget': 'checkboxes' },
        colour: { 'ui:widget': 'text' },
        live: { widget: 'switch' },
        'ui:order': ['colour'],
      }),
    ).toEqual([
      "The form “f”'s field “tone” is drawn with “range”, which is a slider: a `number` or an `integer` with a `minimum` and a `maximum`.",
      "The form “f”'s field “topics” is drawn with “checkboxes”, which draws an `array` whose `items` have an `enum`.",
      'The form “f” says how to draw “colour”, which it does not ask.',
      "The form “f”'s field “live” is drawn with `ui:` options, not “widget”.",
      'The form “f” orders fields it does not ask: “colour”.',
    ]);
    // A Form block's `ui` is held the same way.
    expect(
      formProblems({
        id: 'f',
        schema: SETTINGS,
        ui: { live: { 'ui:widget': 'tags' } },
      }),
    ).toEqual([
      "The form “f”'s field “live” is drawn with “tags”, which draws an `array` of `string` items without an `enum`.",
    ]);
  });
});

describe('an application in the person’s language (LOOP P-26)', () => {
  it('picks the first language a person prefers that it has, else its own', () => {
    expect(pickLanguage(['en', 'fr', 'pt-BR'], ['fr-CA', 'en'])).toBe('fr');
    expect(pickLanguage(['en', 'pt-BR'], ['pt'])).toBe('pt-BR');
    expect(pickLanguage(['en'], ['de'])).toBeNull();
    const app = parseAppspec(DESK).app;
    expect(appLanguage(app, ['fr-BE'])).toBe('fr');
    expect(appLanguage(app, ['de'])).toBe('en');
  });

  it('shows its words in that language, and does the same', () => {
    const app = parseAppspec(DESK).app;
    expect(translatedAppspec(app, ['de'])).toBe(app);
    const french = translatedAppspec(app, ['fr-FR', 'en']);
    expect(french.name).toBe('Bureau');
    expect(french.id).toBe('desk');
    expect(french.interface.welcome).toBe('Bonjour');
    expect(french.interface.starters).toEqual([
      {
        label: 'Remboursement',
        message: 'Je veux être remboursé.',
        category: 'Facturation',
      },
      { label: 'Hello', message: 'Hello!' },
    ]);
    expect(french.interface.profiles?.[1].label).toBe('Ventes');
    expect(french.interface.profiles?.[1].starters[0]).toEqual({
      label: 'Tarifs',
      message: 'What does it cost?',
      category: 'Plans',
    });
    expect(french.interface.modes[0].label).toBe('Profondeur');
    expect(french.interface.modes[0].options.map(o => o.label)).toEqual([
      'Rapide',
      'Deep',
    ]);
    const tone = french.interface.settings?.properties?.tone as Record<
      string,
      unknown
    >;
    expect(tone.title).toBe('Ton');
    expect(tone.enum).toEqual(['warm', 'dry']);
    expect(french.interface.settingsUi?.tone).toEqual({
      'ui:widget': 'radio',
      'ui:enumNames': ['Chaleureux', 'dry'],
    });
    // Its own is untouched.
    expect(
      (app.interface.settings?.properties?.tone as Record<string, unknown>)
        .title,
    ).toBe('Tone');
    // The composer speaks its language too.
    expect(interfaceWords('fr-CA').profile).toBe('Profil');
    expect(interfaceWords('ja').profile).toBe('Profile');
  });

  it('reads Support Desk in French', () => {
    const french = translatedAppspec(APP_CATALOGUE['support-desk'], ['fr']);
    expect(french.name).toBe('Service client');
    expect(french.interface.starters.map(s => s.category)).toEqual([
      'Compte',
      'Commandes',
      'Compte',
    ]);
  });

  it('refuses what agentspecs refuses', () => {
    const problems = (translations: unknown, extra = {}) =>
      checkAppspec({
        ...DESK,
        interface: { ...DESK.interface, translations, ...extra },
      }).problems.filter(problem => !problem.includes('no model'));
    expect(problems({ french: {} })).toEqual([
      'The translation “french” is of no language as BCP 47 tags it: `fr`, `pt-BR`.',
    ]);
    expect(problems({ en: {} })).toEqual([
      'Its own words are in “en”: no translation into it.',
    ]);
    expect(problems({ fr: {}, FR: {} })).toEqual([
      '“fr” and “FR” are the same language.',
    ]);
    expect(
      problems({
        fr: {
          starters: { Nope: { label: 'Non' } },
          settings: { tone: { options: { cold: 'Froid' } } },
          modes: { depth: { options: { slow: { label: 'Lent' } } } },
          profiles: { c: { label: 'C' } },
        },
      }),
    ).toEqual([
      'The translation “fr” translates what the application does not say: the starter “Nope”, the option “slow” of “depth”, the profile “c”, the value “cold” of “tone”.',
    ]);
    expect(problems({}, { language: 'english' })).toEqual([
      '“english” is no language as BCP 47 tags it: `en`, `fr`, `pt-BR`.',
    ]);
    expect(
      checkAppspec({
        ...BASE,
        interface: { translations: { fr: { greeting: 'Salut' } } },
      }).problems.some(problem => problem.includes('greeting')),
    ).toBe(true);
  });
});
