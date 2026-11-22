/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A header UI's state, read from the conversation (the user, 18 November
 * 2026: "the chat can interact to share visual indications (labels,
 * indicators) — plugins associated with frontend tools should be able to
 * support such interactions").
 *
 * A header UI (`agentspecs/ui/<id>.yaml`, `header`) declares three items at
 * most — buttons, drop-downs, indicators — and one frontend tool,
 * `set_<its id>`, whose arguments are one per item it sets. What its
 * indicators show is the fold of that tool's answered calls in the
 * conversation, in order (`toolResults`): nothing is made up, a re-render
 * changes nothing, and a conversation opened again shows them as they stood.
 * A drop-down is what the person picked last, or what the tool set since.
 *
 * Pure: no React, no reactor — the components are `headerItems.tsx`.
 *
 * @module apps/toolCards/headerState
 */

import type {
  UiHeaderItemSpec,
  UiHeaderSpec,
  UiHeaderTone,
} from '../../types/agentspecs';
import { record } from './kit';

export const HEADER_TONES: readonly UiHeaderTone[] = [
  'neutral',
  'accent',
  'success',
  'attention',
  'danger',
];

/** The longest words an indicator carries. */
export const HEADER_LABEL_MAX = 48;

/** What an indicator shows. */
export type HeaderIndicatorState = {
  value?: number;
  max?: number;
  label?: string;
  tone?: UiHeaderTone;
  visible?: boolean;
};

/** An answered call of a header's tool, in the conversation's order. */
export type HeaderToolCall = {
  args: Record<string, unknown>;
  order: number;
};

/** A drop-down the person picked: the option, and the tool's last call seen then. */
export type HeaderPick = { option: string; after: number };

/** A header's frontend tool: `set_<its id>`, hyphens as underscores. */
export function headerToolName(uiId: string): string {
  return `set_${uiId.replace(/-/g, '_')}`;
}

/** The items a header's tool sets: its indicators and its drop-downs. */
export function settableItems(header: UiHeaderSpec): UiHeaderItemSpec[] {
  return header.items.filter(item => item.kind !== 'action');
}

const numberWords = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(value);

/**
 * The tool's arguments as a JSON Schema: one per item it sets, all optional.
 * The same schema as agentspecs' `header_tool_parameters`.
 */
export function headerToolParameters(
  header: UiHeaderSpec,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const item of settableItems(header)) {
    if (item.kind === 'choice') {
      properties[item.id] = {
        type: 'string',
        enum: (item.options ?? []).map(option => option.id),
        description: `${item.label}: ${item.description} Set it only when the person says so in the conversation.`,
      };
      continue;
    }
    const fields: Record<string, unknown> = {};
    if (item.display === 'counter' || item.display === 'meter') {
      fields.value = { type: 'number', description: 'The number shown.' };
    }
    if (item.display === 'meter') {
      fields.max = {
        type: 'number',
        description: `The full value; ${numberWords(item.max ?? 100)} unsaid.`,
      };
    }
    fields.label = {
      type: 'string',
      maxLength: HEADER_LABEL_MAX,
      description: 'Its words, a few.',
    };
    fields.tone = {
      type: 'string',
      enum: [...HEADER_TONES],
      description: 'What its colour says; neutral unsaid.',
    };
    fields.visible = {
      type: 'boolean',
      description: 'false takes it off the title bar.',
    };
    properties[item.id] = {
      type: 'object',
      description: `${item.label}: ${item.description}`,
      properties: fields,
      additionalProperties: false,
    };
  }
  return { type: 'object', properties, additionalProperties: false };
}

