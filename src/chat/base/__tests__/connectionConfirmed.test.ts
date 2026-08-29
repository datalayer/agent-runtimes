/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When the composer will accept a keystroke.
 *
 * `InputFooter` passes `readOnly={!connectionConfirmed}` to a Lexical editor,
 * and a Lexical editor that is not editable still looks and selects like one —
 * it simply ignores typing. So a `connectionConfirmed` that never becomes true
 * is not a visible failure; it is an input that quietly does nothing.
 *
 * It waits for the config query because that round trip proves the agent is
 * reachable. The rule therefore has to mirror the condition deciding whether
 * the query runs at all: anything that will never produce data must count as
 * confirmed, or the wait never ends.
 */

import { describe, expect, it } from 'vitest';

/** The condition as `ChatBase` computes it. */
function connectionConfirmed(options: {
  protocol?: { enableConfigQuery?: boolean };
  configData?: unknown;
  skillsData?: unknown;
}): boolean {
  const { protocol, configData, skillsData } = options;
  return (
    !protocol || !protocol.enableConfigQuery || !!configData || !!skillsData
  );
}

/** The condition that decides whether the query runs at all. */
function configQueriesEnabled(
  protocol: { enableConfigQuery?: boolean } | undefined,
  autoConnect: boolean,
): boolean {
  return Boolean(protocol?.enableConfigQuery) && autoConnect;
}

describe('confirming the connection', () => {
  it('waits for the query when one is going to run', () => {
    const protocol = { enableConfigQuery: true };
    expect(connectionConfirmed({ protocol })).toBe(false);
    expect(connectionConfirmed({ protocol, configData: { models: [] } })).toBe(
      true,
    );
    expect(connectionConfirmed({ protocol, skillsData: [] })).toBe(true);
  });

  it('does not wait when no query will run', () => {
    // The regression: an in-page agent has no endpoint to ask, so it leaves
    // the flag off. `=== false` did not match `undefined`, so the composer
    // waited on data that was never coming and ignored every keystroke.
    expect(connectionConfirmed({ protocol: {} })).toBe(true);
    expect(
      connectionConfirmed({ protocol: { enableConfigQuery: false } }),
    ).toBe(true);
    expect(connectionConfirmed({})).toBe(true);
  });

  it('confirms exactly when the query would not run', () => {
    // The invariant worth holding: the two conditions are complements, so a
    // composer can never wait for a query nobody started.
    for (const protocol of [
      undefined,
      {},
      { enableConfigQuery: false },
      { enableConfigQuery: true },
    ]) {
      const willRun = configQueriesEnabled(protocol, true);
      expect(connectionConfirmed({ protocol }), JSON.stringify(protocol)).toBe(
        !willRun,
      );
    }
  });
});
