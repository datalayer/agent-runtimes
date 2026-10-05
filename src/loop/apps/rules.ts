/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application does when its agent calls a tool.
 *
 * A rule is written in a person's words — *ask me before it sends anything* —
 * and applies to what a tool does: a class of action (read, write, send, buy,
 * delete, publish) or named tools. The classes are the catalogue's
 * (`specs/actions`), written on every tool by somebody who looked; a tool
 * nobody classed is unknown, and unknown is the most restricted.
 *
 * The decision, in order:
 *
 * 1. a tool of a server the application is not connected to, or that its
 *    connection leaves out (`only`), is left to the person: an application
 *    reaches nothing it does not name;
 * 2. a tool that can act, on a connection that only reads, is left to the person;
 * 3. a rule that names the tool decides what the tool does of its own — and
 *    what the arguments of the call make it do *besides* is still decided by
 *    its class: *label a message: do it* does not become *trash it: do it*;
 * 4. a tool nobody classed is left to the person;
 * 5. otherwise each of its classes is decided by the rule on that class — or,
 *    with no rule, reading is done and anything that acts waits for a person —
 *    and the most restricted wins.
 *
 * The same decision is written in Python, in `agentspecs.apps.behaviour_for`
 * and in `agent_runtimes.loop.apps.rules`. `APP_BEHAVIOURS`, generated from
 * agentspecs, is what all three have to agree on. The server enforces; this
 * one shows the decision before it is made.
 *
 * Pure: nothing here calls a tool or renders.
 *
 * @module loop/apps/rules
 */

import { SERVER_ACTIONS, TOOL_ACTIONS } from '../../specs/actions';
import type {
  ActionClass,
  ActionConditionSpec,
  AppBehaviour,
  AppConnectionSpec,
  AppEscalation,
  AppSpec,
} from '../../types/agentspecs';

/** The arguments of a tool call. */
export type ToolArguments = Record<string, unknown>;

/** The four behaviours, from the freest to the most restricted. */
export const BEHAVIOURS: AppBehaviour[] = [
  'do_it',
  'if_asked',
  'ask_first',
  'leave_to_me',
];

/**
 * What an application does about a class no rule of its own covers. Reading
 * needs no rule; anything that acts waits for a person: never `do_it`.
 */
export const DEFAULT_BEHAVIOURS: Record<ActionClass, AppBehaviour> = {
  read: 'do_it',
  write: 'ask_first',
  send: 'ask_first',
  buy: 'ask_first',
  delete: 'ask_first',
  publish: 'ask_first',
};

const SERVER_TOOL =
  /^([A-Za-z0-9_-]+)(?::\d+(?:\.\d+)*)?\.([A-Za-z_][A-Za-z0-9_-]*)$/;

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** The id of a reference, `id` or `id:version`. */
const idOf = (ref: string): string => {
  const at = ref.lastIndexOf(':');
  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;
};

/** A tool reference as [server, tool]: `tavily.tavily_search`, or a tool id alone. */
export function splitRef(ref: string): [string | undefined, string] {
  const matched = SERVER_TOOL.exec(ref);
  return matched ? [matched[1], matched[2]] : [undefined, idOf(ref)];
}

/** Whether a tool name is a pattern: it stands for several. */
export const isPattern = (name: string): boolean => /[*?]/.test(name);

/**
 * Whether a name matches a pattern: `*` is any run of characters, `?` any one.
 *
 * Nothing else is special — no bracket expressions — and case counts: the
 * same pattern means the same thing here and in Python.
 */
export function matchesPattern(name: string, pattern: string): boolean {
  const expression = Array.from(pattern, character =>
    character === '*'
      ? '[\\s\\S]*'
      : character === '?'
        ? '[\\s\\S]'
        : character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('');
  return new RegExp(`^${expression}$`).test(name);
}

/**
 * Whether a value is one every reader compares the same way: a word, true or
 * false, or a number that is finite and — when it is whole — held exactly.
 * Beyond `Number.MAX_SAFE_INTEGER` two different integers are one number
 * here and two in Python.
 */
export const isComparable = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value)));

/** Whether an argument's value is the one a condition names; words whatever their case. */
const same = (value: unknown, wanted: unknown): boolean =>
  typeof value === 'string' && typeof wanted === 'string'
    ? value.trim().toLowerCase() === wanted.trim().toLowerCase()
    : isComparable(value) && isComparable(wanted) && value === wanted;

/** Whether the arguments of a call make a condition true. */
export function conditionHolds(
  condition: ActionConditionSpec,
  args: ToolArguments,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(args, condition.argument)) {
    return false;
  }
  const value = args[condition.argument];
  if (condition.equals?.some(wanted => same(value, wanted))) {
    return true;
  }
  if (condition.includes?.length) {
    const values = Array.isArray(value) ? value : [value];
    return values.some(item =>
      condition.includes!.some(wanted => same(item, wanted)),
    );
  }
  return false;
}

