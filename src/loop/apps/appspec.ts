/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec as a file, and as the application an editor holds.
 *
 * An application is kept as a YAML or JSON document in the spec's own words —
 * `applies_to`, `ready_at`, `keep_for` — with nothing written that is at its
 * default. An editor works on the whole of it: an {@link AppSpec} with every
 * field present, in TypeScript's spelling.
 *
 * {@link parseAppspec} reads the first into the second, and
 * {@link dumpAppspec} writes it back: the same application always writes the
 * same document, keys in one fixed order — the spec's own where it declares
 * them, alphabetical where it does not (a scenario's weights, a component of
 * a surface) — so that a difference between two versions shows what changed
 * and nothing else. Reading what was written
 * gives the application back, and writing what was read gives the document
 * back — which is what lets three editors work on one file.
 *
 * Reading is tolerant, because a draft is not yet an application: what is
 * missing takes its default, and what is wrong is reported beside the result
 * rather than thrown. Whether the application can be used is decided by the
 * spec's own validation, not here.
 *
 * Pure: nothing here calls a service or renders.
 *
 * @module loop/apps/appspec
 */

import type {
  AppAccent,
  AppAssistantCharacter,
  AppEmbedMode,
  AppConnectionSpec,
  AppCriterionSpec,
  AppDecisionSpec,
  AppDeploymentSpec,
  AppInterfaceSpec,
  AppVoiceSpec,
  AppKind,
  AppLayout,
  AppRuleSpec,
  AppSettingSpec,
  AppSpec,
  AppSurfaceSpec,
  AppTriggerSpec,
} from '../../types/agentspecs';
import { BEHAVIOURS } from './rules';

/** The version of the spec itself. */
export const APP_SCHEMA = 'loop.app/v1';

/** The face of an application that has not chosen one. */
export const DEFAULT_EMOJI = '\u{1F440}';

export const APP_KINDS: AppKind[] = ['chat', 'widget', 'decision', 'worker'];

export const APP_ACCENTS: AppAccent[] = [
  'green',
  'rose',
  'sky',
  'lime',
  'sun',
  'violet',
];

/** The four ways an application sits in another product's page (LOOP D-07). */
export const APP_EMBED_MODES: AppEmbedMode[] = [
  'inline',
  'bubble',
  'panel',
  'assistant',
];

/**
 * How an Appspec names the character of its floating assistant (LOOP T-24):
 * the id a plugin contributes it under, `paperclip` or `acme-owl` — as
 * agentspecs' `ASSISTANT_CHARACTER_ID`. Which ids exist is what the enabled
 * plugins contribute (`assistantCharacterNamed`), not the spec's to say.
 */
export const APP_ASSISTANT_CHARACTER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Whether a value is shaped as a character id an Appspec may name. */
export function isAssistantCharacterId(
  value: unknown,
): value is AppAssistantCharacter {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    APP_ASSISTANT_CHARACTER_ID.test(value)
  );
}

const ACTION_CLASS_NAMES = [
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'publish',
];

/** The layout a kind starts with. */
export const DEFAULT_LAYOUTS: Record<AppKind, AppLayout> = {
  chat: 'chat',
  widget: 'page',
  decision: 'page',
  worker: 'split',
};

/** What an application keeps of what it did, when it does not say. */
export const DEFAULT_RECORD_INCLUDE = ['conversations', 'actions', 'approvals'];

const DEFAULT_KEEP_FOR = '1_years';
const DEFAULT_READY_AT = 0.8;
const DEFAULT_PROTOCOL = 'a2ui/v0.9';
const DEFAULT_ICON = 'apps';
const DEFAULT_VERSION = '0.0.1';

type Data = Record<string, unknown>;

/** A host function's arguments when it names none: an empty object. */
const NO_HOST_PARAMETERS = { type: 'object', properties: {} };

const isData = (value: unknown): value is Data =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown, otherwise = ''): string =>
  typeof value === 'string' ? value : otherwise;

