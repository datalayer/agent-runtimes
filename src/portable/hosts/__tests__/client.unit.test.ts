/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * The host client's administration call (DC-106): the
 * contract's request with the host key, and Datalayer's refusal of anyone
 * but the linked owner said as a `HostRefusedError`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DatalayerHostClient, HostRefusedError } from '../client';

const contracts = JSON.parse(
  readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8'),
) as {
  admin: {
    request: { external_user_id: string; paused: boolean };
    channel_request: {
      external_user_id: string;
      channel: { id: string; state: 'allow' | 'deny' };
    };
    refusals: Record<string, number>;
  };
  headers: Record<string, string>;
  routes: Record<string, string>;
};

const API = 'https://r1.datalayer.run';

describe('DatalayerHostClient.admin', () => {
  it("sends the contract's requests with the host key, and reads the pause back", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new DatalayerHostClient(API, (async (
      url: string | URL,
      init?: RequestInit,
    ) => {
      calls.push({ init, url: String(url) });
      return Response.json({
        success: true,
        host: { paused: Boolean(JSON.parse(String(init?.body)).paused) },
      });
    }) as typeof fetch);
    const { external_user_id: user, paused } = contracts.admin.request;
    expect(await client.admin('dlhk_key', user, { paused })).toEqual({
      paused: true,
    });
    const { channel } = contracts.admin.channel_request;
    expect(await client.admin('dlhk_key', user, { channel })).toEqual({
      paused: false,
    });
    expect(`${calls[0]?.init?.method} ${new URL(calls[0]!.url).pathname}`).toBe(
      contracts.routes.admin,
    );
    expect(
      (calls[0]?.init?.headers as Record<string, string>)[
        contracts.headers.host_key!
      ],
    ).toBe('dlhk_key');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
      contracts.admin.request,
    );
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(
      contracts.admin.channel_request,
    );
  });

  it('says a refusal for anyone but the linked owner', async () => {
    const client = new DatalayerHostClient(API, (async () =>
      Response.json(
        {
          detail:
            'Only the owner of this connection, linked to it, changes it from the host.',
        },
        { status: contracts.admin.refusals.not_the_owner },
      )) as typeof fetch);
    const refused = await client
      .admin('dlhk_key', '1', { paused: true })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HostRefusedError);
    expect((refused as HostRefusedError).status).toBe(403);
  });
});

describe('DatalayerHostClient.self', () => {
  it('reads the installation, its uid included, with the host key', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new DatalayerHostClient(API, (async (
      url: string | URL,
      init?: RequestInit,
    ) => {
      calls.push({ init, url: String(url) });
      return Response.json({
        success: true,
        host: {
          uid: 'bd7e7160',
          account_uid: 'owner',
          default_deployment: 'dep-1',
          deployments: [{ uid: 'dep-1', app_name: 'Chat', kept: true }],
          channels: [],
          direct_only: [],
          paused: false,
        },
      });
    }) as typeof fetch);
    expect(await client.self('dlhk_key')).toEqual({
      accountUid: 'owner',
      channels: [],
      defaultDeployment: 'dep-1',
      deployments: [{ appName: 'Chat', kept: true, uid: 'dep-1' }],
      directOnly: [],
      paused: false,
      uid: 'bd7e7160',
    });
    expect(new URL(calls[0]!.url).pathname).toBe(
      '/api/ai-agents/v1/apps/hosts/self',
    );
    expect(
      (calls[0]?.init?.headers as Record<string, string>)[
        contracts.headers.host_key!
      ],
    ).toBe('dlhk_key');
  });

  it('refuses an answer without the installation uid', async () => {
    const client = new DatalayerHostClient(API, (async () =>
      Response.json({
        success: true,
        host: { deployments: [] },
      })) as typeof fetch);
    await expect(client.self('dlhk_key')).rejects.toThrow();
  });
});
