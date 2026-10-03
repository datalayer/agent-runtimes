/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The instant checks of an application (LOOP V-01 to V-04): what an editor
 * shows on every change, with no model call.
 *
 * The same checks `loop apps validate` runs with agentspecs, in the words it
 * uses, read here from the catalogues this package generates:
 *
 * - **problems** — what stops the application from being used: what the spec
 *   refuses, and every reference that does not resolve (V-01);
 * - **attention** — what its builder should have decided rather than left to
 *   the defaults: what it can do with no rule of its own, what it reaches with
 *   the builder's account, a record of nothing (V-03);
 * - **setup** — what it names that is not enabled today.
 *
 * The verdict is said in the Studio's words: *Not ready* with a problem,
 * *Needs attention* with something to decide, and otherwise the instant
 * checks pass — which is not yet *Ready*: that takes its tests.
 *
 * Pure: nothing here calls a service.
 *
 * @module loop/apps/checks
 */

import { getAgentspecs } from '../../specs/agents';
import { getCog } from '../../specs/cogs';
import { getFrame } from '../../specs/frames';
import { getGate } from '../../specs/gates';
import { GUARD_CATALOGUE } from '../../specs/guards';
import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { getMemory } from '../../specs/memory';
import { getModel } from '../../specs/models';
import { getNotificationSpec } from '../../specs/notifications';
import { getSkillSpec } from '../../specs/skills';
import { getTeamSpec } from '../../specs/teams';
import { getToolSpec } from '../../specs/tools';
import { getTrack } from '../../specs/tracks';
import type { ActionClass, AppSpec } from '../../types/agentspecs';
import { parseAppspec } from './appspec';
import { classesOf, splitRef, toolBehaviours } from './rules';

export const NOT_READY = 'Not ready';
export const NEEDS_ATTENTION = 'Needs attention';
export const PASSES = 'Passes the instant checks';

export type CheckVerdict =
  typeof NOT_READY | typeof NEEDS_ATTENTION | typeof PASSES;

export interface AppCheck {
  verdict: CheckVerdict;
  problems: string[];
  attention: string[];
  setup: string[];
}

/** The id of a reference, `id` or `id:version`. */
const idOf = (ref: string): string => {
  const at = ref.lastIndexOf(':');
  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;
};

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

const ACTIONS: Partial<Record<ActionClass, string>> = {
  write: 'create or change things',
  send: 'send',
  buy: 'buy',
  delete: 'delete',
  publish: 'share or publish',
};

const CLASS_NAMES = new Set([
  'read',
  'write',
  'send',
  'buy',
  'delete',
  'publish',
]);

/** Whether a name matches a pattern of `*` and `?`, as the rules read it. */
const matches = (name: string, pattern: string): boolean =>
  new RegExp(
    '^' +
      Array.from(pattern, c =>
        c === '*'
          ? '[\\s\\S]*'
          : c === '?'
            ? '[\\s\\S]'
            : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      ).join('') +
      '$',
  ).test(name);

/** What the spec says of itself that the tolerant reader lets through. */
function shapeProblems(app: AppSpec): string[] {
  const problems: string[] = [];
  if (!app.id.trim()) {
    problems.push('The application has no `id`.');
  } else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(app.id)) {
    problems.push(
      `Cannot use “${app.id}” as an id: lower-case letters, digits and hyphens.`,
    );
  }
  if (!app.name.trim()) {
    problems.push('The application has no `name`.');
  }
  if (Boolean(app.agent) === Boolean(app.team)) {
    problems.push(
      'An application names who does the work: an `agent`, or a `team`, and not both.',
    );
  }
  if (app.kind === 'decision' && !app.decision) {
    problems.push(
      'A decision application says what it decides, under `decision`.',
    );
  }
  if (app.kind !== 'decision' && app.decision) {
    problems.push(
      `A ${app.kind} application decides nothing: remove \`decision\`, or make it a decision.`,
    );
  }
  if (app.kind === 'worker') {
    if (!app.goal.trim()) {
      problems.push('A worker says its `goal`.');
    }
    if (app.triggers.length === 0) {
      problems.push('A worker says what starts its work, under `triggers`.');
    }
  } else if (app.triggers.length > 0) {
    problems.push(
      `A ${app.kind} application starts when somebody opens it: \`triggers\` are a worker's.`,
    );
  }
  const servers = app.connections.map(connection => idOf(connection.server));
  if (new Set(servers).size !== servers.length) {
    problems.push('The application connects to the same server twice.');
  }
  const seen = new Map<string, string>();
  for (const rule of app.rules) {
    if (!rule.action.trim()) {
      problems.push('A rule names its action in words.');
    }
    if (rule.appliesTo.length === 0) {
      problems.push(
        `The rule “${rule.action}” applies to a class of action or to named tools.`,
      );
    }
    for (const target of rule.appliesTo) {
      const [server, name] = splitRef(target);
      const key = server !== undefined ? `${idOf(server)}.${name}` : target;
      const before = seen.get(key);
      if (before !== undefined) {
        problems.push(
          `The rules “${before}” and “${rule.action}” both apply to “${key}”: keep one.`,
        );
      }
      seen.set(key, rule.action);
    }
  }
  return problems;
}

