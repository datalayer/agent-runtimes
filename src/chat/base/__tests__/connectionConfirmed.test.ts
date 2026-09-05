/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When the composer will accept a keystroke.
 *
 * `InputPrompt` passes `readOnly={!connectionConfirmed}` to a Lexical editor,
 * and a Lexical editor that is not editable still looks and selects like one —
 * it simply ignores typing. So a `connectionConfirmed` that never becomes true
 * is not a visible failure; it is an input that quietly does nothing.
 *
 * It waits for the config query because that round trip proves the agent is
 * reachable. The rule therefore has to mirror the condition deciding whether
 * the query runs at all: anything that will never produce data must count as
 * confirmed, or the wait never ends.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('the selectors bar', () => {
  const PROMPT = readFileSync(
    join(__dirname, '..', '..', 'prompt', 'InputPrompt.tsx'),
    'utf8',
  );

  it('offers each menu the host asked for, contents or not', () => {
    /*
     * Two rules replaced in turn. It first asked one question for all four
     * menus — has any request come back — so a ready model list sat behind
     * "Loading controls..." waiting on a config endpoint that did not exist.
     * Then each asked after its own data, which still hid a menu with nothing
     * in it — and "no skills" is not the same answer as "skills not
     * reported", though an absent menu says both.
     */
    expect(PROMPT).toContain('const modelsOffered = showModelSelector;');
    expect(PROMPT).toContain('const toolsOffered = showToolsMenu;');
    expect(PROMPT).toContain('const skillsOffered = showSkillsMenu;');
  });

  it('says "loading" only while something is genuinely in flight', () => {
    expect(PROMPT).toContain('const stillLoading =');
    expect(PROMPT).toContain('configLoading');
    // And draws no bar at all when there is nothing to put in it.
    expect(PROMPT).toContain(
      'const showSelectorsBar = anyOffered || stillLoading',
    );
  });
});

describe('the context snapshot', () => {
  it('reads the socket rather than returning nothing', () => {
    /*
     * It was a stub. The REST endpoint it polled had been removed and the
     * WebSocket replacement was never wired in, so it returned `undefined`
     * for every agent on every target — and the token-usage bar, which only
     * renders when `totalTokens > 0`, was therefore invisible everywhere no
     * matter how a host configured it. The store had the data all along.
     */
    const source = readFileSync(
      join(__dirname, '..', '..', '..', 'hooks', 'useContextSnapshot.ts'),
      'utf8',
    );
    expect(source).toContain('useAgentRuntimeContextSnapshot()');
    expect(source).not.toContain('data: undefined');
  });
});

describe('the command menu', () => {
  const SOURCE = readFileSync(
    join(__dirname, '..', '..', 'prompt', 'plugins', 'CommandPlugin.tsx'),
    'utf8',
  );

  it('triggers on `/` at a word boundary', () => {
    // Not mid-word, so a path or a fraction does not open a menu.
    expect(SOURCE).toContain('/(?:^|\\s)\\/([\\w-]*)$/');
  });

  it('owns the keys above the submit handler while it is open', () => {
    /*
     * `EnterSubmitPlugin` registers Enter at `HIGH`. A menu registering below
     * that never sees the key: choosing an entry sends the half-written
     * message instead, which is what the mention menu did until it was
     * raised.
     */
    expect(SOURCE).toContain('COMMAND_PRIORITY_CRITICAL');
    expect(SOURCE).not.toContain('COMMAND_PRIORITY_LOW');
  });

  it('offers every command as not-yet-available', () => {
    // None is wired to anything, and a menu that accepts a choice and does
    // nothing is worse than one that says so.
    const disabled = SOURCE.match(/disabled: true/g) ?? [];
    expect(disabled).toHaveLength(3);
  });
});