const flag = (value: unknown, otherwise: boolean): boolean =>
  typeof value === 'boolean' ? value : otherwise;

const numberOf = (value: unknown, otherwise: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : otherwise;

const texts = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const records = (value: unknown): Data[] =>
  Array.isArray(value) ? value.filter(isData) : [];

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  otherwise: T,
): T => (allowed.includes(value as T) ? (value as T) : otherwise);

const RETENTION = /^([1-9]\d*)_(day|days|month|months|year|years)$/;
const DAYS: Record<string, number> = { day: 1, month: 30, year: 365 };

/** A retention as days: `90_days`, `18_months`, `1_years`; 0 when it cannot be read. */
export function retentionDays(keepFor: string): number {
  const matched = RETENTION.exec(keepFor.trim());
  return matched ? Number(matched[1]) * DAYS[matched[2].replace(/s$/, '')] : 0;
}

/** An application with nothing said: what *Start blank* opens. */
export function emptyAppspec(kind: AppKind = 'chat'): AppSpec {
  return {
    schema: APP_SCHEMA,
    id: '',
    version: DEFAULT_VERSION,
    name: '',
    kind,
    description: '',
    owner: '',
    agent: '',
    team: '',
    instructions: '',
    model: '',
    skills: [],
    backendTools: [],
    context: [],
    contents: [],
    connections: [],
    rules: [],
    permissions: {
      spaces: [],
      computer: { browse: false, files: false, shell: false },
    },
    interface: {
      layout: DEFAULT_LAYOUTS[kind],
      accent: 'green',
      welcome: '',
      starters: [],
      settings: [],
      components: [],
      outputs: [],
    },
    tests: {
      readyAt: DEFAULT_READY_AT,
      evalset: '',
      cases: [],
      verified: { live: [], recorded: [], unverified: [] },
    },
    record: {
      keepFor: DEFAULT_KEEP_FOR,
      retentionDays: retentionDays(DEFAULT_KEEP_FOR),
      include: [...DEFAULT_RECORD_INCLUDE],
      suggestTests: false,
    },
    checks: { guards: [], gates: [], track: '' },
    deployment: {},
    goal: '',
    triggers: [],
    memory: '',
    notifications: [],
    setup: [],
    enabled: true,
    tags: [],
    icon: DEFAULT_ICON,
    emoji: DEFAULT_EMOJI,
    avatar: '',
    banner: '',
  };
}

// --- reading --------------------------------------------------------------------------

const KNOWN_KEYS = [
  'schema',
  'id',
  'version',
  'name',
  'kind',
  'description',
  'owner',
  'agent',
  'team',
  'instructions',
  'model',
  'skills',
  'backend_tools',
  'context',
  'contents',
  'connections',
  'rules',
  'permissions',
  'interface',
  'tests',
  'record',
  'checks',
  'deployment',
  'goal',
  'triggers',
  'memory',
  'notifications',
  'decision',
  'enabled',
  'tags',
  'icon',
  'emoji',
  'avatar',
  'banner',
] as const;

function parseConnection(data: Data): AppConnectionSpec {
  return {
    server: text(data.server),
    access: oneOf(data.access, ['read', 'write'] as const, 'read'),
    as: oneOf(data.as, ['owner', 'user'] as const, 'owner'),
    only: texts(data.only),
  };
}

function parseRule(data: Data): AppRuleSpec {
  return {
    action: text(data.action),
    appliesTo:
      typeof data.applies_to === 'string'
        ? [data.applies_to]
        : texts(data.applies_to),
    behaviour: oneOf(data.behaviour, BEHAVIOURS, 'ask_first'),
  };
}

function parseSetting(data: Data): AppSettingSpec {
  const setting: AppSettingSpec = {
    id: text(data.id),
    type: oneOf(
      data.type,
      ['select', 'text', 'toggle', 'slider', 'number'] as const,
      'text',
    ),
    label: text(data.label),
    options: texts(data.options),
  };
  if (['string', 'boolean', 'number'].includes(typeof data.default)) {
    setting.default = data.default as string | boolean | number;
  }
  if (typeof data.min === 'number') {
    setting.min = data.min;
  }
  if (typeof data.max === 'number') {
    setting.max = data.max;
  }
  return setting;
}