/** Every reference that does not resolve, in sentences. */
function referenceProblems(app: AppSpec): string[] {
  const problems: string[] = [];
  const missing = (what: string, ref: string) =>
    problems.push(`There is no ${what} named “${ref}”.`);
  if (app.agent && !getAgentspecs(idOf(app.agent)) && !getCog(app.agent)) {
    missing('agent or Cog', app.agent);
  }
  if (app.team && !getTeamSpec(idOf(app.team))) {
    missing('team', app.team);
  }
  for (const ref of app.context) {
    if (!getFrame(idOf(ref))) missing('Frame', ref);
  }
  for (const connection of app.connections) {
    if (!own(MCP_SERVER_LIBRARY, idOf(connection.server))) {
      missing('MCP server', connection.server);
    }
  }
  for (const ref of app.skills) {
    if (!getSkillSpec(idOf(ref))) missing('skill', ref);
  }
  for (const ref of app.tools) {
    if (!getToolSpec(idOf(ref))) missing('tool', ref);
  }
  for (const ref of app.checks.guards) {
    if (!own(GUARD_CATALOGUE, idOf(ref))) missing('Guard', ref);
  }
  for (const ref of app.checks.gates) {
    if (!getGate(ref)) missing('Gate', ref);
  }
  if (app.checks.track && !getTrack(app.checks.track)) {
    missing('Track', app.checks.track);
  }
  if (app.memory && !getMemory(idOf(app.memory))) {
    missing('memory', app.memory);
  }
  for (const ref of app.notifications) {
    if (!getNotificationSpec(idOf(ref))) missing('notification', ref);
  }
  if (app.model && !getModel(app.model)) {
    missing('model', app.model);
  }
  const judge = app.decision?.judgmentModel;
  if (judge) {
    const model = getModel(judge);
    if (!model) {
      problems.push(`There is no model named “${judge}” to judge with.`);
    } else if (!(model.capabilities ?? []).includes('judgments')) {
      problems.push(`The model “${judge}” does not answer typed judgments.`);
    }
  }
  const run = new Set(app.checks.guards.map(idOf));
  for (const ref of app.checks.gates) {
    for (const guard of getGate(ref)?.guards ?? []) {
      if (!run.has(idOf(guard))) {
        problems.push(
          `The Gate “${ref}” reads the Guard “${guard}”, which the application does not run: add it under \`checks.guards\`.`,
        );
      }
    }
  }
  for (const connection of app.connections) {
    if (
      connection.access === 'write' &&
      own(MCP_SERVER_LIBRARY, idOf(connection.server)) &&
      Object.keys(toolBehaviours({ ...app, connections: [connection] }))
        .length === 0
    ) {
      problems.push(
        `The application may write through “${connection.server}”, whose tools nobody has classed: every one of them is left to the person until they are.`,
      );
    }
  }
  for (const rule of app.rules) {
    for (const target of rule.appliesTo) {
      if (CLASS_NAMES.has(target)) continue;
      const [server, name] = splitRef(target);
      if (server === undefined) {
        if (!getToolSpec(name)) {
          problems.push(
            `The rule “${rule.action}” names the tool “${target}”, which the catalogue does not have.`,
          );
        }
        continue;
      }
      const connection = app.connections.find(
        c => idOf(c.server) === idOf(server),
      );
      if (!connection) {
        problems.push(
          `The rule “${rule.action}” names “${target}”, and the application is not connected to “${server}”.`,
        );
      } else if (
        connection.only.length > 0 &&
        !connection.only.some(pattern => matches(name, pattern))
      ) {
        problems.push(
          `The rule “${rule.action}” names “${target}”, which the connection to “${server}” leaves out (\`only\`).`,
        );
      }
    }
  }
  return problems;
}

