/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Sign in at a company* drawn in the chat (AGENT_PROTOCOLS PI-56) for the
 * sign-ins the card did not draw before: Mediated — Datalayer's own page,
 * where the person types what the company asks — and a business's Device
 * Sign-In over PACT.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PapSignInCard } from '../plugins/pap-sign-in/PapSignInCard';
import { PAP_SIGN_IN_WORDS } from '../plugins/pap-sign-in/signIn';
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