/** What answers for a tool of a server: its own classes, and its conditions. */
function entryOf(
  server: string,
  name: string,
): [ActionClass[], ActionConditionSpec[]] {
  const actions = own(SERVER_ACTIONS, server);
  if (!actions) {
    return [[], []];
  }
  const exact = own(actions.tools, name);
  if (exact) {
    return [[...exact], own(actions.conditions, name) ?? []];
  }
  for (const [pattern, classes] of Object.entries(actions.tools)) {
    if (isPattern(pattern) && matchesPattern(name, pattern)) {
      return [[...classes], own(actions.conditions, pattern) ?? []];
    }
  }
  return [[...actions.default], []];
}

/**
 * The classes of a tool, by reference; empty when nobody classed it.
 *
 * With the arguments of a call, the classes of that call. Without them,
 * everything the tool can do: nobody said what it is asked.
 */
export function classesOf(ref: string, args?: ToolArguments): ActionClass[] {
  const [server, name] = splitRef(ref);
  if (server === undefined) {
    return [...(own(TOOL_ACTIONS, name) ?? [])];
  }
  const [classes, conditions] = entryOf(server, name);
  for (const condition of conditions) {
    if (args === undefined || conditionHolds(condition, args)) {
      for (const item of condition.classes) {
        if (!classes.includes(item)) {
          classes.push(item);
        }
      }
    }
  }
  return classes;
}

/** Whether a tool only reads. An unknown tool — no class — does not. */
export const isReadOnly = (classes: ActionClass[]): boolean =>
  classes.length > 0 && classes.every(item => item === 'read');

/** The most restricted of several behaviours. */
export const strictest = (behaviours: AppBehaviour[]): AppBehaviour =>
  behaviours.reduce((worst, behaviour) =>
    BEHAVIOURS.indexOf(behaviour) > BEHAVIOURS.indexOf(worst)
      ? behaviour
      : worst,
  );

const connectionTo = (
  app: Pick<AppSpec, 'connections'>,
  server: string,
): AppConnectionSpec | undefined =>
  app.connections.find(connection => idOf(connection.server) === server);

const reaches = (connection: AppConnectionSpec, tool: string): boolean =>
  connection.only.length === 0 ||
  connection.only.some(pattern => matchesPattern(tool, pattern));

/**
 * Whether the application is given a tool of a server: its connection's
 * level (LOOP U-15). A connection gives the tools of its server it reaches
 * (`only`); one that only reads gives only the tools that only read — a tool
 * nobody classed is taken to write, so a read connection does not give it.
 * A tool of a server the application is not connected to is not given.
 *
 * The runtime gives its agent only these (`AppRulesCapability.prepare_tools`,
 * through `agent_runtimes.loop.apps.rules.gives`, its Python twin).
 *
 * @throws When `tool` names no server: a catalogue tool is given by the
 *   spec's `tools`, not by a connection.
 */
export function gives(
  app: Pick<AppSpec, 'connections'>,
  tool: string,
): boolean {
  const [server, name] = splitRef(tool);
  if (server === undefined) {
    throw new Error(`\`${tool}\` is not a tool of a server (\`server.tool\`).`);
  }
  const connection = connectionTo(app, server);
  if (!connection || !reaches(connection, name)) {
    return false;
  }
  return (
    connection.access !== 'read' || isReadOnly(classesOf(`${server}.${name}`))
  );
}

const isClass = (target: string): target is ActionClass =>
  Object.prototype.hasOwnProperty.call(DEFAULT_BEHAVIOURS, target);

/** What a rule applies to, versions aside. */
const normal = (target: string): string => {
  if (isClass(target)) {
    return target;
  }
  const [server, name] = splitRef(target);
  return server !== undefined ? `${server}.${name}` : name;
};

/** What the rules on classes decide for each of these classes. */
const byClasses = (
  app: Pick<AppSpec, 'rules'>,
  classes: ActionClass[],
): AppBehaviour[] => {
  const byClass: Partial<Record<ActionClass, AppBehaviour>> = {};
  for (const rule of app.rules) {
    for (const target of rule.appliesTo) {
      if (isClass(target)) {
        byClass[target] = rule.behaviour;
      }
    }
  }
  return classes.map(item => byClass[item] ?? DEFAULT_BEHAVIOURS[item]);
};

/** What `behaviourFor` may be told about the call. */
export interface BehaviourOptions {
  /** The arguments of the call; without them the decision is for the worst the tool can do. */
  arguments?: ToolArguments;
  /** The tool's classes, when the catalogue does not know it. */
  classes?: ActionClass[];
}

/**
 * What an application does when its agent calls a tool.
 *
 * `tool` is `server.tool` for a tool of an MCP server, or the id of a tool
 * of the catalogue. Its classes are the catalogue's, unless given.
 */