/** What the application can do with no rule of its own, and what it keeps. */
function attentionNotes(app: AppSpec): string[] {
  const notes: string[] = [];
  // Versions aside: `slack:0.0.1.post` and `slack.post` are one tool.
  const normal = (target: string): string => {
    if (CLASS_NAMES.has(target)) return target;
    const [server, name] = splitRef(target);
    return server !== undefined ? `${idOf(server)}.${name}` : name;
  };
  const ruled = new Set(app.rules.flatMap(rule => rule.appliesTo.map(normal)));
  const unruled = new Map<ActionClass, string[]>();
  for (const tool of Object.keys(toolBehaviours(app))) {
    for (const action of classesOf(tool)) {
      if (ACTIONS[action] && !ruled.has(action) && !ruled.has(tool)) {
        unruled.set(action, [...(unruled.get(action) ?? []), tool]);
      }
    }
  }
  for (const [action, tools] of [...unruled.entries()].sort()) {
    const shown = [...tools].sort().slice(0, 3).join(', ');
    const more = tools.length > 3 ? ` and ${tools.length - 3} more` : '';
    notes.push(
      `It can ${ACTIONS[action]} (${shown}${more}), and no rule of its own says what then: it will ask first. Write the rule.`,
    );
  }
  for (const connection of app.connections) {
    if (connection.as === 'owner' && connection.access === 'write') {
      notes.push(
        `It writes through ${connection.server} with its builder's account, for everybody who uses it. Is that meant?`,
      );
    }
  }
  if (app.record.include.length === 0) {
    notes.push('It keeps no record of what it did.');
  }
  return notes;
}

/** Whether a spec of the catalogue says it is not offered today. */
const isOff = (spec: unknown): boolean => {
  const fields = (spec ?? {}) as { enabled?: unknown; available?: unknown };
  return fields.enabled === false || fields.available === false;
};

/**
 * What it names that is not offered today: everything it references, as
 * agentspecs' `app_setup` says it.
 */
function setupNotes(app: AppSpec): string[] {
  const setup: string[] = [];
  const note = (what: string, ref: string, spec: unknown) => {
    if (spec && isOff(spec)) {
      setup.push(`The ${what} “${ref}” is not enabled.`);
    }
  };
  if (app.agent) {
    const cog = getCog(app.agent);
    note(
      cog ? 'Cog' : 'agent',
      app.agent,
      cog ?? getAgentspecs(idOf(app.agent)),
    );
  }
  if (app.team) note('team', app.team, getTeamSpec(idOf(app.team)));
  for (const ref of app.context) note('Frame', ref, getFrame(idOf(ref)));
  for (const connection of app.connections) {
    note(
      'MCP server',
      connection.server,
      own(MCP_SERVER_LIBRARY, idOf(connection.server)),
    );
  }
  for (const ref of app.skills) note('skill', ref, getSkillSpec(idOf(ref)));
  for (const ref of app.tools) note('tool', ref, getToolSpec(idOf(ref)));
  for (const ref of app.checks.guards)
    note('Guard', ref, own(GUARD_CATALOGUE, idOf(ref)));
  for (const ref of app.checks.gates) note('Gate', ref, getGate(ref));
  if (app.checks.track)
    note('Track', app.checks.track, getTrack(app.checks.track));
  if (app.memory) note('memory', app.memory, getMemory(idOf(app.memory)));
  for (const ref of app.notifications)
    note('notification', ref, getNotificationSpec(idOf(ref)));
  return setup;
}