/** What the model reads of the tool. */
export function headerToolDescription(
  name: string,
  header: UiHeaderSpec,
): string {
  const items = settableItems(header)
    .map(item => item.id)
    .join(', ');
  return [
    `Shows the person, in the title bar of the chat, what ${name} is about (${items}).`,
    'It runs in their page: it reads nothing and changes nothing else.',
    'Only the items you name change; the others stay as they are.',
    header.when ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What a call's arguments say, held to the header: the rest is said as problems. */
export type HeaderArgsRead = {
  indicators: Record<string, HeaderIndicatorState>;
  choices: Record<string, string>;
  problems: string[];
};

/** Reads a call's arguments against the header's items. */
export function readHeaderArgs(
  header: UiHeaderSpec,
  args: Record<string, unknown> | undefined,
): HeaderArgsRead {
  const read: HeaderArgsRead = { indicators: {}, choices: {}, problems: [] };
  const items = new Map(settableItems(header).map(item => [item.id, item]));
  for (const [key, given] of Object.entries(args ?? {})) {
    const item = items.get(key);
    if (!item) {
      read.problems.push(
        `There is no item '${key}': one of ${[...items.keys()].join(', ')}.`,
      );
      continue;
    }
    if (item.kind === 'choice') {
      const option = (item.options ?? []).find(
        each => each.id === String(given),
      );
      if (!option) {
        read.problems.push(
          `${item.label} has no option '${String(given)}': one of ${(item.options ?? []).map(each => each.id).join(', ')}.`,
        );
        continue;
      }
      read.choices[key] = option.id;
      continue;
    }
    const said = record(given);
    if (!said) {
      read.problems.push(
        `'${key}' takes an object: label, tone, visible${item.display === 'counter' || item.display === 'meter' ? ', value' : ''}.`,
      );
      continue;
    }
    const state: HeaderIndicatorState = {};
    const numeric = item.display === 'counter' || item.display === 'meter';
    if (numeric && said.value !== undefined && said.value !== null) {
      const value = Number(said.value);
      if (Number.isFinite(value)) {
        state.value = value;
      } else {
        read.problems.push(`'${key}.value' is not a number.`);
      }
    }
    if (item.display === 'meter' && said.max !== undefined) {
      const max = Number(said.max);
      if (Number.isFinite(max) && max > 0) {
        state.max = max;
      } else {
        read.problems.push(`'${key}.max' is not a number above zero.`);
      }
    }
    if (typeof said.label === 'string') {
      state.label = said.label.trim().slice(0, HEADER_LABEL_MAX);
    }
    if (said.tone !== undefined) {
      if (HEADER_TONES.includes(said.tone as UiHeaderTone)) {
        state.tone = said.tone as UiHeaderTone;
      } else {
        read.problems.push(
          `'${key}.tone' is one of ${HEADER_TONES.join(', ')}.`,
        );
      }
    }
    if (typeof said.visible === 'boolean') {
      state.visible = said.visible;
    }
    read.indicators[key] = state;
  }
  return read;
}

/** A header as its tool's calls leave it. */
export type HeaderState = {
  /** Each indicator the tool has set, and the call that set it last. */
  indicators: Record<string, HeaderIndicatorState & { order: number }>;
  /** Each drop-down the tool has set, and the call that set it last. */
  choices: Record<string, HeaderPick>;
  /** The last call's order; 0 before any. */
  last: number;
};

/**
 * The fold of the tool's calls, oldest first: each names the items it
 * changes, and of an indicator only the fields it gives — but a call that
 * shows an indicator again without `visible` shows it.
 */
export function headerStateOf(
  header: UiHeaderSpec,
  calls: readonly HeaderToolCall[],
): HeaderState {
  const state: HeaderState = { indicators: {}, choices: {}, last: 0 };
  for (const call of [...calls].sort((a, b) => a.order - b.order)) {
    const read = readHeaderArgs(header, call.args);
    for (const [id, patch] of Object.entries(read.indicators)) {
      state.indicators[id] = {
        ...state.indicators[id],
        visible: true,
        ...patch,
        order: call.order,
      };
    }
    for (const [id, option] of Object.entries(read.choices)) {
      state.choices[id] = { option, after: call.order };
    }
    state.last = Math.max(state.last, call.order);
  }
  return state;
}

/** The option a drop-down starts with. */
export function defaultOptionOf(item: UiHeaderItemSpec): string {
  return item.default ?? item.options?.[0]?.id ?? '';
}

/**
 * The option a drop-down is on: what the person picked, unless the tool set
 * it since; else what the tool set; else its default.
 */
export function chosenOptionOf(
  item: UiHeaderItemSpec,
  picked: HeaderPick | undefined,
  set: HeaderPick | undefined,
): string {
  if (picked && (!set || set.after <= picked.after)) {
    return picked.option;
  }
  return set?.option ?? defaultOptionOf(item);
}

/** Every drop-down's option, by item id: what goes with a run. */
export function chosenOptionsOf(
  header: UiHeaderSpec,
  picked: Readonly<Record<string, HeaderPick>>,
  state: HeaderState,
): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const item of header.items) {
    if (item.kind === 'choice') {
      chosen[item.id] = chosenOptionOf(
        item,
        picked[item.id],
        state.choices[item.id],
      );
    }
  }
  return chosen;
}

/** An indicator's words, as a screen reader says them and the tool's card shows them. */
export function indicatorWords(
  item: UiHeaderItemSpec,
  state: HeaderIndicatorState,
): string {
  if (item.display === 'meter') {
    const value = state.value ?? 0;
    return `${item.label}: ${numberWords(value)}${item.unit ?? ''}${state.label ? `, ${state.label}` : ''}`;
  }
  if (item.display === 'counter') {
    return `${item.label}: ${numberWords(state.value ?? 0)}${state.label ? ` · ${state.label}` : ''}`;
  }
  return state.label ? `${item.label}: ${state.label}` : item.label;
}

/** What the tool's card says in the conversation: what it set, in words. */
export function headerCallSummary(
  header: UiHeaderSpec,
  args: Record<string, unknown>,
): string | undefined {
  const read = readHeaderArgs(header, args);
  const parts: string[] = [];
  for (const item of header.items) {
    const indicator = read.indicators[item.id];
    if (indicator) {
      parts.push(
        indicator.visible === false
          ? `${item.label}: off`
          : indicatorWords(item, indicator),
      );
    }
    const option = read.choices[item.id];
    if (option) {
      const label = item.options?.find(each => each.id === option)?.label;
      parts.push(`${item.label}: ${label ?? option}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** The share of a meter that is filled, 0 to 1. */
export function meterShare(
  item: UiHeaderItemSpec,
  state: HeaderIndicatorState,
): number {
  const max = state.max ?? item.max ?? 100;
  const value = state.value ?? 0;
  return max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
}

/** What goes with a run for a header: `forwardedProps.agent.header.<ui id>`. */
export function headerRunProps(
  uiId: string,
  chosen: Record<string, string>,
): Record<string, unknown> {
  return Object.keys(chosen).length > 0
    ? { agent: { header: { [uiId]: chosen } } }
    : {};
}
