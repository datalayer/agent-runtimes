/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Sign in at a company* drawn in the chat (PI-56) for the
 * sign-ins the card did not draw before: Mediated — Datalayer's own page,
 * where the person types what the company asks — and a business's Device
 * Sign-In over PACT.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PapSignInCard } from '../plugins/pap-sign-in/PapSignInCard';
import {
  PAP_SIGN_IN_CHANNEL,
  PAP_SIGN_IN_WORDS,
} from '../plugins/pap-sign-in/signIn';
import type { ToolCallRenderContext } from '../../types/chat';

afterEach(() => {
  cleanup();
});

const contextOf = (toolName: string, result: unknown): ToolCallRenderContext =>
  ({
    toolCallId: 'call-1',
    toolName,
    name: toolName,
    args: {},
    status: 'complete',
    result,
  }) as ToolCallRenderContext;

describe('the sign-in card', () => {
  it('draws a mediated sign-in as Datalayer’s page, with where a code was sent, and no code here', () => {
    const view = render(
      <PapSignInCard
        context={contextOf('pap_manzanita_example_pap_sign_in', {
          status: 'waiting_for_the_person',
          mode: 'mediated',
          open: 'https://datalayer.app/pap/sign-in?ticket=t_1',
          sent_to: 'j***@example.com',
        })}
        send={() => true}
      />,
    );
    expect(view.getByRole('heading').textContent).toBe(
      PAP_SIGN_IN_WORDS.mediatedTitle('datalayer.app'),
    );
    expect(view.getByText(PAP_SIGN_IN_WORDS.mediated)).toBeTruthy();
    expect(
      view.getByText(PAP_SIGN_IN_WORDS.sentTo('j***@example.com')),
    ).toBeTruthy();
    const open = view.getByRole('link');
    expect(open.getAttribute('href')).toBe(
      'https://datalayer.app/pap/sign-in?ticket=t_1',
    );
    expect(open.getAttribute('target')).toBe('_blank');
    expect(view.queryByText(PAP_SIGN_IN_WORDS.code)).toBeNull();
    expect(view.container.querySelector('svg[title]')).toBeNull();
  });

  it('names the company of a bound direct sign-in, and goes on by itself once the person is back (P-04)', async () => {
    const sent: string[] = [];
    const view = render(
      <PapSignInCard
        context={contextOf('pap_manzanita_example_pap_sign_in', {
          status: 'waiting_for_the_person',
          mode: 'direct',
          open: 'https://prod1.datalayer.run/api/iam/v1/pap/start?ticket=t_1',
          company: 'manzanita.example',
        })}
        send={message => {
          sent.push(message);
          return true;
        }}
      />,
    );
    // Where the person signs in is the company, though the link is Datalayer's.
    expect(view.getByRole('heading').textContent).toBe(
      PAP_SIGN_IN_WORDS.title('manzanita.example'),
    );
    expect(view.getByRole('link').getAttribute('href')).toBe(
      'https://prod1.datalayer.run/api/iam/v1/pap/start?ticket=t_1',
    );
    // Another company's return is not this card's.
    const page = new BroadcastChannel(PAP_SIGN_IN_CHANNEL);
    await act(async () => {
      page.postMessage({ company: 'northwind.example', outcome: 'signed_in' });
      page.postMessage({ company: 'manzanita.example', outcome: 'signed_in' });
    });
    await waitFor(() =>
      expect(sent).toEqual([
        PAP_SIGN_IN_WORDS.checkMessage('manzanita.example'),
      ]),
    );
    expect(
      view.getByText(PAP_SIGN_IN_WORDS.returned.signed_in('manzanita.example')),
    ).toBeTruthy();
    page.close();
  });

  it('hears one return: a card told of a denial leaves the next sign-in’s return to its own card', async () => {
    const sent: string[] = [];
    const card = (ticket: string) => (
      <PapSignInCard
        context={contextOf('pap_manzanita_example_pap_sign_in', {
          status: 'waiting_for_the_person',
          mode: 'direct',
          open: `https://prod1.datalayer.run/api/iam/v1/pap/start?ticket=${ticket}`,
          company: 'manzanita.example',
        })}
        send={message => {
          sent.push(message);
          return true;
        }}
      />
    );
    const first = render(card('t_1'));
    const page = new BroadcastChannel(PAP_SIGN_IN_CHANNEL);
    await act(async () => {
      page.postMessage({ company: 'manzanita.example', outcome: 'denied' });
    });
    await waitFor(() =>
      expect(
        within(first.container).getByText(
          PAP_SIGN_IN_WORDS.returned.denied('manzanita.example'),
        ),
      ).toBeTruthy(),
    );
    // The person asks again: a second card, then they sign in.
    const second = render(card('t_2'));
    await act(async () => {
      page.postMessage({ company: 'manzanita.example', outcome: 'signed_in' });
    });
    await waitFor(() =>
      expect(sent).toEqual([
        PAP_SIGN_IN_WORDS.checkMessage('manzanita.example'),
      ]),
    );
    expect(
      within(second.container).getByText(
        PAP_SIGN_IN_WORDS.returned.signed_in('manzanita.example'),
      ),
    ).toBeTruthy();
    expect(
      within(first.container).queryByText(
        PAP_SIGN_IN_WORDS.returned.signed_in('manzanita.example'),
      ),
    ).toBeNull();
    page.close();
  });

  it('draws a business’s sign-in over PACT as a device sign-in at the business', () => {
    const view = render(
      <PapSignInCard
        context={contextOf('pact_air_example_pact_sign_in', {
          status: 'waiting_for_the_person',
          mode: 'device',
          open: 'https://air.example/login?return_to=consent&user_code=AB12-CD34',
          code: 'AB12-CD34',
          expires_at: '2026-10-13T12:10:00+00:00',
        })}
      />,
    );
    expect(view.getByRole('heading').textContent).toBe(
      PAP_SIGN_IN_WORDS.title('air.example'),
    );
    expect(view.getByText('AB12-CD34')).toBeTruthy();
    expect(view.getByText(PAP_SIGN_IN_WORDS.tellMe)).toBeTruthy();
  });
});
