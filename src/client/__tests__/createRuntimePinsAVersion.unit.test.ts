/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a launch sends when it names a version (PLAN_ENV.md, E1-19).
 *
 * `createRuntime` takes an environment and, optionally, the version of it to
 * launch, and sends `environment: {name, version}` — so a sandbox runs the
 * version it was asked for rather than whatever is promoted by the time the
 * request lands (§7.6, E1-11). Without a version the body is the one runtimes
 * have always been created with.
 *
 * What a second costs is read from the listing, never written here: an
 * environment whose size class carries no rate is refused before anything is
 * asked of the platform (D-4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { AgentRuntimesClient } from '../AgentRuntimesClient';
import { MOCK_JWT_TOKEN } from '../../__tests__/shared/test-constants';

vi.mock('@datalayer/core/lib/api/DatalayerApi', () => ({
  requestDatalayerAPI: vi.fn(),
}));

const RUNTIME = {
  success: true,
  runtime: {
    uid: '01RUNTIME',
    given_name: 'geo',
    runtime_name: 'runtime-01RUNTIME',
    environment_name: 'ada/geo',
    burning_rate: 0.0008,
  },
};

function aClient(environment: Record<string, unknown>): any {
  const client: any = new AgentRuntimesClient({
    token: MOCK_JWT_TOKEN,
    runtimesUrl: 'https://r1.example',
  } as any);
  // The listing, as `listEnvironments` would have left it: seeded so the test
  // asserts the launch and not the listing.
  client.environments = [environment];
  return client;
}

function sentBody(): any {
  const call = vi.mocked(requestDatalayerAPI).mock.calls.at(-1)?.[0] as any;
  return call?.body ?? {};
}

describe('a launch that names a version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestDatalayerAPI).mockResolvedValue(RUNTIME as any);
  });

  it('sends the environment and the version it was asked for', async () => {
    const client = aClient({
      name: 'ada/geo',
      sizeClass: 'small',
      burningRate: 0.0008,
    });
    await client.createRuntime({
      environmentName: 'ada/geo',
      environmentVersion: 2,
      minutesLimit: 10,
    });
    expect(sentBody().environment).toEqual({ name: 'ada/geo', version: 2 });
  });

  it('sends the body runtimes have always used when no version is named', async () => {
    const client = aClient({
      name: 'python-cpu-env',
      burningRate: 0.008,
    });
    await client.createRuntime({
      environmentName: 'python-cpu-env',
      minutesLimit: 10,
    });
    expect(sentBody().environment).toEqual({ name: 'python-cpu-env' });
  });

  it('prices the launch from the listing', async () => {
    const client = aClient({
      name: 'ada/geo',
      sizeClass: 'small',
      burningRate: 0.0008,
    });
    /*
     * A window of six hours at the small class: 0.0008 credits a second is
     * 0.048 a minute, so 360 minutes is 17.28 credits — and the limit is whole
     * credits, rounded up, as `calculateCreditsFromMinutes` has always left it.
     */
    await client.createRuntime({
      environmentName: 'ada/geo',
      environmentVersion: '01VERSION',
      minutesLimit: 360,
    });
    const body = sentBody();
    expect(body.environment).toEqual({ name: 'ada/geo', version: '01VERSION' });
    expect(body.credits_limit).toBe(Math.ceil(0.0008 * 60 * 360));
    expect(body.credits_limit).toBe(18);
  });

  it('reserves at least one credit for a short cheap window', async () => {
    const client = aClient({
      name: 'ada/geo',
      sizeClass: 'small',
      burningRate: 0.0008,
    });
    // Ten minutes of the cheapest class is 0.48 credits; the launch still
    // reserves a whole one, so a sandbox is never started against nothing.
    await client.createRuntime({
      environmentName: 'ada/geo',
      environmentVersion: 2,
      minutesLimit: 10,
    });
    expect(sentBody().credits_limit).toBe(1);
  });

  it('refuses an environment whose size class carries no rate', async () => {
    const client = aClient({
      name: 'ada/geo',
      sizeClass: 'large',
      burningRate: 0,
    });
    await expect(
      client.createRuntime({ environmentName: 'ada/geo', minutesLimit: 10 }),
    ).rejects.toThrow(/no burning rate/);
    expect(requestDatalayerAPI).not.toHaveBeenCalled();
  });
});
