/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An app's interface: the surface a user decides in, composed from the
 * approved catalog.
 *
 * The interface is an A2UI v0.9 component tree — the `updateComponents`
 * message, as the protocol writes it — over the components the app allows
 * from the basic catalog, bound to the data model the run page publishes
 * (the question, the alternatives with their findings, the ranking, the
 * choice) and dispatching the few actions the page handles (choose, ask,
 * save). An LLM composes the first one from the app's question, alternatives
 * and criteria; a developer adjusts it in the Studio; the page renders it.
 *
 * Bounded on purpose: a catalog the app names, paths the page publishes,
 * actions the page handles. That is what makes a generated interface
 * checkable — {@link interfaceProblems} is the generated-UI check an app's
 * validation runs — and what keeps a composed page from asking for
 * anything the app cannot answer.
 *
 * Pure: nothing here calls a model or renders. A component's properties are
 * checked by the validator its properties form uses (`@rjsf/validator-ajv8`).
 *
 * @module apps/composer/appInterface
 */

import { APP_KIND_PATHS, appKindPaths } from '../plugins/app-page/appPageModel';
import type { AppSpec, ComponentSpec } from '../../types/agentspecs';
import validator from '@rjsf/validator-ajv8';
import type { AppCriterionSpec } from '../../types/agentspecs';

/** What the page and its composer read of a decision's criterion. */
type AppCriterion = Pick<
  AppCriterionSpec,
  'name' | 'kind' | 'weight' | 'instructions'
>;

/** The protocol version the tree is written in. */
export const INTERFACE_PROTOCOL = 'a2ui/v0.9';

/** The id of the component a surface starts from. */
export const ROOT_ID = 'root';

/** One component of the tree, as A2UI's `updateComponents` carries it. */
export type InterfaceComponent = {
  id: string;
  component: string;
  [property: string]: unknown;
};

export type AppInterface = {
  protocol: typeof INTERFACE_PROTOCOL;
  components: InterfaceComponent[];
  /** Who composed it: a model's id, or `developer`, or `template`. */
  composedBy: string;
  composedAt: string;
};

/**
 * One thing an application publishes to its surface, or takes from it, by
 * path; a list is repeated over by a List, not shown by a block.
 */
export type InterfacePath = {
  path: string;
  /** What it is, for the composer. */
  meaning: string;
  /** What it is, for a person choosing it on the Canvas, when the meaning will not do. */
  words?: string;
  list?: boolean;
};

/**
 * The data model the run page publishes to the surface, by path. An
 * interface reads these and nothing else; inside the `/alternatives`
 * template, paths are relative to the alternative.
 */
export const INTERFACE_PATHS: InterfacePath[] = [
  { path: '/question', meaning: 'The question the app answers.' },
  { path: '/app', meaning: "The app's name." },
  {
    path: '/chosen',
    meaning: 'The alternative chosen so far, or an empty string.',
  },
  {
    path: '/first',
    meaning:
      'The alternative ranked first on what is known, or an empty string.',
  },
  {
    path: '/ranking',
    meaning:
      'The ranking as one line of text: names with their scores, best first.',
  },
  {
    path: '/coverage',
    meaning: 'How much of the evidence is in: "3 of 6 findings", as text.',
  },
  {
    path: '/criteria',
    meaning: 'The criteria as one line of text: names with their weights.',
  },
  {
    path: '/alternatives',
    meaning:
      'The list of alternatives, to render with a template (componentId + path).',
    list: true,
  },
  {
    path: 'name',
    meaning: 'In the alternatives template: the alternative’s name.',
    words: 'This alternative’s name.',
  },
  {
    path: 'summary',
    meaning:
      'In the alternatives template: its findings, one line per criterion.',
    words: 'This alternative’s findings, one line per criterion.',
  },
  {
    path: 'evidence',
    meaning: 'In the alternatives template: the evidence about it.',
    words: 'The evidence about this alternative.',
  },
  {
    path: 'score',
    meaning: 'In the alternatives template: its score as text ("72%"), or "—".',
    words: 'This alternative’s score ("72%"), or "—".',
  },
  {
    path: 'rank',
    meaning: 'In the alternatives template: its place ("1st"), or "—".',
    words: 'This alternative’s place ("1st"), or "—".',
  },
  {
    path: 'isChosen',
    meaning:
      'In the alternatives template: "chosen" when it is the choice, else "".',
    words: '“chosen” when this alternative is the choice, else nothing.',
  },
];

