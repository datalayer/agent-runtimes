/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One host thread is one Datalayer session: its uid, derived from where the
 * thread is, so that a retry names it again. Moved from the Slack service (DC-004).
 *
 * @module portable/hosts/sessionUid
 */

import { createHash } from 'node:crypto';

/**
 * `<kind>-<40 hex>`: the SHA-256 of the thread's parts joined by `:`, and
 * `:<generation>` once the thread started over or switched application. The
 * same parts give the same uid (Slack: app, enterprise or `-`, team,
 * channel, thread ts; Discord: application, guild, channel, thread).
 */
export function hostSessionUid(
  kind: string,
  parts: readonly string[],
  generation?: number,
): string {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(kind)) {
    throw new Error(`A host kind is lowercase letters and digits: ${kind}.`);
  }
  if (parts.length === 0 || parts.some(part => part === '')) {
    throw new Error('A thread is named by its parts, none of them empty.');
  }
  const key = `${parts.join(':')}${generation ? `:${generation}` : ''}`;
  return `${kind}-${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
}
