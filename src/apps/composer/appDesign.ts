/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application, as the designer authors it: its
 * parts on the surface, the toolbox of parts to place on it — what
 * the plugins contribute to `agent.canvas.part`, each arriving with its
 * example filled in — and its events, chosen among the ones
 * contributed: what happens when, and what it does.
 *
 * Everything here reads and writes the application's data in its schema's
 * spelling (`dumpAppspec`), so that a part is drawn by its schema and the
 * spec read back (`parseAppspec`) is the one the other editors share.
 *
 * Pure: no React, no network.
 *
 * @module apps/composer/appDesign
 */

import type {
  CanvasPartContribution,
  CanvasPartKind,
} from '../core/canvasParts';
import { protocolsProblems, uiProblems } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';
import { getProtocol } from '../../specs/protocols';
import { getUI, listUI } from '../../specs/ui';
import { getGate } from '../../specs/gates';
import { getUiRenderer } from '../../specs/uiRenderers';
import type { JsonSchema } from '../../specs/appspecSchema';
import { whenOf } from './appEvents';
import { valueAt, withValueAt, type PartAt, type SpecPath } from './schemaAt';

/** What a part of an application is. */
export type AppPartKind =
  | 'agent'
  | 'model'
  | 'connection'
  | 'rule'
  | 'skill'
  | 'test'
  | 'event'
  | 'protocol'
  | 'ui'
  | 'guard'
  | 'gate'
  | 'track';

/** A part on the surface: what it is, what it is called there, and where it is in the spec. */
export type AppPart = {
  id: string;
  kind: AppPartKind;
  label: string;
  detail: string;
  at: PartAt;
};

/** The agent's own keys: what it is, what it is told, what it is for and what it remembers. */
export const AGENT_KEYS = ['agent', 'instructions', 'goal', 'memory'] as const;

const listAt = (data: unknown, path: SpecPath): unknown[] => {
  const value = valueAt(data, path);
  return Array.isArray(value) ? value : [];
};
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const firstLine = (value: unknown, words = 8): string => {
  const said = text(value).split('\n')[0].trim();
  const cut = said.split(/\s+/).slice(0, words).join(' ');
  return cut.length < said.length ? `${cut}…` : cut;
};

