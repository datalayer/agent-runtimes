/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The PAP examples of K-01 to K-07 (plans/PAP.md K-09), drawn: each view
 * replays its redacted trace, every step reachable with *Next step*, each
 * step's title, summary and channel shown in turn, and the parties named.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePapTrace, type PapTrace } from '../pap/PapTraceView';
import PapAccountTokensView from '../pap/PapAccountTokensView';
import PapConversationControlView from '../pap/PapConversationControlView';
import PapConversationStreamingView from '../pap/PapConversationStreamingView';
import PapMediatedSignInView from '../pap/PapMediatedSignInView';
import PapOperationsView from '../pap/PapOperationsView';
import PapTwoCompaniesView from '../pap/PapTwoCompaniesView';
import PapUserWithACompanyView from '../pap/PapUserWithACompanyView';
import accountTokens from '../pap/traces/account-tokens.json';
import conversationControl from '../pap/traces/conversation-control.json';
import conversationStreaming from '../pap/traces/conversation-streaming.json';
import mediatedSignIn from '../pap/traces/mediated-sign-in.json';
import operations from '../pap/traces/operations.json';
import twoCompanies from '../pap/traces/two-companies.json';
import userWithACompany from '../pap/traces/user-with-a-company.json';

const VIEWS: Array<[string, React.FC, unknown]> = [
  ['K-01 Account Tokens', PapAccountTokensView, accountTokens],
  ['K-02 Mediated Sign-In', PapMediatedSignInView, mediatedSignIn],
  [
    'K-03 Conversation streaming',
    PapConversationStreamingView,
    conversationStreaming,
  ],
  [
    'K-03 Conversation control',
    PapConversationControlView,
    conversationControl,
  ],
  ['K-04 Operations', PapOperationsView, operations],
  ['K-06 A user with a company', PapUserWithACompanyView, userWithACompany],
  ['K-07 Two companies', PapTwoCompaniesView, twoCompanies],
];

afterEach(() => cleanup());

describe('the PAP trace examples', () => {
  it('refuses a trace that does not name the SDK release that recorded it', () => {
    const { sdk: _sdk, ...unnamed } = operations as Record<string, unknown>;
    expect(() => parsePapTrace(unnamed)).toThrow('Not a PAP trace');
    expect(() =>
      parsePapTrace({ ...operations, sdk: 'personal-agent-protocol main' }),
    ).toThrow('Not a PAP trace');
  });

  it.each(VIEWS)('%s replays every step of its trace', (_, View, raw) => {
    const trace: PapTrace = parsePapTrace(raw);
    expect(trace.steps.length).toBeGreaterThan(0);

    const view = render(<View />);
    const page = view.container;
    expect(page.textContent).toContain(trace.title);
    // Said as recorded, with the released SDK that recorded it (E-14, AGENT_PROTOCOLS PR-05).
    expect(page.textContent).toContain(
      `Recorded data, not live: replayed from a trace the PAP Python SDK's demo world generated with ${trace.sdk}`,
    );
    for (const party of trace.parties) {
      expect(page.textContent).toContain(party.name);
    }

    trace.steps.forEach((step, index) => {
      expect(page.textContent).toContain(
        `Step ${index + 1} of ${trace.steps.length}`,
      );
      expect(page.querySelector('h2')?.textContent).toBe(step.title);
      expect(page.textContent).toContain(step.summary);
      // The arrow beside the steps, and the button under them.
      const next = view.getAllByRole('button', { name: 'Next step' }).at(-1)!;
      if (index < trace.steps.length - 1) {
        act(() => {
          fireEvent.click(next);
        });
      } else {
        expect((next as HTMLButtonElement).disabled).toBe(true);
      }
    });
  });
});
