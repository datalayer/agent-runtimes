/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A rule on a running session (SHIELD SH-54): the words, the shapes the
 * runtime takes, and the three routes the card speaks to.
 */

import { describe, expect, it } from 'vitest';
import {
  SESSION_RULES_WORDS,
  addSessionRule,
  readSessionRules,
  removeSessionRule,
  sessionRuleInWords,
  sessionRuleOf,
  sessionRulesUrl,
} from '../apps/sessionRules';

const inForce = {
  uid: 'session-0001',
  harness: null,
  policies: [{ scope: 'session', rules: [] }],
  session_rules: [{ name: 'no sends', decision: 'deny', classes: ['send'] }],
  unavailable: null,
};

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('a rule on a running session', () => {
  it('says a rule in words, everything when it names no class', () => {
    expect(
      sessionRuleInWords({
        name: 'x',
        decision: 'deny',
        classes: ['send', 'write'],
      }),
    ).toBe('sending, writing: leave it to me');
    expect(sessionRuleInWords({ name: 'x', decision: 'ask' })).toBe(
      'everything: ask me first',
    );
  });

  it('takes what the person typed, or says why not', () => {
    expect(
      sessionRuleOf({
        name: ' no sends ',
        decision: 'deny',
        classes: ['send', 'nope'],
      }),
    ).toEqual({
      name: 'no sends',
      decision: 'deny',
      classes: ['send'],
    });
    expect(sessionRuleOf({ name: '', decision: 'deny', classes: [] })).toMatch(
      /needs a name/,
    );
    expect(
      sessionRuleOf({ name: 'x', decision: 'maybe', classes: [] }),
    ).toMatch(/not “maybe”/);
  });

  it('reads, adds and removes through the session API with the person’s token', async () => {
    const read = fakeFetch(200, inForce);
    const got = await readSessionRules(
      'http://rt',
      'tok',
      'session 1',
      read.fetcher,
    );
    expect(got.session_rules[0].name).toBe('no sends');
    expect(read.calls[0].url).toBe(sessionRulesUrl('http://rt', 'session 1'));
    expect(read.calls[0].url).toContain(
      '/api/v1/apps/sessions/session%201/rules',
    );
    expect(
      (read.calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer tok');

    const add = fakeFetch(200, inForce);
    await addSessionRule(
      'http://rt',
      'tok',
      's',
      { name: 'no sends', decision: 'deny', classes: ['send'] },
      add.fetcher,
    );
    expect(add.calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(add.calls[0].init?.body))).toEqual({
      name: 'no sends',
      decision: 'deny',
      classes: ['send'],
    });

    const remove = fakeFetch(200, { ...inForce, session_rules: [] });
    const after = await removeSessionRule(
      'http://rt',
      'tok',
      's',
      'no sends',
      remove.fetcher,
    );
    expect(remove.calls[0].init?.method).toBe('DELETE');
    expect(remove.calls[0].url).toMatch(/\/rules\/no%20sends$/);
    expect(after.session_rules).toEqual([]);
  });

  it('shows the runtime’s refusal as is', async () => {
    const refused = fakeFetch(422, {
      detail:
        "The session rule is refused, it would permit more than the organization's policy: …",
    });
    await expect(
      addSessionRule(
        'http://rt',
        'tok',
        's',
        { name: 'run freely', decision: 'allow', classes: ['execute'] },
        refused.fetcher,
      ),
    ).rejects.toThrow(/would permit more than the organization's policy/);
    expect(
      SESSION_RULES_WORDS.unavailable('IAM at x could not be reached'),
    ).toContain('Nothing is decided right now');
  });
});
