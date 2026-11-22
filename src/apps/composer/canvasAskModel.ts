/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Ask the assistant* on the Canvas: "add a chart of the last ten
 * runs" becomes a change to the layout, shown before it is kept and undone in
 * one step.
 *
 * The composer that composes a decision's interface and drafts a whole
 * application from a sentence (`composerAnswer`) is asked for the whole new
 * layout: the current one, the components the palette offers, what the
 * application's kind publishes, takes and handles (`kindInterface`), and the
 * request. What comes back is checked as every change on the Canvas is
 * (`interfaceFindings`): a layout with a problem the current one does
 * not have is sent back once with what was wrong, and refused with a sentence
 * if it still has one. A layout that changes nothing is refused too. What is
 * kept is said in sentences first — what is added, removed, changed, moved.
 *
 * Pure but for the call to the model, which is given (`AskModel`): the page
 * gives ai-inference's chat completions, a test an answer it wrote.
 *
 * @module apps/composer/canvasAskModel
 */

import type { ComponentSpec } from '../../types/agentspecs';
import {
  INTERFACE_PROTOCOL,
  ROOT_ID,
  interfaceFindings,
  parseInterface,
  type AppInterface,
  type InterfaceComponent,
  type InterfaceOwner,
  type KindInterface,
} from './appInterface';

/** One message of a conversation with a model. */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** The model, asked: the text it answers. The host's, which knows which model and where. */
export type AskModel = (messages: ChatMessage[]) => Promise<string>;

/** What the assistant is asked with, besides the request. */
export type LayoutAskContext = {
  /** The layout as it is. */
  surface: AppInterface;
  /** The application whose layout it is: its kind and settings. */
  /** The application, when the definition has read its spec (`kindInterface` takes none). */
  app: InterfaceOwner | null;
  /** What its kind publishes, takes and handles. */
  gives: KindInterface;
  /** The components the palette offers. */
  palette: readonly ComponentSpec[];
  /** The components the application allows; every one when empty. */
  allowed: readonly string[];
  /** Every component of the catalog. */
  catalog: readonly string[];
  /** The catalog's component by its id. */
  componentSpec: (id: string) => ComponentSpec | undefined;
};

/** What the assistant proposes: the layout, and the change in sentences. */
export type LayoutProposal = { proposed: AppInterface; changes: string[] };

/** The words of a refusal when the model answers with no layout. */
export const NO_LAYOUT = 'No layout came back: ask again, in other words.';

/** The words of a refusal when the layout it answers is the one there is. */
export const NOTHING_CHANGED =
  'Nothing would change: ask again, in other words.';

const props = (spec: ComponentSpec): string =>
  Object.keys(
    (spec.properties.properties ?? {}) as Record<string, unknown>,
  ).join(', ') || 'none';

/** The messages the composer is asked with. */
export function layoutAskPrompt(
  request: string,
  context: LayoutAskContext,
): ChatMessage[] {
  const { gives, palette, surface } = context;
  const system = [
    "You change the layout of an application's page, an A2UI v0.9 component tree, as the builder asks. Answer with one JSON object and nothing else — no prose, no code fence:",
    '{"components": [ {"id": "root", "component": "Column", "children": ["..."]}, ... ]}',
    '',
    'Rules:',
    '- Answer with the whole layout after the change. Keep every component the request does not change exactly as it is: its id, its properties, its place.',
    `- The tree starts at the component whose id is "${ROOT_ID}". Every id is unique; every id referred to exists.`,
    '- Column, Row and List take "children": a list of component ids. Card takes "child". Button takes "child" (a Text) and "action": {"event": {"name": "<action>", "context": {...}}}.',
    '- A property shows what the application publishes when it is {"path": "<path>"}; a block sends what a person does to {"path": "<path>"} where the application takes it.',
    '- Any component but the root may take "visible_when": {"path": "<path>"}.',
    '',
    'The components you may use, with their properties:',
    ...palette.map(spec => {
      const bindings = spec.bindings
        ? ` Shows: ${spec.bindings.shows.join(', ') || 'nothing'}. Sends: ${spec.bindings.sends.join(', ') || 'nothing'}.`
        : '';
      return `- ${spec.id}: ${spec.description} Properties: ${props(spec)}.${bindings}`;
    }),
    '',
    'What the page publishes — read these paths and no other:',
    ...(gives.publishes.length
      ? gives.publishes.map(entry => `- ${entry.path}: ${entry.meaning}`)
      : ['- nothing']),
    '',
    'Where what a person does may be written:',
    ...(gives.accepts.length
      ? gives.accepts.map(entry => `- ${entry.path}: ${entry.meaning}`)
      : ['- nowhere']),
    '',
    'The actions the page handles — dispatch these and no other:',
    ...(gives.actions.length
      ? gives.actions.map(action => `- ${action.name}: ${action.meaning}`)
      : ['- none']),
  ].join('\n');
  const user = [
    'The layout now:',
    JSON.stringify({ components: surface.components }),
    '',
    `The change asked: ${request.trim()}`,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Where each block is: its parent and its place among its siblings. */
const placesOf = (
  surface: AppInterface,
): Map<string, { parent: string; index: number }> => {
  const places = new Map<string, { parent: string; index: number }>();
  for (const node of surface.components) {
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child, index) => {
      if (typeof child === 'string') {
        places.set(child, { parent: node.id, index });
      }
    });
    for (const key of ['child', 'trigger', 'content']) {
      if (typeof node[key] === 'string') {
        places.set(node[key] as string, { parent: node.id, index: 0 });
      }
    }
  }
  return places;
};