function parseSurface(data: Data): AppSurfaceSpec {
  return {
    protocol: text(data.protocol, DEFAULT_PROTOCOL),
    components: records(data.components).filter(
      component =>
        typeof component.id === 'string' &&
        typeof component.component === 'string',
    ) as AppSurfaceSpec['components'],
    composedBy: text(data.composed_by),
    composedAt: text(data.composed_at),
  };
}

/** An application's voice (VOICE.md VO-41): off unless said. */
export const DEFAULT_VOICE: AppVoiceSpec = {
  enabled: false,
  input: 'push_to_talk',
  output: 'on_request',
  voice: '',
  language: '',
  where: 'auto',
};

function parseVoice(data: unknown): AppVoiceSpec {
  const voice = isData(data) ? data : {};
  return {
    enabled: voice.enabled === true,
    input: oneOf(
      voice.input,
      ['off', 'push_to_talk', 'hands_free'] as const,
      DEFAULT_VOICE.input,
    ),
    output: oneOf(
      voice.output,
      ['off', 'on_request', 'always'] as const,
      DEFAULT_VOICE.output,
    ),
    voice: text(voice.voice),
    language: text(voice.language),
    where: oneOf(
      voice.where,
      ['auto', 'device', 'server'] as const,
      DEFAULT_VOICE.where,
    ),
  };
}

function parseInterface(data: Data, kind: AppKind): AppInterfaceSpec {
  const parsed: AppInterfaceSpec = {
    layout: oneOf(
      data.layout,
      ['chat', 'page', 'split'] as const,
      DEFAULT_LAYOUTS[kind],
    ),
    accent: oneOf(data.accent, APP_ACCENTS, 'green'),
    welcome: text(data.welcome),
    starters: records(data.starters).map(starter => ({
      label: text(starter.label),
      message: text(starter.message),
    })),
    settings: records(data.settings).map(parseSetting),
    components: texts(data.components),
    voice: parseVoice(data.voice),
    outputs: texts(data.outputs),
  };
  if (isData(data.surface)) {
    parsed.surface = parseSurface(data.surface);
  }
  if (isAssistantCharacterId(data.assistant)) {
    parsed.assistant = data.assistant;
  }
  if (data.balloon === 'history' || data.balloon === 'current') {
    parsed.balloon = data.balloon;
  }
  return parsed;
}

function parseCriterion(data: Data): AppCriterionSpec {
  return {
    name: text(data.name),
    kind: oneOf(
      data.kind,
      ['metric', 'noul', 'choice', 'score'] as const,
      'metric',
    ),
    weight: Math.max(0, numberOf(data.weight, 1)),
    instructions: text(data.instructions),
    options: texts(data.options),
    direction: data.direction === 'lower' ? 'lower' : 'higher',
    measure: oneOf(
      data.measure,
      ['', 'pass_rate', 'cost_per_task', 'seconds_per_task'] as const,
      '',
    ),
  };
}

function parseDecision(data: Data): AppDecisionSpec {
  return {
    question: text(data.question),
    alternatives: texts(data.alternatives),
    criteria: records(data.criteria).map(parseCriterion),
    minConfidence: Math.min(1, Math.max(0, numberOf(data.min_confidence, 0))),
    scenarios: records(data.scenarios).map(scenario => ({
      name: text(scenario.name),
      weights: Object.fromEntries(
        Object.entries(isData(scenario.weights) ? scenario.weights : {}).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      ),
    })),
    decisionModel: text(data.decision_model),
  };
}

