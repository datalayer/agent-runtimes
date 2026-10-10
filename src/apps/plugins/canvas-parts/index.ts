/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's toolbox, contributed (LOOP C-20): one plugin per source of
 * parts — the servers of the catalogue a connection reaches, its skills, its
 * models, and the rules, tests and events an agent answers to — each
 * contributing to `loop.canvas.part`. The toolbox is what the enabled
 * plugins contribute, as the palette is (`canvas-blocks`, C-12).
 *
 * @module apps/plugins/canvas-parts
 */

import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  type ReactorPlatform,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { MCP_SERVER_LIBRARY } from '../../../specs/mcpServers';
import { listChatModels } from '../../../specs/models';
import { getSkillSpecs } from '../../../specs/skills';
import {
  LoopCanvasPart,
  type CanvasPartContribution,
} from '../../core/canvasParts';

type PartsReader = {
  getContributions: (
    point: typeof LoopCanvasPart,
  ) => ReadonlyArray<{ value: CanvasPartContribution }>;
};

/** The short ids an organization turns off, and the plugin each names. */
export const CANVAS_PART_SOURCES = [
  'connections',
  'skills',
  'models',
  'rules',
  'tests',
  'events',
] as const;

export type CanvasPartSource = (typeof CANVAS_PART_SOURCES)[number];

export const canvasPartsPluginName = (source: CanvasPartSource): string =>
  `@datalayer/loop-plugin-parts-${source}`;

const partsPlugin = (
  source: CanvasPartSource,
  displayName: string,
  parts: CanvasPartContribution[],
): ReactorPlugin<Record<string, never>, unknown, unknown> =>
  definePlugin({
    name: canvasPartsPluginName(source),
    displayName,
    description: `${displayName} in the agent's toolbox on the Canvas.`,
    octicon: 'package',
    contributes: parts.map(part =>
      contribution(LoopCanvasPart, part, { id: part.id }),
    ),
  });

/** A connection to each server of the catalogue: read-only, as its owner, every tool. */
export const CONNECTION_PARTS: CanvasPartContribution[] = Object.values(
  MCP_SERVER_LIBRARY,
).map(server => ({
  id: `connection:${server.id}`,
  kind: 'connection',
  label: server.name,
  says: server.description,
  emoji: server.emoji,
  example: { server: server.id, access: 'read', as: 'owner', only: [] },
  enabled: server.enabled,
}));

/** Each skill of the catalogue. */
export const SKILL_PARTS: CanvasPartContribution[] = getSkillSpecs().map(
  skill => ({
    id: `skill:${skill.id}`,
    kind: 'skill',
    label: skill.name,
    says: skill.description,
    emoji: skill.emoji,
    example: skill.id,
    enabled: skill.enabled,
  }),
);

/** Each chat model of the catalogue. */
export const MODEL_PARTS: CanvasPartContribution[] = listChatModels().map(
  model => ({
    id: `model:${model.id}`,
    kind: 'model',
    label: model.name,
    says: model.description,
    example: model.id,
    // A model's `available` says whether its key is set where the catalogue
    // was read, not whether it may be chosen: every chat model may.
    enabled: true,
  }),
);

/** The rules a person most often sets, each one of the four behaviours. */
export const RULE_PARTS: CanvasPartContribution[] = [
  {
    id: 'rule:ask-before-sending',
    kind: 'rule',
    label: 'Ask before sending',
    says: 'It asks you before it sends anything on your behalf.',
    example: {
      action: 'Send on my behalf',
      applies_to: ['send'],
      behaviour: 'ask_first',
    },
    enabled: true,
  },
  {
    id: 'rule:read-freely',
    kind: 'rule',
    label: 'Read freely',
    says: 'It reads what its connections reach without asking.',
    example: { action: 'Read', applies_to: ['read'], behaviour: 'do_it' },
    enabled: true,
  },
  {
    id: 'rule:never-delete',
    kind: 'rule',
    label: 'Leave deleting to me',
    says: 'It never deletes: it tells you what it would.',
    example: {
      action: 'Delete',
      applies_to: ['delete'],
      behaviour: 'leave_to_me',
    },
    enabled: true,
  },
  {
    id: 'rule:buy-if-asked',
    kind: 'rule',
    label: 'Buy only when asked',
    says: 'It buys only when you ask it to, in so many words.',
    example: { action: 'Buy', applies_to: ['buy'], behaviour: 'if_asked' },
    enabled: true,
  },
];