/**
 * An action a Button may dispatch: its name, what it does, and what its
 * context may carry — each key with what it is, in words — and the keys it
 * cannot do without.
 */
export type InterfaceAction = {
  name: string;
  /** What it does, for the composer. */
  meaning: string;
  /** What it does, for a person choosing it on the Canvas. */
  words: string;
  /** The keys its context may carry. */
  context: string[];
  asks: Record<string, string>;
  /** The keys its context must carry; none when not said. */
  needs?: string[];
};

/** The actions the run page handles when a Button dispatches them. */
export const INTERFACE_ACTIONS: InterfaceAction[] = [
  {
    name: 'choose',
    meaning: 'Choose an alternative; the context names it.',
    words: 'Choose an alternative',
    context: ['alternative'],
    asks: { alternative: 'The alternative it chooses' },
    needs: ['alternative'],
  },
  {
    name: 'ask',
    meaning:
      'Ask the decision model about every alternative that has evidence.',
    words: 'Ask the decision model about every alternative with evidence',
    context: [],
    asks: {},
  },
  {
    name: 'save',
    meaning: 'Save the decision as it stands.',
    words: 'Save the decision',
    context: [],
    asks: {},
  },
];

/**
 * What the run page takes from a decision's surface: a value a block writes
 * at a path (A2UI's two-way binding) that one of its actions then sends. The
 * page reads nothing else a block writes.
 */
export const INTERFACE_ACCEPTS: InterfacePath[] = [
  {
    path: '/chosen',
    meaning: 'The alternative to choose, which a Choose button then sends.',
  },
];

/** What one kind of application gives its surface and takes from it. */
export type KindInterface = {
  /** What a block may show. */
  publishes: InterfacePath[];
  /** Where what a block sends may go. */
  accepts: InterfacePath[];
  /** What a Button may do. */
  actions: InterfaceAction[];
};

/** Whose surface it is: its kind, and its settings, which a chat's or a widget's page also publishes and takes. */
export type InterfaceOwner = Pick<AppSpec, 'kind' | 'interface'>;

const DECISION: KindInterface = {
  publishes: INTERFACE_PATHS,
  accepts: INTERFACE_ACCEPTS,
  actions: INTERFACE_ACTIONS,
};

/**
 * What each kind of application gives its surface and takes from it: a
 * decision what its run page publishes, takes and handles; a chat, a widget
 * or a worker what the runtime's page of it publishes from its conversation
 * and answers through it (agent-runtimes' `APP_KIND_PATHS`).
 */
export const KIND_INTERFACES: Record<string, KindInterface> = {
  decision: DECISION,
  ...APP_KIND_PATHS,
};

/**
 * What an application gives its surface and takes from it: its kind's
 * lists, with each of its settings at `/inputs/<id>` for a kind that has
 * them (`appKindPaths`). A decision when not said.
 */
export const kindInterface = (app?: InterfaceOwner | null): KindInterface =>
  !app || app.kind === 'decision' ? DECISION : appKindPaths(app);

/** The standard components whose `value` a person changes: it is shown, and what they enter is written back. */
export const STANDARD_INPUTS = [
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'Slider',
  'DateTimeInput',
];

/**
 * The properties through which a component sends what a person does to the
 * application, and is not also shown through: a Table's `selected`, a File
 * upload's `files`. An input's `value` (shown and sent) is not one.
 */
