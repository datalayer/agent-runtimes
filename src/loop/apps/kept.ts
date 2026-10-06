/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application keeps, said before the first message (LOOP R-31).
 *
 * A hosted or embedded application tells whoever uses it what its record
 * keeps of the conversation — what its `record.include` names — and for how
 * long — its `record.keep_for` — before they write anything. A session's
 * start is kept whatever `include` says, so an application that keeps
 * nothing else says that the conversation took place is kept. A visitor not
 * signed in has nothing kept (R-30), and is told so.
 *
 * Pure: no React.
 *
 * @module loop/apps/kept
 */

import type { AppSpec } from '../../types/agentspecs';
import type { ChatTurnSnapshot } from '../core';

/** What each item of `record.include` keeps, in a person's words. */
export const KEPT_ITEMS: Record<string, string> = {
  conversations: 'this conversation',
  actions: 'what it does',
  decisions: 'how its rules decided',
  approvals: 'what is approved',
  checks: 'what its checks stopped',
  outputs: 'its answers',
  feedback: 'what you say of its answers',
};

const RETENTION = /^([1-9]\d*)_(day|days|month|months|year|years)$/;

/** A retention in words: `30_days` → "30 days", `1_years` → "a year". */
export function keptForWords(keepFor: string): string {
  const matched = RETENTION.exec(keepFor.trim());
  if (!matched) {
    throw new Error(
      `Cannot read the retention \`${keepFor}\`: write 90_days, 18_months or 1_years.`,
    );
  }
  const count = Number(matched[1]);
  const unit = matched[2].replace(/s$/, '');
  return count === 1 ? `a ${unit}` : `${count} ${unit}s`;
}

/** A list in words: "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What an application says it keeps, before the first message.
 *
 * `visitor`: the person is not signed in, and nothing of theirs is kept.
 */
export function keptBeforeFirstMessage(
  app: Pick<AppSpec, 'name' | 'record'>,
  { visitor = false }: { visitor?: boolean } = {},
): string {
  if (visitor) {
    return 'Nothing of this conversation is kept: you are not signed in.';
  }
  const name = app.name || 'This application';
  const days = keptForWords(app.record.keepFor);
  const kept = app.record.include
    .map(item => KEPT_ITEMS[item])
    .filter((words): words is string => Boolean(words));
  if (!kept.length) {
    return `${name} keeps only that this conversation took place, for ${days}.`;
  }
  return `${name} keeps ${inWords(kept)} for ${days}, then deletes it.`;
}

/** Whether it is still before the first message: what it keeps is said then only. */
export const beforeFirstMessage = (turn: ChatTurnSnapshot): boolean =>
  turn.id === 0 && !turn.user;