function parseDeployment(data: Data): AppDeploymentSpec {
  const deployment: AppDeploymentSpec = {};
  if (isData(data.hosted)) {
    deployment.hosted = {
      visibility: oneOf(
        data.hosted.visibility,
        ['private', 'invited', 'organization', 'link', 'public'] as const,
        'private',
      ),
      slug: text(data.hosted.slug),
      ...(data.hosted.character_alone === true ? { characterAlone: true } : {}),
    };
  }
  if (isData(data.embedded)) {
    deployment.embedded = {
      mode: oneOf(data.embedded.mode, APP_EMBED_MODES, 'inline'),
      origins: texts(data.embedded.origins),
      ...(isData(data.embedded.host)
        ? {
            host: {
              context: texts(data.embedded.host.context),
              functions: records(data.embedded.host.functions).map(fn => ({
                name: text(fn.name),
                description: text(fn.description),
                parameters: isData(fn.parameters)
                  ? fn.parameters
                  : { ...NO_HOST_PARAMETERS },
              })),
            },
          }
        : {}),
    };
  }
  return deployment;
}

function parseTrigger(data: Data): AppTriggerSpec {
  return {
    type: oneOf(data.type, ['schedule', 'event', 'once'] as const, 'schedule'),
    cron: text(data.cron),
    event: text(data.event),
    at: text(data.at),
    description: text(data.description),
    prompt: text(data.prompt),
  };
}

/** What reading a document gives: the application, and what the document got wrong. */
export interface ParsedAppspec {
  app: AppSpec;
  /** In sentences; empty when the document reads as it was written. */
  problems: string[];
}

/**
 * An application from a document in the spec's own words.
 *
 * Tolerant: what is missing takes its default, and what cannot be read is
 * reported in `problems` — a key the spec does not know, a version of the
 * spec this does not read, a kind that is not one. The application returned
 * is always whole, so an editor can open it and show what is wrong.
 */
export function parseAppspec(document: unknown): ParsedAppspec {
  const problems: string[] = [];
  if (!isData(document)) {
    return {
      app: emptyAppspec(),
      problems: ['The document is not an application.'],
    };
  }
  const data = document;
  for (const key of Object.keys(data)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      problems.push(`\`${key}\` is not a field of the spec.`);
    }
  }
  const schema = text(data.schema, APP_SCHEMA);
  if (schema !== APP_SCHEMA) {
    problems.push(
      `This reads ${APP_SCHEMA}; the application is written in ${schema}.`,
    );
  }
  if (!APP_KINDS.includes(data.kind as AppKind)) {
    problems.push(
      data.kind === undefined
        ? 'The application does not say its `kind`.'
        : `\`${String(data.kind)}\` is not a kind: chat, widget, decision or worker.`,
    );
  }
  const kind = oneOf(data.kind, APP_KINDS, 'chat');
  const base = emptyAppspec(kind);
  const permissions = isData(data.permissions) ? data.permissions : {};
  const computer = isData(permissions.computer) ? permissions.computer : {};
  const tests = isData(data.tests) ? data.tests : {};
  const verified = isData(tests.verified) ? tests.verified : {};
  const record = isData(data.record) ? data.record : {};
  const checks = isData(data.checks) ? data.checks : {};
  const keepFor = text(record.keep_for, DEFAULT_KEEP_FOR);
  if (retentionDays(keepFor) === 0) {
    problems.push(
      `Cannot read the retention \`${keepFor}\`: write 90_days, 18_months or 1_years.`,
    );
  }
  const app: AppSpec = {
    ...base,
    schema: APP_SCHEMA,
    id: text(data.id),
    version: text(data.version, DEFAULT_VERSION),
    name: text(data.name),
    kind,
    description: text(data.description),
    owner: text(data.owner),
    agent: text(data.agent),
    team: text(data.team),
    instructions: text(data.instructions),
    model: text(data.model),
    skills: texts(data.skills),
    backendTools: texts(data.backend_tools),
    context: texts(data.context),
    contents: texts(data.contents),
    connections: records(data.connections).map(parseConnection),
    rules: records(data.rules).map(parseRule),
    permissions: {
      spaces: records(permissions.spaces).map(grant => ({
        space: text(grant.space),
        access: oneOf(grant.access, ['read', 'write'] as const, 'read'),
      })),
      computer: {
        browse: flag(computer.browse, false),
        files: flag(computer.files, false),
        shell: flag(computer.shell, false),
      },
    },
    interface: parseInterface(
      isData(data.interface) ? data.interface : {},
      kind,
    ),
    tests: {
      readyAt: Math.min(
        1,
        Math.max(0, numberOf(tests.ready_at, DEFAULT_READY_AT)),
      ),
      evalset: text(tests.evalset),
      cases: records(tests.cases).map(testCase => ({
        ask: text(testCase.ask),
        expect: text(testCase.expect),
      })),
      verified: {
        live: texts(verified.live),
        recorded: texts(verified.recorded),
        unverified: texts(verified.unverified),
      },
    },
    record: {
      keepFor,
      retentionDays: retentionDays(keepFor),
      include: Array.isArray(record.include)
        ? texts(record.include)
        : [...DEFAULT_RECORD_INCLUDE],
      suggestTests: record.suggest_tests === true,
    },
    checks: {
      guards: texts(checks.guards),
      gates: texts(checks.gates),
      track: text(checks.track),
    },
    deployment: parseDeployment(isData(data.deployment) ? data.deployment : {}),
    goal: text(data.goal),
    triggers: records(data.triggers).map(parseTrigger),
    memory: text(data.memory),
    notifications: texts(data.notifications),
    enabled: flag(data.enabled, true),
    tags: texts(data.tags),
    icon: text(data.icon, DEFAULT_ICON),
    emoji: text(data.emoji, DEFAULT_EMOJI) || DEFAULT_EMOJI,
    avatar: text(data.avatar).trim(),
    banner: text(data.banner).trim(),
  };
  if (isData(data.decision)) {
    app.decision = parseDecision(data.decision);
  }
  return { app, problems };
}