export const sendOnlyProperties = (
  component: InterfaceComponent,
  spec?: ComponentSpec,
): string[] =>
  spec && !spec.standard && spec.bindings
    ? spec.bindings.sends.filter(name => !spec.bindings!.shows.includes(name))
    : [];

/** The components of the basic catalog a decision interface may use when the app names none. */
export const DEFAULT_ALLOWED_COMPONENTS = [
  'Card',
  'Column',
  'Row',
  'List',
  'Tabs',
  'Text',
  'Divider',
  'Button',
];

/**
 * The interface every app starts with: the question, the ranking, then
 * each alternative as a card — its place, its findings, its evidence, a
 * button to choose it — and the buttons to ask and to save. Composed by
 * hand once; what the LLM's composition is checked against.
 */
export function defaultInterface(): AppInterface {
  return {
    protocol: INTERFACE_PROTOCOL,
    composedBy: 'template',
    composedAt: '',
    components: [
      {
        id: ROOT_ID,
        component: 'Column',
        children: [
          'question',
          'ranking',
          'coverage',
          'alternatives',
          'actions',
        ],
      },
      {
        id: 'question',
        component: 'Text',
        text: { path: '/question' },
        variant: 'h2',
      },
      { id: 'ranking', component: 'Text', text: { path: '/ranking' } },
      {
        id: 'coverage',
        component: 'Text',
        text: { path: '/coverage' },
        variant: 'caption',
      },
      {
        id: 'alternatives',
        component: 'List',
        children: { componentId: 'alternative', path: '/alternatives' },
        direction: 'vertical',
      },
      { id: 'alternative', component: 'Card', child: 'alternative-body' },
      {
        id: 'alternative-body',
        component: 'Column',
        children: [
          'alternative-head',
          'alternative-summary',
          'alternative-evidence',
          'alternative-choose',
        ],
      },
      {
        id: 'alternative-head',
        component: 'Row',
        children: ['alternative-rank', 'alternative-name', 'alternative-score'],
      },
      {
        id: 'alternative-rank',
        component: 'Text',
        text: { path: 'rank' },
        variant: 'caption',
      },
      {
        id: 'alternative-name',
        component: 'Text',
        text: { path: 'name' },
        variant: 'h3',
      },
      { id: 'alternative-score', component: 'Text', text: { path: 'score' } },
      {
        id: 'alternative-summary',
        component: 'Text',
        text: { path: 'summary' },
      },
      {
        id: 'alternative-evidence',
        component: 'Text',
        text: { path: 'evidence' },
        variant: 'caption',
      },
      {
        id: 'alternative-choose',
        component: 'Button',
        child: 'alternative-choose-label',
        action: {
          event: { name: 'choose', context: { alternative: { path: 'name' } } },
        },
      },
      {
        id: 'alternative-choose-label',
        component: 'Text',
        text: 'Choose this one',
      },
      { id: 'actions', component: 'Row', children: ['ask', 'save'] },
      {
        id: 'ask',
        component: 'Button',
        child: 'ask-label',
        action: { event: { name: 'ask' } },
      },
      { id: 'ask-label', component: 'Text', text: 'Ask the decision model' },
      {
        id: 'save',
        component: 'Button',
        child: 'save-label',
        variant: 'primary',
        action: { event: { name: 'save' } },
      },
      { id: 'save-label', component: 'Text', text: 'Save the decision' },
    ],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * An interface from whatever was stored or answered: the object with its
 * components, or a bare array of components; `null` when it is neither.
 */
export function parseInterface(value: unknown): AppInterface | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    let body = value.trim();
    if (body.startsWith('```')) {
      body = body
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
    }
    try {
      parsed = JSON.parse(body);
    } catch {
      // The first object or array in the text, when a model talked around it.
      const start = Math.min(
        ...[body.indexOf('{'), body.indexOf('[')].filter(at => at >= 0),
      );
      const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
      if (!Number.isFinite(start) || end <= start) {
        return null;
      }
      try {
        parsed = JSON.parse(body.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  const components = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.components)
      ? parsed.components
      : isRecord(parsed) &&
          isRecord(parsed.updateComponents) &&
          Array.isArray(parsed.updateComponents.components)
        ? parsed.updateComponents.components
        : null;
  if (!components) {
    return null;
  }
  const kept = components.filter(
    (item): item is InterfaceComponent =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      item.id.trim() !== '' &&
      typeof item.component === 'string',
  );
  if (kept.length === 0) {
    return null;
  }
  const from = isRecord(parsed) ? parsed : {};
  return {
    protocol: INTERFACE_PROTOCOL,
    components: kept,
    composedBy: typeof from.composedBy === 'string' ? from.composedBy : '',
    composedAt: typeof from.composedAt === 'string' ? from.composedAt : '',
  };
}

/** The ids a component holds: its children, its child, its tabs, its trigger and content. */
export const childIds = (component: InterfaceComponent): string[] => {
  const ids: string[] = [];
  const children = component.children;
  if (Array.isArray(children)) {
    ids.push(...children.filter((id): id is string => typeof id === 'string'));
  } else if (isRecord(children) && typeof children.componentId === 'string') {
    ids.push(children.componentId);
  }
  if (typeof component.child === 'string') {
    ids.push(component.child);
  }
  if (Array.isArray(component.tabs)) {
    for (const tab of component.tabs) {
      if (isRecord(tab) && typeof tab.child === 'string') {
        ids.push(tab.child);
      }
    }
  }
  if (typeof component.trigger === 'string') {
    ids.push(component.trigger);
  }
  if (typeof component.content === 'string') {
    ids.push(component.content);
  }
  return ids;
};

const pathsOf = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach(item => pathsOf(item, found));
  } else if (isRecord(value)) {
    if (typeof value.path === 'string' && Object.keys(value).length <= 2) {
      found.push(value.path);
    }
    Object.values(value).forEach(item => pathsOf(item, found));
  }
  return found;
};

const actionsOf = (component: InterfaceComponent): string[] => {
  const action = component.action;
  if (
    isRecord(action) &&
    isRecord(action.event) &&
    typeof action.event.name === 'string'
  ) {
    return [action.event.name];
  }
  return [];
};

/** What a check found, and the component it is about (`null`: the whole surface). */
export type InterfaceFinding = { id: string | null; problem: string };

/** What the surface is checked for, beyond its components. */
export type InterfaceCheckOptions = {
  /**
   * The application: a decision reads what its run page publishes and lets
   * the user choose; another kind reads what its page publishes from its
   * conversation, its settings among it ({@link kindInterface}). A decision
   * when not said.
   */
  app?: InterfaceOwner | null;
  /** The catalog's component by its id, to check what its schema requires. */
  componentSpec?: (id: string) => ComponentSpec | undefined;
};

const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** A value bound to what the application publishes: `{"path": …}`, checked as a path, not by its schema. */
const isBound = (value: unknown): boolean =>
  isRecord(value) && typeof value.path === 'string';

/** What a type is called, in the words a builder reads. */
const TYPE_WORDS: Record<string, string> = {
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'yes or no',
  array: 'a list',
  object: 'a group of values',
};

/** What the schema refuses of a value, in plain words: what it must be. */
function mustBe(error: {
  name?: string;
  message?: string;
  params?: Record<string, unknown>;
}): string {
  const params = error.params ?? {};
  switch (error.name) {
    case 'maximum':
      return `must be at most ${String(params.limit)}`;
    case 'minimum':
      return `must be at least ${String(params.limit)}`;
    case 'exclusiveMaximum':
      return `must be under ${String(params.limit)}`;
    case 'exclusiveMinimum':
      return `must be over ${String(params.limit)}`;
    case 'type':
      return `must be ${TYPE_WORDS[String(params.type)] ?? String(params.type)}`;
    case 'enum':
      return `must be one of ${((params.allowedValues as unknown[]) ?? []).map(String).join(', ')}`;
    case 'minItems':
      return `needs at least ${String(params.limit)}`;
    case 'maxItems':
      return `takes at most ${String(params.limit)}`;
    case 'minLength':
      return `must be at least ${String(params.limit)} characters`;
    case 'maxLength':
      return `must be at most ${String(params.limit)} characters`;
    default:
      return error.message ?? 'is refused by its schema';
  }
}

/**
 * What a component's JSON Schema in the catalog refuses of its properties
 * (a standard one's too), as its properties form refuses it — the
 * same validator —
 * each said with the property's title. What is bound is a path, checked as
 * one; what is required and empty is said by its own check.
 */
export function propertyProblems(
  spec: ComponentSpec,
  node: InterfaceComponent,
): string[] {
  const schema = spec.properties as Record<string, unknown>;
  const fields = (schema.properties ?? {}) as Record<
    string,
    { title?: string }
  >;
  const values = Object.fromEntries(
    Object.keys(fields)
      .filter(name => !isEmptyValue(node[name]) && !isBound(node[name]))
      .map(name => [name, node[name]]),
  );
  const { errors } = validator.validateFormData(values, schema as never);
  return errors
    .filter(error => error.name !== 'required')
    .map(error => {
      const name = (error.property ?? '').replace(/^\./, '').split('.')[0];
      const title = (fields[name]?.title ?? name).toLowerCase();
      return `${node.id}'s ${title} ${mustBe(error as never)}.`;
    })
    .filter((problem, index, all) => all.indexOf(problem) === index);
}

/**
 * What is wrong with an interface, component by component: each
 * finding names the component it is about, so that an editor can say it on
 * the block, where it is. The generated-UI check: the tree is whole, it uses
 * only the components the app allows, each has what its schema requires and
 * nothing its schema refuses ({@link propertyProblems}), it
 * reads only what the app publishes, it dispatches only what the page
 * handles, and a decision lets the user choose.
 */
export function interfaceFindings(
  spec: AppInterface | null,
  allowed: readonly string[],
  catalog: readonly string[],
  options: InterfaceCheckOptions = {},
): InterfaceFinding[] {
  if (!spec || spec.components.length === 0) {
    return [{ id: null, problem: 'The interface has no components.' }];
  }
  const decision = !options.app || options.app.kind === 'decision';
  const gives = kindInterface(options.app);
  const findings: InterfaceFinding[] = [];
  const say = (id: string | null, problem: string) =>
    findings.push({ id, problem });
  const ids = new Map<string, InterfaceComponent>();
  for (const component of spec.components) {
    if (ids.has(component.id)) {
      say(component.id, `Two components are named ${component.id}.`);
    }
    ids.set(component.id, component);
  }
  if (!ids.has(ROOT_ID)) {
    say(
      null,
      `No component is named ${ROOT_ID}: the surface has nowhere to start.`,
    );
  }
  const permitted = new Set(allowed.length > 0 ? allowed : catalog);
  const known = new Set(catalog);
  const knownPaths = new Set(
    [...gives.publishes, ...gives.accepts].map(entry => entry.path),
  );
  // What a block sends goes where the app takes it.
  const taken = new Set(gives.accepts.map(entry => entry.path));
  const handled = new Map(gives.actions.map(action => [action.name, action]));
  let chooses = 0;
  for (const component of spec.components) {
    const { id } = component;
    if (!known.has(component.component)) {
      say(
        id,
        `${id} is a ${component.component}, which the catalog does not have.`,
      );
    } else if (!permitted.has(component.component)) {
      say(
        id,
        `${id} is a ${component.component}, which this app does not allow.`,
      );
    }
    const own = options.componentSpec?.(component.component);
    if (own && !own.standard && own.properties) {
      const fields = (own.properties.properties ?? {}) as Record<
        string,
        { title?: string }
      >;
      for (const name of (own.properties.required ?? []) as string[]) {
        if (isEmptyValue(component[name])) {
          say(
            id,
            `${id} is a ${own.name} without its ${(fields[name]?.title ?? name).toLowerCase()}.`,
          );
        }
      }
    }
    // Every component's properties against the catalog's schema, a standard
    // one's too: what its form would refuse, written in the text.
    if (own) {
      for (const problem of propertyProblems(own, component)) {
        say(id, problem);
      }
    }
    for (const child of childIds(component)) {
      if (!ids.has(child)) {
        say(id, `${id} refers to ${child}, which is not in the interface.`);
      }
    }
    const sends = sendOnlyProperties(component, own);
    const shown = Object.fromEntries(
      Object.entries(component).filter(([key]) => !sends.includes(key)),
    );
    for (const path of pathsOf(shown)) {
      if (!knownPaths.has(path)) {
        say(id, `${id} reads ${path}, which the app does not publish.`);
      }
    }
    for (const path of sends.flatMap(property =>
      pathsOf(component[property]),
    )) {
      if (!taken.has(path)) {
        say(id, `${id} sends to ${path}, which the app does not take.`);
      }
    }
    for (const action of actionsOf(component)) {
      const known = handled.get(action);
      if (!known) {
        say(id, `${id} dispatches ${action}, which the app does not handle.`);
        continue;
      }
      if (action === 'choose') {
        chooses += 1;
      }
      const context =
        isRecord(component.action) && isRecord(component.action.event)
          ? component.action.event.context
          : undefined;
      for (const key of known.needs ?? []) {
        if (!isRecord(context) || isEmptyValue(context[key])) {
          say(
            id,
            `${id} dispatches ${action} without ${(known.asks[key] ?? key).replace(/^The /, 'the ')}.`,
          );
        }
      }
    }
  }
  if (decision && chooses === 0) {
    say(null, 'Nothing in the interface lets the user choose an alternative.');
  }
  return findings;
}

/**
 * What is wrong with an interface, as sentences; none when it can render
 * and be used ({@link interfaceFindings}, without saying where).
 */
export function interfaceProblems(
  spec: AppInterface | null,
  allowed: readonly string[],
  catalog: readonly string[],
  options: InterfaceCheckOptions = {},
): string[] {
  return interfaceFindings(spec, allowed, catalog, options).map(
    finding => finding.problem,
  );
}

/** What the composer is asked with: the rules, the catalog, the app. */
export function composePrompt(
  app: {
    question: string;
    alternatives: string[];
    criteria: AppCriterion[];
    components: string[];
  },
  catalog: readonly string[],
): { role: 'system' | 'user'; content: string }[] {
  const allowed =
    app.components.length > 0
      ? app.components
      : DEFAULT_ALLOWED_COMPONENTS.filter(name => catalog.includes(name));
  const system = [
    'You compose the interface of a decision app as an A2UI v0.9 component tree. Answer with one JSON object and nothing else — no prose, no code fence:',
    '{"components": [ {"id": "root", "component": "Column", "children": ["..."]}, ... ]}',
    '',
    'Rules:',
    `- Use only these components: ${allowed.join(', ')}. The tree starts at the component whose id is "root".`,
    '- Column, Row and List take "children": a list of component ids, or a template {"componentId": "<id>", "path": "/alternatives"} that repeats one component per alternative.',
    '- Card takes "child": one component id. Button takes "child" (a Text) and "action": {"event": {"name": "<action>", "context": {...}}}.',
    '- Text takes "text": a literal string or {"path": "<path>"}; "variant" may be "h1", "h2", "h3", "body" or "caption".',
    '- Any component but the root may take "visible_when": {"path": "<path>"}: it is shown only while that value is true or not empty.',
    '- Every component id must be unique; every id referred to must exist.',
    '',
    'The data the page publishes — read these paths and no other:',
    ...INTERFACE_PATHS.map(entry => `- ${entry.path}: ${entry.meaning}`),
    '',
    'The actions the page handles — dispatch these and no other:',
    ...INTERFACE_ACTIONS.map(
      action =>
        `- ${action.name}: ${action.meaning}${action.context.length ? ` Context keys: ${action.context.join(', ')} — in the alternatives template, {"alternative": {"path": "name"}}.` : ''}`,
    ),
    '',
    'The interface must show the question, the ranking, and every alternative with its findings and its evidence, and it must let the user choose an alternative, ask the decision model, and save. Write short, plain labels.',
  ].join('\n');
  const user = [
    `Question: ${app.question.trim() || '(not written yet)'}`,
    `Alternatives: ${app.alternatives.filter(name => name.trim()).join(', ') || '(filled from the evidence at run time)'}`,
    'Criteria:',
    ...app.criteria.map(
      criterion =>
        `- ${criterion.name} (${criterion.kind}, weight ${criterion.weight}): ${criterion.instructions.trim()}`,
    ),
    '',
    'Compose the interface.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** What one alternative reads as on the surface. */
export type SurfaceAlternative = {
  name: string;
  summary: string;
  evidence: string;
  score: string;
  rank: string;
  isChosen: string;
};

/** The data model of a surface: what the page publishes at the known paths. */
export type SurfaceData = {
  question: string;
  app: string;
  chosen: string;
  first: string;
  ranking: string;
  coverage: string;
  criteria: string;
  alternatives: SurfaceAlternative[];
};

const ordinal = (place: number): string => {
  const suffix =
    place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');
  return `${place}${suffix}`;
};

/**
 * The data model from what the page knows: the question, the criteria,
 * each alternative with its findings said in words, and the ranking.
 */
export function surfaceData(state: {
  question: string;
  app: string;
  chosen: string;
  criteria: AppCriterion[];
  alternatives: { name: string; evidence: string; findings: string[] }[];
  ranking: { name: string; score: number | null; coverage: number }[];
  known: number;
  total: number;
}): SurfaceData {
  const place = new Map(
    state.ranking.map((item, index) => [item.name, index + 1]),
  );
  const scores = new Map(state.ranking.map(item => [item.name, item.score]));
  return {
    question: state.question,
    app: state.app,
    chosen: state.chosen,
    first: state.ranking[0]?.name ?? '',
    ranking:
      state.ranking.length === 0
        ? 'Nothing is ranked yet.'
        : state.ranking
            .map(
              item =>
                `${item.name} ${item.score === null ? '—' : `${Math.round(item.score * 100)}%`}`,
            )
            .join(' · '),
    coverage: `${state.known} of ${state.total} findings in.`,
    criteria: state.criteria
      .map(criterion => `${criterion.name} ×${criterion.weight}`)
      .join(' · '),
    alternatives: state.alternatives.map(alternative => {
      const score = scores.get(alternative.name);
      const at = place.get(alternative.name);
      return {
        name: alternative.name,
        summary: alternative.findings.join('\n') || 'Nothing found yet.',
        evidence: alternative.evidence.trim() || 'No evidence.',
        score:
          score === null || score === undefined
            ? '—'
            : `${Math.round(score * 100)}%`,
        rank: at ? ordinal(at) : '—',
        isChosen: alternative.name === state.chosen ? 'chosen' : '',
      };
    }),
  };
}

/** The A2UI messages that put an interface on a surface with its data. */
export function surfaceMessages(
  spec: AppInterface,
  surfaceId: string,
  catalogId: string,
  data: Record<string, unknown>,
) {
  return [
    { version: 'v0.9' as const, createSurface: { surfaceId, catalogId } },
    {
      version: 'v0.9' as const,
      updateComponents: { surfaceId, components: spec.components },
    },
    {
      version: 'v0.9' as const,
      updateDataModel: { surfaceId, path: '/', value: data },
    },
  ];
}
