/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A card in the conversation drawn by the A2UI renderer (the user, 15
 * November 2026: "make sure ui can be used to be injected … as chat message
 * (a2ui)"): the seed agents' message UIs — the post previews, the
 * comparison, the basket, the reconciliation, the trip options, the scenes,
 * the index, the savings — say what they show as a `CardSpec`, written here
 * as A2UI v0.9 messages in the chat's catalogue (a title, captions, a
 * `Table`, markdown lines, images, sections each with its buttons) and drawn
 * by `InlineSurface`, the renderer the agents' own surfaces use. A button's
 * press comes back as its action's name and context.
 *
 * @module apps/toolCards/a2uiCard
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { Box } from '@datalayer/primer-addons';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../plugins/a2ui-surface/InlineSurface';

export type CardAction = {
  /** The event's name, as `onAction` receives it. */
  name: string;
  label: string;
  context?: Record<string, unknown>;
  primary?: boolean;
};

export type CardSection = {
  id: string;
  title?: string;
  /** Lines of markdown (a link as `[words](https://…)`). */
  lines?: string[];
  image?: { url: string; alt: string };
  actions?: CardAction[];
};

export type CardSpec = {
  /** Unique within the conversation: the tool call's id. */
  id: string;
  title: string;
  /** Captions under the title. */
  captions?: string[];
  table?: { columns: string[]; rows: Record<string, string>[] };
  image?: { url: string; alt: string };
  /** Lines of markdown after the table. */
  lines?: string[];
  sections?: CardSection[];
  actions?: CardAction[];
};

type Node = Record<string, unknown>;

const safeId = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, '-');

/** The card as A2UI v0.9 messages in a catalogue. */
export function cardMessages(
  spec: CardSpec,
  catalogId: string = SURFACE_CATALOG_ID,
): A2uiMessage[] {
  const surfaceId = `card-${safeId(spec.id)}`;
  const nodes: Node[] = [];
  const body: string[] = [];
  const text = (id: string, words: string, variant?: string): string => {
    nodes.push({
      id,
      component: 'Text',
      text: words,
      ...(variant ? { variant } : {}),
    });
    return id;
  };
  const buttons = (prefix: string, actions: CardAction[]): string => {
    const ids = actions.map((action, index) => {
      const id = `${prefix}-button-${index}`;
      text(`${id}-label`, action.label);
      nodes.push({
        id,
        component: 'Button',
        variant: action.primary ? 'primary' : 'default',
        child: `${id}-label`,
        action: { event: { name: action.name, context: action.context ?? {} } },
      });
      return id;
    });
    nodes.push({ id: `${prefix}-buttons`, component: 'Row', children: ids });
    return `${prefix}-buttons`;
  };
  body.push(text('title', spec.title, 'h3'));
  (spec.captions ?? []).forEach((caption, index) => {
    body.push(text(`caption-${index}`, caption, 'caption'));
  });
  if (spec.image) {
    nodes.push({
      id: 'image',
      component: 'Image',
      url: spec.image.url,
      description: spec.image.alt,
    });
    body.push('image');
  }
  if (spec.table && spec.table.rows.length > 0) {
    nodes.push({
      id: 'table',
      component: 'Table',
      columns: spec.table.columns,
      rows: spec.table.rows,
    });
    body.push('table');
  }
  (spec.lines ?? []).forEach((line, index) => {
    body.push(text(`line-${index}`, line));
  });
  (spec.sections ?? []).forEach((section, index) => {
    const prefix = `section-${index}`;
    const children: string[] = [];
    if (section.title) {
      children.push(text(`${prefix}-title`, section.title, 'h4'));
    }
    if (section.image) {
      nodes.push({
        id: `${prefix}-image`,
        component: 'Image',
        url: section.image.url,
        description: section.image.alt,
      });
      children.push(`${prefix}-image`);
    }
    (section.lines ?? []).forEach((line, lineIndex) => {
      children.push(text(`${prefix}-line-${lineIndex}`, line));
    });
    if (section.actions && section.actions.length > 0) {
      children.push(buttons(prefix, section.actions));
    }
    nodes.push({ id: `${prefix}-column`, component: 'Column', children });
    nodes.push({ id: prefix, component: 'Card', child: `${prefix}-column` });
    body.push(prefix);
  });
  if (spec.actions && spec.actions.length > 0) {
    body.push(buttons('card', spec.actions));
  }
  nodes.push({ id: 'body', component: 'Column', children: body });
  nodes.unshift({ id: 'root', component: 'Card', child: 'body' });
  return [
    { version: 'v0.9', createSurface: { surfaceId, catalogId } },
    { version: 'v0.9', updateComponents: { surfaceId, components: nodes } },
  ] as unknown as A2uiMessage[];
}

/**
 * The card, drawn by the A2UI renderer. Drawn anew when what it shows
 * changes: the renderer takes one set of messages per surface.
 */
export function A2uiCard({
  spec,
  onAction,
  maxWidth = 640,
}: {
  spec: CardSpec;
  onAction?: (action: A2uiClientAction) => void;
  maxWidth?: number;
}): JSX.Element {
  const messages = useMemo(() => cardMessages(spec), [spec]);
  const key = useMemo(() => JSON.stringify(spec), [spec]);
  return (
    <Box my={2} width="100%" maxWidth={maxWidth} data-a2ui-card={spec.id}>
      <InlineSurface
        key={key}
        messages={messages}
        onAction={onAction ?? (() => undefined)}
      />
    </Box>
  );
}