// --- writing --------------------------------------------------------------------------

const sameList = (a: unknown[], b: unknown[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** A document with a key only when its value says something. */
class Writer {
  readonly data: Data = {};

  text(key: string, value: string, otherwise = ''): this {
    if (value !== otherwise) {
      this.data[key] = value;
    }
    return this;
  }

  value<T>(key: string, value: T, otherwise: T): this {
    if (value !== otherwise) {
      this.data[key] = value;
    }
    return this;
  }

  list(key: string, value: unknown[], otherwise: unknown[] = []): this {
    if (!sameList(value, otherwise)) {
      this.data[key] = value;
    }
    return this;
  }

  /** A nested object, written only when it says something. */
  part(key: string, value: Data): this {
    if (Object.keys(value).length > 0) {
      this.data[key] = value;
    }
    return this;
  }

  /** A nested object that is written even when empty: its presence is what it says. */
  present(key: string, value: Data | undefined): this {
    if (value !== undefined) {
      this.data[key] = value;
    }
    return this;
  }
}

/** A value with the keys of every mapping in it in alphabetical order. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (isData(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map(key => [key, sorted(value[key])]),
    );
  }
  return value;
}

/** A component as it is written: its `id`, what it is, then the rest in alphabetical order. */
function dumpComponent(component: Data): Data {
  const { id, component: what, ...rest } = component;
  return { id, component: what, ...(sorted(rest) as Data) };
}

function dumpSurface(surface: AppSurfaceSpec): Data {
  return new Writer()
    .text('protocol', surface.protocol, DEFAULT_PROTOCOL)
    .list('components', surface.components.map(dumpComponent))
    .text('composed_by', surface.composedBy)
    .text('composed_at', surface.composedAt).data;
}

function dumpInterface(spec: AppInterfaceSpec, kind: AppKind): Data {
  const writer = new Writer()
    // A layout is written when it is not the one its kind starts with.
    .value<string>('layout', spec.layout, DEFAULT_LAYOUTS[kind])
    .value<string>('accent', spec.accent, 'green')
    .text('welcome', spec.welcome)
    .list(
      'starters',
      spec.starters.map(starter => ({
        label: starter.label,
        message: starter.message,
      })),
    )
    .list(
      'settings',
      spec.settings.map(setting => {
        const written = new Writer()
          .text('id', setting.id, '\u0000')
          .text('type', setting.type, '\u0000')
          .text('label', setting.label, '\u0000')
          .list('options', setting.options);
        for (const key of ['default', 'min', 'max'] as const) {
          if (setting[key] !== undefined) {
            written.data[key] = setting[key];
          }
        }
        return written.data;
      }),
    )
    .list('components', spec.components);
  if (spec.surface) {
    writer.data.surface = dumpSurface(spec.surface);
  }
  if (spec.assistant) {
    writer.data.assistant = spec.assistant;
  }
  if (spec.balloon) {
    writer.data.balloon = spec.balloon;
  }
  // Its voice, when it says one (VO-41): a spec made before voice has none.
  if (spec.voice) {
    writer.part(
      'voice',
      new Writer()
        .value('enabled', spec.voice.enabled, DEFAULT_VOICE.enabled)
        .value<string>('input', spec.voice.input, DEFAULT_VOICE.input)
        .value<string>('output', spec.voice.output, DEFAULT_VOICE.output)
        .text('voice', spec.voice.voice)
        .text('language', spec.voice.language)
        .value<string>('where', spec.voice.where, DEFAULT_VOICE.where).data,
    );
  }
  // The formats its answers come in, words first, when it says any.
  writer.list('outputs', spec.outputs ?? []);
  return writer.data;
}

function dumpDecision(decision: AppDecisionSpec): Data {
  return new Writer()
    .text('question', decision.question, '\u0000')
    .list('alternatives', decision.alternatives)
    .list(
      'criteria',
      decision.criteria.map(
        criterion =>
          new Writer()
            .text('name', criterion.name, '\u0000')
            .value<string>('kind', criterion.kind, 'metric')
            .value('weight', criterion.weight, 1)
            .text('instructions', criterion.instructions)
            .list('options', criterion.options)
            .value<string>('direction', criterion.direction, 'higher')
            .value<string>('measure', criterion.measure, '').data,
      ),
    )
    .value('min_confidence', decision.minConfidence, 0)
    .list(
      'scenarios',
      decision.scenarios.map(
        scenario =>
          new Writer()
            .text('name', scenario.name, '\u0000')
            // By criterion name, in alphabetical order: the spec declares no order.
            .part('weights', sorted(scenario.weights) as Data).data,
      ),
    )
    .text('decision_model', decision.decisionModel).data;
}

/**
 * An application as the document its file holds.
 *
 * The spec's own words, keys in one fixed order, nothing written that is at
 * its default: the same application always writes the same document. What an
 * application carries that is not the spec's — what it needs set up — is left
 * out.
 */
export function dumpAppspec(app: AppSpec): Data {
  const computer = new Writer()
    .value('browse', app.permissions.computer.browse, false)
    .value('files', app.permissions.computer.files, false)
    .value('shell', app.permissions.computer.shell, false).data;
  const writer = new Writer();
  writer.data.schema = APP_SCHEMA;
  writer
    .text('id', app.id, '\u0000')
    .text('version', app.version, DEFAULT_VERSION)
    .text('name', app.name, '\u0000')
    .text('kind', app.kind, '\u0000')
    .text('description', app.description)
    .text('owner', app.owner)
    .text('agent', app.agent)
    .text('team', app.team)
    .text('instructions', app.instructions)
    .text('model', app.model)
    .list('skills', app.skills)
    .list('backend_tools', app.backendTools)
    .list('context', app.context)
    .list('contents', app.contents)
    .list(
      'connections',
      app.connections.map(
        connection =>
          new Writer()
            .text('server', connection.server, '\u0000')
            .value<string>('access', connection.access, 'read')
            .value<string>('as', connection.as, 'owner')
            .list('only', connection.only).data,
      ),
    )
    .list(
      'rules',
      app.rules.map(rule => ({
        action: rule.action,
        // One target is written alone when it is a class, as a person would.
        applies_to:
          rule.appliesTo.length === 1 &&
          ACTION_CLASS_NAMES.includes(rule.appliesTo[0])
            ? rule.appliesTo[0]
            : rule.appliesTo,
        behaviour: rule.behaviour,
      })),
    )
    .part(
      'permissions',
      new Writer()
        .list(
          'spaces',
          app.permissions.spaces.map(
            grant =>
              new Writer()
                .text('space', grant.space, '\u0000')
                .value<string>('access', grant.access, 'read').data,
          ),
        )
        .part('computer', computer).data,
    )
    .part('interface', dumpInterface(app.interface, app.kind))
    .part(
      'tests',
      new Writer()
        .value('ready_at', app.tests.readyAt, DEFAULT_READY_AT)
        .text('evalset', app.tests.evalset)
        .list(
          'cases',
          app.tests.cases.map(testCase => ({
            ask: testCase.ask,
            expect: testCase.expect,
          })),
        )
        .part(
          'verified',
          new Writer()
            .list('live', app.tests.verified.live)
            .list('recorded', app.tests.verified.recorded)
            .list('unverified', app.tests.verified.unverified).data,
        ).data,
    )
    .part(
      'record',
      new Writer()
        .text('keep_for', app.record.keepFor, DEFAULT_KEEP_FOR)
        .list('include', app.record.include, DEFAULT_RECORD_INCLUDE)
        .value('suggest_tests', app.record.suggestTests, false).data,
    )
    .part(
      'checks',
      new Writer()
        .list('guards', app.checks.guards)
        .list('gates', app.checks.gates)
        .text('track', app.checks.track).data,
    )
    .part(
      'deployment',
      new Writer()
        .present(
          'hosted',
          app.deployment.hosted &&
            new Writer()
              .value<string>(
                'visibility',
                app.deployment.hosted.visibility,
                'private',
              )
              .text('slug', app.deployment.hosted.slug)
              .value<boolean>(
                'character_alone',
                app.deployment.hosted.characterAlone === true,
                false,
              ).data,
        )
        .present(
          'embedded',
          app.deployment.embedded &&
            new Writer()
              .value<string>('mode', app.deployment.embedded.mode, 'inline')
              .list('origins', app.deployment.embedded.origins)
              .present(
                'host',
                app.deployment.embedded.host &&
                  new Writer()
                    .list('context', app.deployment.embedded.host.context)
                    .list(
                      'functions',
                      app.deployment.embedded.host.functions.map(fn => ({
                        name: fn.name,
                        description: fn.description,
                        // No arguments is what it is unless said.
                        ...(JSON.stringify(fn.parameters) ===
                        JSON.stringify(NO_HOST_PARAMETERS)
                          ? {}
                          : { parameters: fn.parameters }),
                      })),
                    ).data,
              ).data,
        ).data,
    )
    .text('goal', app.goal)
    .list(
      'triggers',
      app.triggers.map(
        trigger =>
          new Writer()
            .text('type', trigger.type, '\u0000')
            .text('cron', trigger.cron)
            .text('event', trigger.event)
            .text('at', trigger.at)
            .text('description', trigger.description)
            .text('prompt', trigger.prompt).data,
      ),
    )
    .text('memory', app.memory)
    .list('notifications', app.notifications);
  if (app.decision) {
    writer.data.decision = dumpDecision(app.decision);
  }
  writer
    .value('enabled', app.enabled, true)
    .list('tags', app.tags)
    .text('icon', app.icon ?? DEFAULT_ICON, DEFAULT_ICON)
    .text('emoji', app.emoji, DEFAULT_EMOJI)
    .text('avatar', app.avatar ?? '', '')
    .text('banner', app.banner ?? '', '');
  return writer.data;
}

/** The keys of a document in the order they are written. */
export const APPSPEC_KEY_ORDER: readonly string[] = KNOWN_KEYS;