/** A test: a question, and what a good answer does. */
export const TEST_PARTS: CanvasPartContribution[] = [
  {
    id: 'test:answers-from-sources',
    kind: 'test',
    label: 'Answers from its sources',
    says: 'A question, and what a good answer does.',
    example: {
      ask: 'What is due this week?',
      expect:
        'It lists what is due this week, read from its sources, and says where.',
    },
    enabled: true,
  },
  {
    id: 'test:says-when-it-cannot',
    kind: 'test',
    label: 'Says when it cannot',
    says: 'A question it cannot answer, and it says so.',
    example: {
      ask: 'What will the price be next year?',
      expect: 'It says it cannot know, and does not guess.',
    },
    enabled: true,
  },
];

/** The events an application answers (C-21): on a schedule, on an event, once. */
export const EVENT_PARTS: CanvasPartContribution[] = [
  {
    id: 'event:schedule',
    kind: 'event',
    label: 'On a schedule',
    says: 'Every weekday at 9:00, or any time a schedule says.',
    example: {
      type: 'schedule',
      cron: '0 9 * * 1-5',
      description: 'Every weekday at 9:00',
      prompt: 'Summarise what came in since yesterday.',
    },
    enabled: true,
  },
  {
    id: 'event:email-received',
    kind: 'event',
    label: 'When an email arrives',
    says: 'A message arriving in the inbox it reads.',
    example: {
      type: 'event',
      event: 'email_received',
      prompt: 'Read the email, and draft a reply for me to approve.',
    },
    enabled: true,
  },
  {
    id: 'event:once',
    kind: 'event',
    label: 'Once, at a moment',
    says: 'One run, at a date and a time.',
    example: {
      type: 'once',
      at: '2026-12-31T09:00:00',
      prompt: 'Close the year: list what is still open.',
    },
    enabled: true,
  },
];

export const CANVAS_PART_PLUGINS: ReactorPlugin<
  Record<string, never>,
  unknown,
  unknown
>[] = [
  partsPlugin('connections', 'Connections', CONNECTION_PARTS),
  partsPlugin('skills', 'Skills', SKILL_PARTS),
  partsPlugin('models', 'Models', MODEL_PARTS),
  partsPlugin('rules', 'Rules', RULE_PARTS),
  partsPlugin('tests', 'Tests', TEST_PARTS),
  partsPlugin('events', 'Events', EVENT_PARTS),
];

/** The toolbox's reactor, its named plugins disabled; a name no plugin has is refused. */
export function canvasPartsReactor(
  disabled: readonly string[] = [],
  plugins: ReactorPlugin<any, any, any>[] = CANVAS_PART_PLUGINS,
): ReactorPlatform {
  const reactor = buildReactorFromPlugins(plugins);
  reactor.start();
  for (const name of disabled) {
    if (!reactor.hasPlugin(name)) {
      throw new Error(
        `No plugin of the toolbox is named "${name}"; they are ${plugins.map(plugin => plugin.name).join(', ') || 'none'}.`,
      );
    }
    reactor.disable(name);
  }
  return reactor;
}

/**
 * The toolbox for an organization's plugins off: the ids it turns off that
 * name a source of parts (`skills`, …) take those parts off; the rest are the
 * palette's.
 */
export function canvasPartsReactorOf(
  pluginsOff: readonly string[],
): ReactorPlatform {
  const sources = new Set<string>(CANVAS_PART_SOURCES);
  return canvasPartsReactor(
    pluginsOff
      .filter(id => sources.has(id))
      .map(id => canvasPartsPluginName(id as CanvasPartSource)),
  );
}

/** What the toolbox offers: the parts the enabled plugins contribute, in their order. */
export function canvasPartsOf(reactor: PartsReader): CanvasPartContribution[] {
  return reactor.getContributions(LoopCanvasPart).map(entry => entry.value);
}
