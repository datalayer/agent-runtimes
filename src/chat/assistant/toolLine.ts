/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the floating assistant's balloon shows (LOOP T-23): the whole
 * conversation (`history`), or only what it says or does now (`current`);
 * and, either way, the tool it calls, in plain words — "Using
 * **list_invoices**…", then "Done: list_invoices" or "list_invoices failed".
 *
 * @module chat/assistant/toolLine
 */

import { BACKEND_TOOL_CATALOG } from '../../specs/backendTools';

/**
 * How the balloon shows the conversation: `history`, every message,
 * scrolled, the composer last; `current`, only what it says or does now, in
 * one balloon that replaces its words as the turn goes on.
 */
export type BalloonDisplay = 'history' | 'current';

/** The two displays, in the Appspec's order (`interface.balloon`). */
export const BALLOON_DISPLAYS: readonly BalloonDisplay[] = [
  'history',
  'current',
];

/** The floating chat's display when nothing says one. */
export const DEFAULT_BALLOON_DISPLAY: BalloonDisplay = 'history';

/** Where a tool call is: running, returned, or failed. */
export type ToolLinePhase = 'running' | 'done' | 'failed';

/** A tool call, as the balloon says it. */
export interface BalloonToolLine {
  /** The call's id: a start and its end share it. */
  id: string;
  /** The tool's name, as the agent calls it (`list_invoices`). */
  tool: string;
  /** How it is said: the spec's display name, else the name. */
  name: string;
  phase: ToolLinePhase;
  /**
   * Its own words, when its runtime said what it does (`Writing a
   * notebook…`, `Asking Accounting…`): said in place of "Using …".
   */
  words?: string;
}

let displayNames: Map<string, string> | null = null;

/**
 * How a tool is said: the display name its runtime spec gives it (`Current
 * Time` for `current_time`), else its own name without the MCP server's
 * prefix (`odoo__list_invoices` is `list_invoices`).
 */
export function toolDisplayName(tool: string): string {
  if (!displayNames) {
    displayNames = new Map();
    for (const spec of Object.values(BACKEND_TOOL_CATALOG)) {
      const method = spec.runtime?.method;
      if (method && spec.name && !displayNames.has(method)) {
        displayNames.set(method, spec.name);
      }
    }
  }
  const named = displayNames.get(tool);
  if (named) {
    return named;
  }
  const at = tool.indexOf('__');
  return at > 0 ? tool.slice(at + 2) : tool;
}

/** The three parts a tool line is said in: before the name, the name, after it. */
export function toolLineParts(line: BalloonToolLine): {
  before: string;
  name: string;
  after: string;
} {
  if (line.phase === 'running' && line.words) {
    return { before: '', name: '', after: line.words };
  }
  switch (line.phase) {
    case 'running':
      return { before: 'Using ', name: line.name, after: '…' };
    case 'done':
      return { before: 'Done: ', name: line.name, after: '' };
    case 'failed':
      return { before: '', name: line.name, after: ' failed' };
  }
}

/** A tool line in plain words: "Using list_invoices…". */
export function toolLineText(line: BalloonToolLine): string {
  const { before, name, after } = toolLineParts(line);
  return `${before}${name}${after}`;
}

/** An item of the conversation, as far as a tool line reads it. */
interface ToolItem {
  id?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  status?: unknown;
  error?: unknown;
}

/**
 * The tool line of the conversation's newest item, when that item is a tool
 * call: running until it is complete or failed. Once words follow it, the
 * newest item is the answer, and there is no tool line.
 */
export function newestToolLine(
  items: readonly unknown[],
): BalloonToolLine | undefined {
  const newest = items[items.length - 1] as ToolItem | undefined;
  if (!newest || typeof newest.toolName !== 'string' || !newest.toolName) {
    return undefined;
  }
  const phase: ToolLinePhase =
    newest.status === 'error' ||
    (typeof newest.error === 'string' && newest.error)
      ? 'failed'
      : newest.status === 'complete'
        ? 'done'
        : 'running';
  return {
    id: String(newest.toolCallId ?? newest.id ?? newest.toolName),
    tool: newest.toolName,
    name: toolDisplayName(newest.toolName),
    phase,
  };
}

/** A tool step a peer told over A2A (`a2aPeer`'s `A2APeerToolStep`). */
export interface ToolStep {
  id?: string;
  name: string;
  ended: boolean;
  error?: string;
}

/** The tool line of a step a peer told: its start running, its end done or failed. */
export function toolLineOfStep(
  step: ToolStep,
  name = toolDisplayName(step.name),
): BalloonToolLine {
  return {
    id: step.id ?? step.name,
    tool: step.name,
    name,
    phase: step.error ? 'failed' : step.ended ? 'done' : 'running',
  };
}

/**
 * What a screen reader hears of a tool line: once when the call starts and
 * once when it ends — a new id or a new phase — never while it runs.
 */
export function toolAnnouncement(
  line: BalloonToolLine | undefined,
  previous: { id: string; phase: ToolLinePhase } | undefined,
): string | undefined {
  if (!line) {
    return undefined;
  }
  if (previous && previous.id === line.id && previous.phase === line.phase) {
    return undefined;
  }
  return toolLineText(line);
}

/**
 * How many messages the conversation holds, as the `history` balloon's
 * header counts them: the person's and the agent's, not the tool calls.
 */
export function conversationCount(items: readonly unknown[]): number {
  return items.filter(item => {
    const message = item as { role?: unknown; toolName?: unknown };
    return (
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.toolName !== 'string'
    );
  }).length;
}