/** The instant checks of an application as an editor holds it. */
export function checkApp(app: AppSpec, read: string[] = []): AppCheck {
  const problems = [...read, ...shapeProblems(app), ...referenceProblems(app)];
  const setup = setupNotes(app);
  if (problems.length > 0) {
    return { verdict: NOT_READY, problems, attention: [], setup };
  }
  const attention = attentionNotes(app);
  return {
    verdict: attention.length > 0 ? NEEDS_ATTENTION : PASSES,
    problems,
    attention,
    setup,
  };
}

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ENUMS = {
  access: ['read', 'write'],
  as: ['owner', 'user'],
  behaviour: ['do_it', 'if_asked', 'ask_first', 'leave_to_me'],
  layout: ['chat', 'page', 'split'],
  accent: ['green', 'rose', 'sky', 'lime', 'sun', 'violet'],
  settingType: ['select', 'text', 'toggle', 'slider', 'number'],
  record: [
    'conversations',
    'actions',
    'decisions',
    'approvals',
    'checks',
    'sources',
    'outputs',
    'feedback',
  ],
  visibility: ['private', 'invited', 'organization', 'link', 'public'],
  mode: ['inline', 'bubble', 'panel'],
  trigger: ['schedule', 'event', 'once'],
  criterion: ['metric', 'noul', 'choice', 'score'],
  direction: ['higher', 'lower'],
  measure: ['', 'pass_rate', 'cost_per_task', 'seconds_per_task'],
} as const;

/**
 * What the document says in a shape the spec refuses — a list where a list is
 * not, a word where a choice is — which the tolerant reader replaces with a
 * default. `loop apps validate` refuses these; so does this.
 */
