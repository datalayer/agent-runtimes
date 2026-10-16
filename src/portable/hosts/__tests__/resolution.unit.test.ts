/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** Which application a host's turn runs (DC-004). */

import { describe, expect, it, vi } from 'vitest';
import {
  resolveApplication,
  usableAllowances,
  type AllowanceView,
} from '../resolution';

const allowance = (
  applicationId: string,
  more: Partial<AllowanceView> = {},
): AllowanceView => ({
  applicationId,
  channelPolicy: 'channels',
  enabled: true,
  name: applicationId,
  ...more,
});

const lookups = (
  more: Partial<Parameters<typeof resolveApplication>[0]> = {},
) => ({
  allowances: [] as AllowanceView[],
  channel: vi.fn(async () => undefined),
  defaultApplication: vi.fn(async () => 'default-app'),
  next: vi.fn(async () => undefined),
  visibility: 'channel' as const,
  ...more,
});

describe('resolveApplication', () => {
  it("keeps the thread's application before any other, reading nothing", async () => {
    const input = lookups({ threadApplication: 'thread-app', explicit: 'x' });
    expect(await resolveApplication(input)).toMatchObject({
      ok: true,
      applicationId: 'thread-app',
    });
    expect(input.next).not.toHaveBeenCalled();
    expect(input.channel).not.toHaveBeenCalled();
  });

  it('then the explicit choice, the next session, the channel, the default', async () => {
    expect(
      (await resolveApplication(lookups({ explicit: 'chosen' }))).ok &&
        'chosen',
    ).toBe('chosen');
    expect(
      await resolveApplication(lookups({ next: async () => 'next-app' })),
    ).toMatchObject({ applicationId: 'next-app' });
    expect(
      await resolveApplication(
        lookups({
          channel: async () => ({ state: 'allow', applicationId: 'chan-app' }),
        }),
      ),
    ).toMatchObject({ applicationId: 'chan-app' });
    expect(await resolveApplication(lookups())).toMatchObject({
      applicationId: 'default-app',
    });
  });

  it("refuses a denied channel, but never reads a channel's rule in a direct conversation", async () => {
    const denied = lookups({
      channel: vi.fn(async () => ({ state: 'deny' as const })),
    });
    expect(await resolveApplication(denied)).toEqual({
      ok: false,
      refusal: 'channel-denied',
    });
    const direct = lookups({
      channel: vi.fn(async () => ({ state: 'deny' as const })),
      visibility: 'direct',
    });
    expect(await resolveApplication(direct)).toMatchObject({ ok: true });
    expect(direct.channel).not.toHaveBeenCalled();
  });

  it('refuses no application, one not allowed, and a direct-only one in a channel', async () => {
    expect(
      await resolveApplication(
        lookups({ defaultApplication: async () => undefined }),
      ),
    ).toEqual({ ok: false, refusal: 'no-application' });
    expect(
      await resolveApplication(
        lookups({ allowances: [allowance('other')], explicit: 'app' }),
      ),
    ).toEqual({ ok: false, refusal: 'not-allowed' });
    expect(
      await resolveApplication(
        lookups({
          allowances: [allowance('app', { enabled: false })],
          explicit: 'app',
        }),
      ),
    ).toEqual({ ok: false, refusal: 'not-allowed' });
    const directOnly = allowance('app', { channelPolicy: 'direct-only' });
    expect(
      await resolveApplication(
        lookups({ allowances: [directOnly], explicit: 'app' }),
      ),
    ).toEqual({ ok: false, refusal: 'direct-only', allowance: directOnly });
    expect(
      await resolveApplication(
        lookups({
          allowances: [directOnly],
          explicit: 'app',
          visibility: 'direct',
        }),
      ),
    ).toEqual({ ok: true, applicationId: 'app', allowance: directOnly });
  });
});

describe('usableAllowances', () => {
  it('offers the enabled ones answering in this kind of conversation', () => {
    const all = [
      allowance('a'),
      allowance('b', { enabled: false }),
      allowance('c', { channelPolicy: 'direct-only' }),
    ];
    expect(
      usableAllowances(all, 'channel').map(one => one.applicationId),
    ).toEqual(['a']);
    expect(
      usableAllowances(all, 'direct').map(one => one.applicationId),
    ).toEqual(['a', 'c']);
  });
});
