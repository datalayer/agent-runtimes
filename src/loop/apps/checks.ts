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
  const ruled = new Set(app.rules.flatMap(rule => rule.appliesTo));
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

/** What it names that is not offered today. */
function setupNotes(app: AppSpec): string[] {
  const setup: string[] = [];
  if (app.agent) {
    const agent = getAgentspecs(idOf(app.agent));
    const cog = getCog(app.agent);
    if (agent && agent.enabled === false && !cog) {
      setup.push(`The agent “${app.agent}” is not enabled.`);
    }
    if (cog && cog.enabled === false) {
      setup.push(`The Cog “${app.agent}” is not enabled.`);
    }
  }
  for (const connection of app.connections) {
    const server = own(MCP_SERVER_LIBRARY, idOf(connection.server));
    if (server && server.enabled === false) {
      setup.push(`The MCP server “${connection.server}” is not enabled.`);
    }
  }
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

/** The instant checks of an application's document, what reading it found included. */
export function checkAppspec(document: unknown): AppCheck {
  const { app, problems } = parseAppspec(document);
  return checkApp(app, problems);
}