/** The parts of an application, in the order the surface shows them. */
export function appParts(data: unknown): AppPart[] {
  const parts: AppPart[] = [
    {
      id: 'agent',
      kind: 'agent',
      label: text(valueAt(data, ['agent'])) || 'The agent',
      detail:
        firstLine(valueAt(data, ['instructions'])) || 'No instructions yet',
      at: { path: [], keys: AGENT_KEYS },
    },
    {
      id: 'model',
      kind: 'model',
      label: text(valueAt(data, ['model'])) || 'The default model',
      detail: 'Model',
      at: { path: [], keys: ['model'] },
    },
  ];
  listAt(data, ['connections']).forEach((connection, index) => {
    const c = (connection ?? {}) as Record<string, unknown>;
    parts.push({
      id: `connection-${index}`,
      kind: 'connection',
      label: text(c.server) || 'A connection',
      // Its access, `read` where the Appspec leaves it unsaid (the default, which `dumpAppspec` omits).
      detail: [
        text(c.access) || 'read',
        Array.isArray(c.only) && c.only.length
          ? `only ${(c.only as string[]).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      at: { path: ['connections', index] },
    });
  });
  listAt(data, ['rules']).forEach((rule, index) => {
    const r = (rule ?? {}) as Record<string, unknown>;
    parts.push({
      id: `rule-${index}`,
      kind: 'rule',
      label: text(r.action) || 'A rule',
      detail: text(r.behaviour).replace(/_/g, ' '),
      at: { path: ['rules', index] },
    });
  });
  listAt(data, ['skills']).forEach((skill, index) => {
    parts.push({
      id: `skill-${index}`,
      kind: 'skill',
      label: text(skill) || 'A skill',
      detail: 'Skill',
      at: { path: ['skills', index] },
    });
  });
  // What it speaks and where its answers render: by the catalogue's names.
  listAt(data, ['protocols']).forEach((protocol, index) => {
    const spec = getProtocol(text(protocol));
    parts.push({
      id: `protocol-${index}`,
      kind: 'protocol',
      label: spec?.name ?? (text(protocol) || 'A protocol'),
      detail: spec
        ? spec.status === 'planned'
          ? 'Planned'
          : spec.connects
        : 'Not in the catalogue',
      at: { path: ['protocols', index] },
    });
  });
  // Its UI plugins: each by its name, with the renderer it is shown through elsewhere.
  listAt(data, ['ui']).forEach((choice, index) => {
    const c = (choice ?? {}) as Record<string, unknown>;
    const spec = getUI(text(c.plugin));
    const renderer = getUiRenderer(text(c.renderer));
    parts.push({
      id: `ui-${index}`,
      kind: 'ui',
      label: spec?.name ?? (text(c.plugin) || 'A part of its interface'),
      detail: !spec
        ? 'Not in the catalogue'
        : renderer
          ? `Through ${renderer.name}`
          : 'In its own page',
      at: { path: ['ui', index] },
    });
  });
  listAt(data, ['tests', 'cases']).forEach((test, index) => {
    const t = (test ?? {}) as Record<string, unknown>;
    parts.push({
      id: `test-${index}`,
      kind: 'test',
      label: firstLine(t.ask, 6) || 'A test',
      detail: firstLine(t.expect, 8),
      at: { path: ['tests', 'cases', index] },
    });
  });
  listAt(data, ['triggers']).forEach((trigger, index) => {
    const t = (trigger ?? {}) as Record<string, unknown>;
    parts.push({
      id: `event-${index}`,
      kind: 'event',
      label: whenOf(t),
      detail: firstLine(t.prompt),
      at: { path: ['triggers', index] },
    });
  });
  // Its checks (the user, 6 November 2026): the Guards it names, the Gates, and the Track its record is kept under.
  listAt(data, ['checks', 'guards']).forEach((guard, index) => {
    parts.push({
      id: `guard-${index}`,
      kind: 'guard',
      label: text(guard) || 'A guard',
      detail: 'Guard',
      at: { path: ['checks', 'guards', index] },
    });
  });
  listAt(data, ['checks', 'gates']).forEach((gate, index) => {
    parts.push({
      id: `gate-${index}`,
      kind: 'gate',
      label: text(gate) || 'A gate',
      detail: 'Gate',
      at: { path: ['checks', 'gates', index] },
    });
  });
  const track = text(valueAt(data, ['checks', 'track']));
  if (track) {
    parts.push({
      id: 'track',
      kind: 'track',
      label: track,
      detail: 'Track',
      at: { path: ['checks'], keys: ['track'] },
    });
  }
  return parts;
}

/**
 * What is wrong with what an application says it speaks and renders in, by
 * the kind of part it is about: the Appspec's own
 * sentences, so the canvas's Protocols and UI nodes say what its checks say.
 * An application stored before `protocols` existed keeps its `pap`, `pact`
 * or `a2a` block with nothing listed: its node says so instead of *none yet*,
 * and nothing is listed for it — the Maker adds the protocol.
 */
export const kindProblemsOf = (
  spec: AppSpec,
): Partial<Record<AppPartKind, string[]>> => {
  const said: Partial<Record<AppPartKind, string[]>> = {};
  const protocol = protocolsProblems(spec);
  const ui = uiProblems(spec);
  if (protocol.length) {
    said.protocol = protocol;
  }
  if (ui.length) {
    said.ui = ui;
  }
  return said;
};

/** Where each kind of part is kept in the Appspec: the list it is added to, or, for a model, the one key it sets. */
export const PART_PLACES: Readonly<Record<CanvasPartKind, SpecPath>> = {
  // A harness of the toolbox's Agents is the application's agent: its id is set, as a model's is.
  agent: ['agent'],
  connection: ['connections'],
  rule: ['rules'],
  skill: ['skills'],
  test: ['tests', 'cases'],
  event: ['triggers'],
  model: ['model'],
  protocol: ['protocols'],
  ui: ['ui'],
  // The avatar its floating assistant shows: set, as a model is, on the agent.
  avatar: ['interface', 'avatar'],
  // Its checks: Guards and Gates listed by reference, the Track set (6 November 2026).
  guard: ['checks', 'guards'],
  gate: ['checks', 'gates'],
  track: ['checks', 'track'],
};

/**
 * The avatar an application's assistant shows, as the Canvas names it: its
 * id, `model3d` for a 3D model, empty when unsaid (the paper clip).
 */
export const avatarOf = (data: unknown): string => {
  const avatar = valueAt(data, ['interface', 'avatar']);
  if (
    avatar &&
    typeof avatar === 'object' &&
    (avatar as Record<string, unknown>).kind === 'model3d'
  ) {
    return 'model3d';
  }
  return text(avatar);
};

/** The address of the 3D model an application's avatar names, when it is one that names one. */
export const avatarModelUrlOf = (data: unknown): string | undefined => {
  const avatar = valueAt(data, ['interface', 'avatar']);
  return avatar && typeof avatar === 'object'
    ? text((avatar as Record<string, unknown>).url) || undefined
    : undefined;
};

/** The toolbox's groups, in a form designer's order, and what each is called: a connection's group is *MCP*, as its node on the surface. */
export const TOOLBOX_GROUPS: readonly {
  kind: CanvasPartKind;
  label: string;
}[] = [
  // The agents first: a coding agent over ACP behind the Shield is the agent itself.
  { kind: 'agent', label: 'Agents' },
  // The model next (asked 14 October 2026): what thinks, then what it reaches.
  { kind: 'model', label: 'Models' },
  { kind: 'connection', label: 'MCP' },
  { kind: 'skill', label: 'Skills' },
  { kind: 'rule', label: 'Rules' },
  { kind: 'test', label: 'Tests' },
  // Triggers, not Events (14 October 2026): the Controls dock has an Events panel, the page's own.
  { kind: 'event', label: 'Triggers' },
  { kind: 'protocol', label: 'Protocols' },
  { kind: 'ui', label: 'UI' },
  { kind: 'avatar', label: 'Avatars' },
  // The accountability plane (6 November 2026): Guards check, Gates decide, the Track records.
  { kind: 'guard', label: 'Guards' },
  { kind: 'gate', label: 'Gates' },
  { kind: 'track', label: 'Track' },
];

/** The parts the plugins contribute, grouped as the toolbox shows them; a group nothing contributes to is left out. */
export const toolboxGroupsOf = (
  parts: readonly CanvasPartContribution[],
): { kind: CanvasPartKind; label: string; parts: CanvasPartContribution[] }[] =>
  TOOLBOX_GROUPS.map(group => ({
    ...group,
    parts: parts.filter(part => part.kind === group.kind),
  })).filter(group => group.parts.length > 0);

/** The heading of the UI parts that are the application's agent's own. */
export const AGENTS_OWN_UI = {
  label: 'Its agent’s',
  note: 'What its agent brings to its own chat: its title bar, the deck or the sheet it builds. Nothing is added until you drop it.',
} as const;

/**
 * The UI parts with the application's agent's own first (the user, 18
 * November 2026: a Studio application does not inherit its agent's header;
 * the Maker is offered it): those its agent's spec and components name
 * (`agentUiIdsOf`), as one family at the top of the UI group, each said to be
 * its agent's. Nothing is added: the Maker drops what they want. Without an
 * agent, or one that names no UI, the parts as they were.
 */
export function withAgentsOwnUiFirst(
  parts: readonly CanvasPartContribution[],
  agentUi: readonly string[],
): CanvasPartContribution[] {
  const own = new Set(agentUi);
  const plugin = (part: CanvasPartContribution): string =>
    text((part.example as Record<string, unknown> | null)?.plugin);
  const first = parts.filter(
    part => part.kind === 'ui' && own.has(plugin(part)),
  );
  if (first.length === 0) {
    return [...parts];
  }
  return [
    ...first.map(part => ({
      ...part,
      group: AGENTS_OWN_UI.label,
      groupNote: AGENTS_OWN_UI.note,
    })),
    ...parts.filter(part => !first.includes(part)),
  ];
}

/** How each placement of a UI part reads in its properties. */
export const PLACEMENT_WORDS: Readonly<Record<string, string>> = {
  header: 'In the chat’s title bar',
  toolbar: 'In the composer’s toolbar',
  footer: 'Under the composer',
  banner: 'Above the conversation',
  left: 'In the left panel',
  right: 'In the right panel',
  message: 'In the conversation',
};

/**
 * The parts of one kind by the family each says it is of (`group`), in the
 * order they are first contributed: the avatars as Datalayer's orb, the
 * clippy.js characters (with the note that they are Microsoft's, fetched),
 * the drawings and the 3D models. Parts that say no family are one family
 * with no heading.
 */
export function partFamilies(
  parts: readonly CanvasPartContribution[],
): { label: string; note?: string; parts: CanvasPartContribution[] }[] {
  const families: {
    label: string;
    note?: string;
    parts: CanvasPartContribution[];
  }[] = [];
  for (const part of parts) {
    const label = part.group ?? '';
    let family = families.find(each => each.label === label);
    if (!family) {
      family = {
        label,
        ...(part.groupNote ? { note: part.groupNote } : {}),
        parts: [],
      };
      families.push(family);
    }
    family.parts.push(part);
  }
  return families;
}

/**
 * The application's data with a contributed part placed: appended to
 * its list with its example filled in, or — a model — set; and the id of the
 * part on the surface, so its properties open.
 */
export function withPartAdded(
  data: unknown,
  part: CanvasPartContribution,
): { data: unknown; at: PartAt; id: string } {
  const place = PART_PLACES[part.kind];
  if (part.kind === 'model') {
    return {
      data: withValueAt(data, place, part.example),
      at: { path: [], keys: ['model'] },
      id: 'model',
    };
  }
  if (part.kind === 'track') {
    // One Track per application: set, as a model is.
    return {
      data: withValueAt(data, place, part.example),
      at: { path: ['checks'], keys: ['track'] },
      id: 'track',
    };
  }
  if (part.kind === 'gate') {
    // A Gate reads its Guards, which the application must run (the Appspec's
    // check says so): dropped, it brings the ones not listed yet.
    const guards = listAt(data, PART_PLACES.guard).map(text);
    const missing = (getGate(text(part.example))?.guards ?? []).filter(
      guard => !guards.includes(guard),
    );
    if (missing.length) {
      data = withValueAt(data, PART_PLACES.guard, [...guards, ...missing]);
    }
  }
  if (part.kind === 'agent') {
    // A harness dropped on the agent: the catalogue agent that runs on it is the application's agent.
    return {
      data: withValueAt(data, place, part.example),
      at: { path: [], keys: AGENT_KEYS },
      id: 'agent',
    };
  }
  if (part.kind === 'avatar') {
    // Dropped on the agent: it is the agent's face, not a part beside it. A 3D
    // model dropped on one already keeps the address of its model.
    const example =
      avatarOf(data) === 'model3d' &&
      avatarOf({ interface: { avatar: part.example } }) === 'model3d'
        ? valueAt(data, place)
        : part.example;
    return {
      data: withValueAt(data, place, structuredClone(example)),
      at: { path: [], keys: AGENT_KEYS },
      id: 'agent',
    };
  }
  const list = listAt(data, place);
  // Listed once: the one already there is the one selected — a protocol by its id, a UI plugin by its plugin.
  const index =
    part.kind === 'protocol' || part.kind === 'guard' || part.kind === 'gate'
      ? list.indexOf(part.example)
      : part.kind === 'ui'
        ? list.findIndex(
            each =>
              text((each as Record<string, unknown> | null)?.plugin) ===
              text((part.example as Record<string, unknown>).plugin),
          )
        : -1;
  if (index >= 0) {
    return {
      data,
      at: { path: [...place, index] },
      id: `${part.kind}-${index}`,
    };
  }
  const end = list.length;
  return {
    data: withValueAt(data, place, [...list, structuredClone(part.example)]),
    at: { path: [...place, end] },
    id: `${part.kind}-${end}`,
  };
}

/** The application's data with a part of a list taken off. Agent and model are not in a list, and stay. */
export function withPartRemoved(data: unknown, part: AppPart): unknown {
  if (part.at.keys || !part.at.path.length) {
    return data;
  }
  const index = part.at.path[part.at.path.length - 1];
  const list = part.at.path.slice(0, -1);
  if (typeof index !== 'number') {
    return data;
  }
  return withValueAt(
    data,
    list,
    listAt(data, list).filter((_, at) => at !== index),
  );
}

/** The kind of a part on the surface, read from its id (`agent`, `model`, `track`, or `<kind>-<index>`). */
export const kindOfPartId = (id: string): AppPartKind =>
  id.replace(/-\d+$/, '') as AppPartKind;

/** What a part on the surface holds in the spec: its list entry, or the one key it sets (the agent's id, the model, the Track). */
const valueOfPart = (data: unknown, part: AppPart): unknown =>
  part.at.keys
    ? valueAt(data, [...part.at.path, part.at.keys[0]])
    : valueAt(data, part.at.path);

/** One field of an object entry, as text. */
const fieldOf = (value: unknown, key: string): string =>
  text((value as Record<string, unknown> | null)?.[key]);

/** Two references the same, a version (`id:version`) or not. */
const sameRef = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a !== '' &&
  (a === b || a.split(':')[0] === b.split(':')[0]);

/**
 * The toolbox entry a part on the surface was placed from, among the
 * entries of its kind: a skill, a model, a protocol, a Guard, a Gate, the
 * Track or the agent by its id; a connection by its server; a UI part by its
 * plugin; a rule by its action, else by its behaviour (one entry each); a test by its
 * question; a trigger by its type (an event's by its event). None when the
 * part was written by hand and the toolbox offers nothing like it.
 */
export function toolOfPart(
  data: unknown,
  part: AppPart,
  tools: readonly CanvasPartContribution[],
): CanvasPartContribution | undefined {
  const value = valueOfPart(data, part);
  const own = tools.filter(tool => tool.kind === part.kind);
  switch (part.kind) {
    case 'connection':
      return own.find(
        tool =>
          fieldOf(value, 'server') !== '' &&
          fieldOf(tool.example, 'server') === fieldOf(value, 'server'),
      );
    case 'ui':
      return own.find(
        tool =>
          fieldOf(value, 'plugin') !== '' &&
          fieldOf(tool.example, 'plugin') === fieldOf(value, 'plugin'),
      );
    case 'rule':
      return (
        own.find(
          tool =>
            fieldOf(value, 'action') !== '' &&
            fieldOf(tool.example, 'action') === fieldOf(value, 'action'),
        ) ??
        own.find(
          tool =>
            fieldOf(value, 'behaviour') !== '' &&
            fieldOf(tool.example, 'behaviour') === fieldOf(value, 'behaviour'),
        )
      );
    case 'test':
      return own.find(
        tool =>
          fieldOf(value, 'ask') !== '' &&
          fieldOf(tool.example, 'ask') === fieldOf(value, 'ask'),
      );
    case 'event':
      return own.find(
        tool =>
          fieldOf(value, 'type') !== '' &&
          fieldOf(tool.example, 'type') === fieldOf(value, 'type') &&
          (fieldOf(value, 'type') !== 'event' ||
            fieldOf(tool.example, 'event') === fieldOf(value, 'event')),
      );
    default:
      // The agent, the model, a skill, a protocol, a Guard, a Gate, the Track: by reference.
      return (
        own.find(tool => tool.example === value) ??
        own.find(tool => sameRef(tool.example, value))
      );
  }
}

/**
 * The Appspec's schema as the Properties of a UI part draw it: its plugin one of the catalogue's UI plugins, by name; its
 * renderer one of those this plugin may be exposed through, or none — drawn
 * in its own page. The rest of the schema is the Appspec's own.
 */
export function uiChoiceRoot(
  root: JsonSchema,
  data: unknown,
  at: PartAt,
): JsonSchema {
  const chosen = getUI(
    text(
      (valueAt(data, at.path) as Record<string, unknown> | undefined)?.plugin,
    ),
  );
  const renderers = chosen?.renderers ?? [];
  const properties: Record<string, JsonSchema> = {
    plugin: {
      type: 'string',
      title: 'Part of its interface',
      description:
        'What it shows: the conversation, a notebook, its page, its rules…',
      oneOf: listUI().map(spec => ({
        const: spec.id,
        title: `${spec.emoji} ${spec.name}`,
      })),
    },
  };
  // Where in the chat it goes, when it may go in more than one place (the side panels, 18 November 2026).
  const placements = chosen?.placements ?? [];
  if (placements.length > 1) {
    properties.placement = {
      type: 'string',
      title: 'Where in the chat',
      description:
        'Where it is drawn: its first place unless you choose another.',
      oneOf: placements.map((placement, index) => ({
        const: placement,
        title: `${PLACEMENT_WORDS[placement] ?? placement}${index === 0 ? ' (its default)' : ''}`,
      })),
    };
  }
  if (renderers.length) {
    properties.renderer = {
      type: 'string',
      title: 'Shown elsewhere through',
      description:
        'How this part reaches a page that is not Datalayer’s own; none, and it is drawn in its own page only.',
      oneOf: [
        // None: drawn in its own page only — chosen before another part, which a renderer may not carry.
        { const: '', title: 'None: its own page only' },
        ...renderers.map(id => {
          const renderer = getUiRenderer(id);
          return {
            const: id,
            title: renderer
              ? `${renderer.name}${renderer.enabled ? '' : ' (not yet)'}`
              : id,
          };
        }),
      ],
    };
  }
  const defs = (root.$defs ?? {}) as Record<string, JsonSchema>;
  return {
    ...root,
    $defs: {
      ...defs,
      UiChoice: { ...defs.UiChoice, properties, required: ['plugin'] },
    },
  };
}

/**
 * What the agent's node says while a part it takes is dragged: an Agents part
 * has no box of its own, so the node says it is where the part goes.
 */
export const AGENT_DROP_WORDS = {
  agent: 'Drop here: it becomes the agent',
  avatar: 'Drop here: the agent wears it',
  over: 'Let go',
} as const;
