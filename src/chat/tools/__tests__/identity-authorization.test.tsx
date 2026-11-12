/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A grant a tool waits for (`identity.authorization_required`) drawn as an
 * approval: the agent, the provider and the scopes named, *Connect* opening
 * the URL in a new window, *Decline* telling the runtime.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IdentityAuthorizationPanel,
  declineIdentityAuthorization,
  identityAuthorizationOf,
} from '../IdentityAuthorization';

const URL = 'https://bedrock-agentcore.us-east-1.amazonaws.com/authorize?x=1';

const EVENT_VALUE = {
  id: 'a1b2',
  agent: 'researcher',
  provider: 'github',
  scopes: ['repo', 'read:user'],
  url: URL,
};

afterEach(cleanup);

describe('identityAuthorizationOf', () => {
  it('reads the event the runtime emits', () => {
    expect(identityAuthorizationOf(EVENT_VALUE)).toEqual(EVENT_VALUE);
  });

  it('refuses a value without an id, a provider or an http(s) URL', () => {
    expect(identityAuthorizationOf(null)).toBeNull();
    expect(identityAuthorizationOf({ ...EVENT_VALUE, id: '' })).toBeNull();
    expect(identityAuthorizationOf({ ...EVENT_VALUE, provider: 1 })).toBeNull();
    expect(
      identityAuthorizationOf({ ...EVENT_VALUE, url: 'javascript:alert(1)' }),
    ).toBeNull();
  });
});

describe('IdentityAuthorizationPanel', () => {
  it('names the agent, the provider and the scopes', () => {
    render(
      <IdentityAuthorizationPanel
        authorizations={[EVENT_VALUE]}
        onDecline={() => undefined}
      />,
    );
    expect(screen.getByText('Connect github to continue')).toBeTruthy();
    expect(
      screen.getByText('researcher asks for access to repo, read:user.'),
    ).toBeTruthy();
  });

  it('opens the authorization URL in a new window on Connect', () => {
    const openWindow = vi.fn();
    render(
      <IdentityAuthorizationPanel
        authorizations={[EVENT_VALUE]}
        onDecline={() => undefined}
        openWindow={openWindow}
      />,
    );
    fireEvent.click(screen.getByText('Connect'));
    expect(openWindow).toHaveBeenCalledWith(URL);
  });

  it('opens it with window.open, apart from the page, by default', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <IdentityAuthorizationPanel
        authorizations={[EVENT_VALUE]}
        onDecline={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('Connect'));
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('hands the declined authorization on Decline', () => {
    const onDecline = vi.fn();
    render(
      <IdentityAuthorizationPanel
        authorizations={[EVENT_VALUE]}
        onDecline={onDecline}
      />,
    );
    fireEvent.click(screen.getByText('Decline'));
    expect(onDecline).toHaveBeenCalledWith(EVENT_VALUE);
  });

  it('names the chat agent when the event names none', () => {
    render(
      <IdentityAuthorizationPanel
        authorizations={[{ ...EVENT_VALUE, agent: '' }]}
        agentName="Marketer"
        onDecline={() => undefined}
      />,
    );
    expect(
      screen.getByText('Marketer asks for access to repo, read:user.'),
    ).toBeTruthy();
  });

  it('draws nothing when no grant waits', () => {
    const { container } = render(
      <IdentityAuthorizationPanel
        authorizations={[]}
        onDecline={() => undefined}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('declineIdentityAuthorization', () => {
  it('posts the decline with the bearer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await declineIdentityAuthorization(
      'http://runtime',
      'a1b2',
      'jwt',
      fetcher as unknown as typeof fetch,
    );
    expect(fetcher).toHaveBeenCalledWith(
      'http://runtime/api/v1/configure/identity/authorizations/a1b2/decline',
      { method: 'POST', headers: { Authorization: 'Bearer jwt' } },
    );
  });

  it('says a refused decline in a sentence', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      declineIdentityAuthorization(
        'http://runtime',
        'a1b2',
        undefined,
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toThrow('The decline of a1b2 was refused (404)');
  });
});
