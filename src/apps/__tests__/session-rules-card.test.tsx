/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Rules card's *This session* section drawn (SHIELD SH-54): the rules in
 * force read from the runtime, a file-and-shell rule added in one click, a
 * rule removed, and a loosening the runtime refuses said in its sentence.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionRules } from '../plugins/app-rules/AppRulesCard';
import {
  FILE_AND_SHELL_RULES,
  SESSION_RULES_WORDS,
  sessionRuleInWords,
} from '../apps/sessionRules';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const inForce = (rules: unknown[]) => ({
  uid: 'session-0001',
  harness: null,
  policies: [{ scope: 'session', rules: [] }],
  session_rules: rules,
  unavailable: null,
});

const noSends = { name: 'no sends', decision: 'deny', classes: ['send'] };

/** A runtime answering each call in turn, every call kept. */
function runtime(answers: Array<[number, unknown]>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const [status, body] = answers.shift() ?? [500, {}];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const draw = () =>
  render(
    <SessionRules
      agentServerUrl="http://runtime.test"
      sessionUid="session-0001"
      token="t"
    />,
  );

describe('the Rules card, this session', () => {
  it('reads the rules in force and says a session with none', async () => {
    const calls = runtime([[200, inForce([])]]);
    const view = draw();
    await waitFor(() => view.getByText(SESSION_RULES_WORDS.none));
    expect(view.getByText(SESSION_RULES_WORDS.title)).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('session-0001');
    expect(view.getByText(SESSION_RULES_WORDS.goneWithSession)).toBeTruthy();
  });

  it('adds a file-and-shell rule in one click and draws what the runtime answers', async () => {
    const rule = FILE_AND_SHELL_RULES[0];
    const calls = runtime([
      [200, inForce([])],
      [200, inForce([rule])],
    ]);
    const view = draw();
    await waitFor(() => view.getByText(SESSION_RULES_WORDS.none));
    fireEvent.click(view.getByRole('button', { name: rule.name }));
    await waitFor(() => view.getByText(sessionRuleInWords(rule)));
    expect(calls[1].method).toBe('POST');
    expect(calls[1].body).toMatchObject({ name: rule.name });
    expect(view.queryByText(SESSION_RULES_WORDS.none)).toBeNull();
  });

  it('removes a rule the person added', async () => {
    const calls = runtime([
      [200, inForce([noSends])],
      [200, inForce([])],
    ]);
    const view = draw();
    await waitFor(() => view.getByText('no sends'));
    fireEvent.click(
      view.getByRole('button', { name: SESSION_RULES_WORDS.remove }),
    );
    await waitFor(() => view.getByText(SESSION_RULES_WORDS.none));
    expect(calls[1].method).toBe('DELETE');
  });

  it('says the runtime’s sentence when a rule would loosen the organization’s', async () => {
    const sentence =
      'This rule would permit more than your organization’s documents allow';
    runtime([
      [200, inForce([])],
      [400, { detail: sentence }],
    ]);
    const view = draw();
    await waitFor(() => view.getByText(SESSION_RULES_WORDS.none));
    fireEvent.click(
      view.getByRole('button', { name: FILE_AND_SHELL_RULES[0].name }),
    );
    await waitFor(() => view.getByRole('alert'));
    expect(view.getByRole('alert').textContent).toBe(sentence);
  });

  it('says why nothing is decided when the runtime cannot read its policies', async () => {
    runtime([[200, { ...inForce([]), unavailable: 'IAM did not answer' }]]);
    const view = draw();
    await waitFor(() => view.getByRole('alert'));
    expect(view.getByRole('alert').textContent).toBe(
      SESSION_RULES_WORDS.unavailable('IAM did not answer'),
    );
  });
});