export function documentShapeProblems(document: unknown): string[] {
  const problems: string[] = [];
  if (!isRaw(document)) return problems;
  const at = (path: string, what: string) => problems.push(`${path}: ${what}.`);
  const text = (value: unknown, path: string) => {
    if (value !== undefined && typeof value !== 'string')
      at(path, 'is a word or a sentence');
  };
  const oneOf = (value: unknown, allowed: readonly string[], path: string) => {
    if (value !== undefined && !allowed.includes(value as string)) {
      at(path, `is one of ${allowed.filter(Boolean).join(', ')}`);
    }
  };
  const texts = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      at(path, 'is a list of words');
    }
  };
  const records = (
    value: unknown,
    path: string,
    each: (item: Raw, where: string) => void,
  ) => {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      at(path, 'is a list');
      return;
    }
    value.forEach((item, index) => {
      if (!isRaw(item)) at(`${path}.${index}`, 'is a mapping');
      else each(item, `${path}.${index}`);
    });
  };
  const mapping = (value: unknown, path: string, each: (item: Raw) => void) => {
    if (value === undefined) return;
    if (!isRaw(value)) at(path, 'is a mapping');
    else each(value);
  };
  const required = (item: Raw, key: string, where: string) => {
    if (item[key] === undefined) at(`${where}.${key}`, 'is missing');
  };
  const d = document;
  for (const key of [
    'id',
    'version',
    'name',
    'description',
    'owner',
    'agent',
    'team',
    'instructions',
    'model',
    'goal',
    'memory',
    'emoji',
    'icon',
  ]) {
    text(d[key], key);
  }
  for (const key of [
    'skills',
    'tools',
    'context',
    'contents',
    'notifications',
    'tags',
  ])
    texts(d[key], key);
  if (d.enabled !== undefined && typeof d.enabled !== 'boolean')
    at('enabled', 'is true or false');
  records(d.connections, 'connections', (item, where) => {
    required(item, 'server', where);
    text(item.server, `${where}.server`);
    oneOf(item.access, ENUMS.access, `${where}.access`);
    oneOf(item.as, ENUMS.as, `${where}.as`);
    texts(item.only, `${where}.only`);
  });
  records(d.rules, 'rules', (item, where) => {
    required(item, 'action', where);
    required(item, 'applies_to', where);
    required(item, 'behaviour', where);
    text(item.action, `${where}.action`);
    if (typeof item.applies_to !== 'string')
      texts(item.applies_to, `${where}.applies_to`);
    oneOf(item.behaviour, ENUMS.behaviour, `${where}.behaviour`);
  });
  mapping(d.permissions, 'permissions', permissions => {
    records(permissions.spaces, 'permissions.spaces', (item, where) => {
      required(item, 'space', where);
      oneOf(item.access, ENUMS.access, `${where}.access`);
    });
    mapping(permissions.computer, 'permissions.computer', computer => {
      for (const key of ['browse', 'files', 'shell']) {
        if (computer[key] !== undefined && typeof computer[key] !== 'boolean') {
          at(`permissions.computer.${key}`, 'is true or false');
        }
      }
    });
  });
  mapping(d.interface, 'interface', ui => {
    oneOf(ui.layout, ENUMS.layout, 'interface.layout');
    oneOf(ui.accent, ENUMS.accent, 'interface.accent');
    text(ui.welcome, 'interface.welcome');
    texts(ui.components, 'interface.components');
    records(ui.starters, 'interface.starters', (item, where) => {
      required(item, 'label', where);
      required(item, 'message', where);
    });
    records(ui.settings, 'interface.settings', (item, where) => {
      required(item, 'id', where);
      required(item, 'type', where);
      required(item, 'label', where);
      oneOf(item.type, ENUMS.settingType, `${where}.type`);
      texts(item.options, `${where}.options`);
    });
    mapping(ui.surface, 'interface.surface', surface => {
      records(
        surface.components,
        'interface.surface.components',
        (item, where) => {
          required(item, 'id', where);
          required(item, 'component', where);
        },
      );
    });
  });
  mapping(d.tests, 'tests', tests => {
    const readyAt = tests.ready_at;
    if (
      readyAt !== undefined &&
      (typeof readyAt !== 'number' || readyAt < 0 || readyAt > 1)
    ) {
      at('tests.ready_at', 'is a share, from 0 to 1');
    }
    text(tests.evalset, 'tests.evalset');
    records(tests.cases, 'tests.cases', (item, where) => {
      required(item, 'ask', where);
      required(item, 'expect', where);
    });
  });
  mapping(d.record, 'record', record => {
    text(record.keep_for, 'record.keep_for');
    if (record.include !== undefined) {
      if (!Array.isArray(record.include)) at('record.include', 'is a list');
      else
        record.include.forEach((item, index) =>
          oneOf(item, ENUMS.record, `record.include.${index}`),
        );
    }
  });
  mapping(d.checks, 'checks', checks => {
    texts(checks.guards, 'checks.guards');
    texts(checks.gates, 'checks.gates');
    text(checks.track, 'checks.track');
  });
  mapping(d.deployment, 'deployment', deployment => {
    mapping(deployment.hosted, 'deployment.hosted', hosted => {
      oneOf(
        hosted.visibility,
        ENUMS.visibility,
        'deployment.hosted.visibility',
      );
      if (
        hosted.slug !== undefined &&
        (typeof hosted.slug !== 'string' ||
          (hosted.slug &&
            !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(hosted.slug)))
      ) {
        at(
          'deployment.hosted.slug',
          'is lower-case letters, digits and hyphens',
        );
      }
    });
    mapping(deployment.embedded, 'deployment.embedded', embedded => {
      oneOf(embedded.mode, ENUMS.mode, 'deployment.embedded.mode');
      texts(embedded.origins, 'deployment.embedded.origins');
      if (Array.isArray(embedded.origins)) {
        embedded.origins.forEach((origin, index) => {
          if (
            typeof origin === 'string' &&
            !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(
              origin,
            )
          ) {
            at(
              `deployment.embedded.origins.${index}`,
              'is an origin: https://example.com, without a path',
            );
          }
        });
      }
    });
  });
  records(d.triggers, 'triggers', (item, where) => {
    required(item, 'type', where);
    oneOf(item.type, ENUMS.trigger, `${where}.type`);
  });
  mapping(d.decision, 'decision', decision => {
    required(decision, 'question', 'decision');
    texts(decision.alternatives, 'decision.alternatives');
    records(decision.criteria, 'decision.criteria', (item, where) => {
      required(item, 'name', where);
      oneOf(item.kind, ENUMS.criterion, `${where}.kind`);
      oneOf(item.direction, ENUMS.direction, `${where}.direction`);
      oneOf(item.measure, ENUMS.measure, `${where}.measure`);
      if (
        item.weight !== undefined &&
        (typeof item.weight !== 'number' || item.weight < 0)
      ) {
        at(`${where}.weight`, 'is a number, zero or more');
      }
      texts(item.options, `${where}.options`);
    });
    const minimum = decision.min_confidence;
    if (
      minimum !== undefined &&
      (typeof minimum !== 'number' || minimum < 0 || minimum > 1)
    ) {
      at('decision.min_confidence', 'is a share, from 0 to 1');
    }
  });
  return problems;
}

/** The instant checks of an application's document, what reading it found included. */
export function checkAppspec(document: unknown): AppCheck {
  const { app, problems } = parseAppspec(document);
  return checkApp(app, [...problems, ...documentShapeProblems(document)]);
}