/** A node without what places others: its own properties. */
const ownOf = (node: InterfaceComponent): Record<string, unknown> => {
  const { children: _children, ...rest } = node;
  return rest;
};

const same = (one: unknown, other: unknown): boolean =>
  JSON.stringify(one) === JSON.stringify(other);

/**
 * The change from one layout to another, in sentences: each block added,
 * removed, whose properties changed, or moved into another — named as the
 * Canvas names it (`nameOf`).
 */
export function layoutChanges(
  before: AppInterface,
  after: AppInterface,
  nameOf: (surface: AppInterface, id: string) => string,
): string[] {
  const was = new Map(before.components.map(node => [node.id, node]));
  const is = new Map(after.components.map(node => [node.id, node]));
  const wasAt = placesOf(before);
  const isAt = placesOf(after);
  const changes: string[] = [];
  for (const node of after.components) {
    const old = was.get(node.id);
    if (!old) {
      const at = isAt.get(node.id);
      changes.push(
        `Adds ${nameOf(after, node.id)}${at ? ` to ${nameOf(after, at.parent)}` : ''}.`,
      );
      continue;
    }
    if (!same(ownOf(old), ownOf(node))) {
      const keys = [
        ...new Set([...Object.keys(old), ...Object.keys(node)]),
      ].filter(key => key !== 'children' && !same(old[key], node[key]));
      changes.push(`Changes ${nameOf(after, node.id)}: ${keys.join(', ')}.`);
    }
    const from = wasAt.get(node.id);
    const to = isAt.get(node.id);
    if (from && to && from.parent !== to.parent) {
      changes.push(
        `Moves ${nameOf(after, node.id)} into ${nameOf(after, to.parent)}.`,
      );
    } else if (
      from &&
      to &&
      from.index !== to.index &&
      was.has(to.parent) &&
      is.has(to.parent)
    ) {
      changes.push(
        `Moves ${nameOf(after, node.id)} to place ${to.index + 1} in ${nameOf(after, to.parent)}.`,
      );
    } else if (!from && to && node.id !== ROOT_ID) {
      changes.push(
        `Puts ${nameOf(after, node.id)} back on the layout, in ${nameOf(after, to.parent)}.`,
      );
    }
  }
  for (const node of before.components) {
    if (!is.has(node.id)) {
      changes.push(`Removes ${nameOf(before, node.id)}.`);
    }
  }
  return changes;
}

/** The problems of a layout, as the Canvas says them. */
const problemsOf = (
  surface: AppInterface,
  context: LayoutAskContext,
): string[] =>
  interfaceFindings(surface, context.allowed, context.catalog, {
    app: context.app,
    componentSpec: context.componentSpec,
  }).map(finding => finding.problem);

/**
 * The layout the assistant proposes for a request, checked; or why there is
 * none. A problem the layout had already is not the assistant's to fix: only
 * a new one sends it back, once.
 */
export async function proposeLayout(
  request: string,
  context: LayoutAskContext,
  ask: AskModel,
  nameOf: (surface: AppInterface, id: string) => string,
): Promise<LayoutProposal | { refused: string }> {
  if (!request.trim()) {
    return {
      refused: 'Say what to change first: "add a chart of the last ten runs".',
    };
  }
  const already = new Set(problemsOf(context.surface, context));
  const messages = layoutAskPrompt(request, context);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ask(messages);
    const parsed = parseInterface(answer);
    if (!parsed) {
      if (attempt === 0) {
        messages.push(
          { role: 'assistant', content: answer },
          { role: 'user', content: NO_LAYOUT },
        );
        continue;
      }
      return { refused: NO_LAYOUT };
    }
    const proposed: AppInterface = {
      protocol: INTERFACE_PROTOCOL,
      components: parsed.components,
      composedBy: context.surface.composedBy,
      composedAt: context.surface.composedAt,
    };
    const fresh = problemsOf(proposed, context).filter(
      problem => !already.has(problem),
    );
    if (fresh.length === 0) {
      const changes = layoutChanges(context.surface, proposed, nameOf);
      return changes.length
        ? { proposed, changes }
        : { refused: NOTHING_CHANGED };
    }
    if (attempt === 1) {
      return {
        refused: `The layout that came back would not work: ${fresh.join(' ')}`,
      };
    }
    messages.push(
      { role: 'assistant', content: answer },
      {
        role: 'user',
        content: `That layout has problems; answer again with the whole layout, fixed:\n${fresh.map(problem => `- ${problem}`).join('\n')}`,
      },
    );
  }
  return { refused: NO_LAYOUT };
}