export function behaviourFor(
  app: Pick<AppSpec, 'connections' | 'rules'>,
  tool: string,
  options: BehaviourOptions = {},
): AppBehaviour {
  const [server, name] = splitRef(tool);
  let ownClasses: ActionClass[];
  let besides: ActionClass[] = [];
  let possible: ActionClass[];
  if (options.classes) {
    ownClasses = possible = [...options.classes];
  } else {
    possible = classesOf(tool);
    ownClasses = classesOf(tool, {});
    const now =
      options.arguments === undefined
        ? possible
        : classesOf(tool, options.arguments);
    besides = now.filter(item => !ownClasses.includes(item));
  }
  if (server !== undefined) {
    const connection = connectionTo(app, server);
    if (!connection || !reaches(connection, name)) {
      return 'leave_to_me';
    }
    if (
      connection.access === 'read' &&
      possible.some(item => item !== 'read')
    ) {
      return 'leave_to_me';
    }
  }
  const wanted = server !== undefined ? `${server}.${name}` : name;
  for (const rule of app.rules) {
    if (
      rule.appliesTo.some(
        target => !isClass(target) && normal(target) === wanted,
      )
    ) {
      return strictest([rule.behaviour, ...byClasses(app, besides)]);
    }
  }
  if (ownClasses.length === 0 && besides.length === 0) {
    return 'leave_to_me';
  }
  return strictest(byClasses(app, [...ownClasses, ...besides]));
}

/**
 * What the application does about every classed tool of the servers it
 * connects to, each in its plain use — no argument that makes it do more; see
 * {@link toolEscalations} for those. A server that classes its tools by a
 * pattern is reported by that pattern.
 */
export function toolBehaviours(
  app: Pick<AppSpec, 'connections' | 'rules'>,
): Record<string, AppBehaviour> {
  const behaviours: Record<string, AppBehaviour> = {};
  for (const connection of app.connections) {
    const server = idOf(connection.server);
    const actions = own(SERVER_ACTIONS, server);
    if (!actions) {
      continue;
    }
    for (const [name, found] of Object.entries(actions.tools)) {
      const ref = `${server}.${name}`;
      if (!isPattern(name)) {
        behaviours[ref] = behaviourFor(app, ref, { arguments: {} });
      } else if (
        connection.access === 'read' &&
        found.some(item => item !== 'read')
      ) {
        behaviours[ref] = 'leave_to_me';
      } else {
        behaviours[ref] =
          found.length > 0 ? strictest(byClasses(app, found)) : 'leave_to_me';
      }
    }
  }
  return behaviours;
}

/** Where what a tool is asked changes what the application does about it. */
export function toolEscalations(
  app: Pick<AppSpec, 'connections' | 'rules'>,
): Record<string, AppEscalation[]> {
  const escalations: Record<string, AppEscalation[]> = {};
  for (const connection of app.connections) {
    const server = idOf(connection.server);
    const actions = own(SERVER_ACTIONS, server);
    if (!actions) {
      continue;
    }
    for (const [name, conditions] of Object.entries(actions.conditions)) {
      if (isPattern(name)) {
        continue;
      }
      const ref = `${server}.${name}`;
      const plain = behaviourFor(app, ref, { arguments: {} });
      for (const condition of conditions) {
        const values = condition.includes?.length
          ? condition.includes
          : (condition.equals ?? []);
        const value = condition.includes?.length ? [values[0]] : values[0];
        const then = behaviourFor(app, ref, {
          arguments: { [condition.argument]: value },
        });
        if (then !== plain) {
          (escalations[ref] ??= []).push({ ...condition, behaviour: then });
        }
      }
    }
  }
  return escalations;
}

// --- in words ----------------------------------------------------------------------

/**
 * The four behaviours, as a person reads them: what the Studio's rules card
 * and an application's own rules and approvals card (R-01b) say. The same
 * words as the Studio's vocabulary.
 */
export const BEHAVIOUR_WORDS: Record<
  AppBehaviour,
  { says: string; means: string }
> = {
  do_it: { says: 'Do it', means: 'It does it without asking.' },
  if_asked: {
    says: 'Do it if I asked',
    means: 'Only what you approved in advance.',
  },
  ask_first: { says: 'Ask me first', means: 'It waits for your yes.' },
  leave_to_me: {
    says: 'Leave it to me',
    means: 'It never does it, and hands it to you.',
  },
};

/** What a class of action is, as a person reads it. */
export const ACTION_WORDS: Record<ActionClass, string> = {
  read: 'Read',
  write: 'Create or change',
  send: 'Send',
  buy: 'Buy',
  delete: 'Delete',
  publish: 'Share or publish',
};

/** What a rule's target is, in words: a class of action, or a tool by its name. */
export function coverOf(target: string): string {
  const words = own(ACTION_WORDS as Record<string, string>, target);
  if (words) {
    return words;
  }
  const [server, name] = splitRef(target);
  return server ? `${name} (${server})` : name;
}
