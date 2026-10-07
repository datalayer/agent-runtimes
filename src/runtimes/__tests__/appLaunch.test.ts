/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's runtime, launched from the browser, carries its Appspec
 * (STUDIO R-19).
 *
 * The Studio's Preview and the hosted page signed in allocate the runtime an
 * application runs on through the agent hook. The launch sends the Appspec,
 * the saved application and the deployment as `RuntimesClient.create` does in
 * Python, so the Operator hands the Appspec to the runtime's companion and the
 * runtime is given the secrets its connections declare before its agent is
 * made. An application named without its Appspec is refused before anything
 * is asked of the platform, as the Operator would refuse it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDatalayerAPI } from '@datalayer/core/lib/api';

import { createRuntime } from '../actions';
import { appLaunchOf } from '../../loop/plugins/agents/appLaunch';

vi.mock('@datalayer/core/lib/api', () => ({
  requestDatalayerAPI: vi.fn(),
}));

vi.mock('../../state/substates', () => ({
  iamStore: { getState: () => ({ token: 'a-token', externalToken: '' }) },
  runtimesStore: {
    getState: () => ({ runtimesUrl: 'https://r1.example' }),
  },
}));

const APP = {
  id: 'earthdata-explorer',
  name: 'Earthdata explorer',
  connections: [{ id: 'earthdata' }],
};

function sentBody(): Record<string, unknown> {
  const call = vi.mocked(requestDatalayerAPI).mock.calls.at(-1)?.[0] as any;
  return call?.body ?? {};
}

describe('an application’s launch from the browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestDatalayerAPI).mockResolvedValue({
      success: true,
      message: '',
      runtime: { runtime_name: 'runtime-01', ingress: 'https://r1/x' },
    } as any);
  });

  it('sends the Appspec, the application and the deployment', async () => {
    await createRuntime({
      environmentName: 'ai-agents-env',
      creditsLimit: 10,
      appSpec: APP,
      appUid: '01APP',
      deploymentUid: '01DEPLOYMENT',
    });
    const body = sentBody();
    expect(body.app_spec).toEqual(APP);
    expect(body.app_uid).toBe('01APP');
    expect(body.deployment_uid).toBe('01DEPLOYMENT');
  });

  it('sends the Appspec of an application not saved yet, alone', async () => {
    await createRuntime({
      environmentName: 'ai-agents-env',
      creditsLimit: 10,
      appSpec: APP,
    });
    const body = sentBody();
    expect(body.app_spec).toEqual(APP);
    expect(body).not.toHaveProperty('app_uid');
    expect(body).not.toHaveProperty('deployment_uid');
  });

  it('sends nothing of an application for a runtime of none', async () => {
    await createRuntime({ environmentName: 'ai-agents-env', creditsLimit: 10 });
    const body = sentBody();
    expect(body).not.toHaveProperty('app_spec');
    expect(body).not.toHaveProperty('app_uid');
  });

  it('refuses an application launched without its Appspec', async () => {
    await expect(
      createRuntime({
        environmentName: 'ai-agents-env',
        creditsLimit: 10,
        appUid: '01APP',
      }),
    ).rejects.toThrow(/01APP is launched without its Appspec/);
    expect(requestDatalayerAPI).not.toHaveBeenCalled();
  });

  it('refuses a deployment named without its application', async () => {
    await expect(
      createRuntime({
        environmentName: 'ai-agents-env',
        creditsLimit: 10,
        appSpec: APP,
        deploymentUid: '01DEPLOYMENT',
      }),
    ).rejects.toThrow(/named without its application/);
    expect(requestDatalayerAPI).not.toHaveBeenCalled();
  });
});

describe('the launch read from the payload the agent is created with', () => {
  it('is the Appspec and where it runs', () => {
    expect(
      appLaunchOf({
        name: APP.id,
        app_spec: APP,
        app_instance: {
          app_uid: '01APP',
          deployment_uid: '01DEPLOYMENT',
          version: 3,
        },
      }),
    ).toEqual({
      appSpec: APP,
      appUid: '01APP',
      deploymentUid: '01DEPLOYMENT',
    });
  });

  it('leaves out an application or a deployment not named', () => {
    expect(
      appLaunchOf({
        app_spec: APP,
        app_instance: { app_uid: '', deployment_uid: '', version: 0 },
      }),
    ).toEqual({ appSpec: APP });
    expect(appLaunchOf({ app_spec: APP })).toEqual({ appSpec: APP });
  });

  it('is none for a bare agentspec', () => {
    expect(appLaunchOf(undefined)).toBeUndefined();
    expect(appLaunchOf({ name: 'jupyter-tutor' })).toBeUndefined();
  });
});

describe('the hook and the bridge', () => {
  const src = join(__dirname, '..', '..');
  const read = (file: string) => readFileSync(join(src, file), 'utf8');

  it('launches an application’s runtime with it, and never reuses one', () => {
    const hook = read('hooks/useAgentRuntimes.ts');
    expect(hook).toContain('...appLaunch,');
    // A running runtime was not launched for the application.
    const lookup = hook.slice(hook.indexOf('if (appLaunch) {'));
    expect(lookup).toContain('setLookedForExisting(true);');
    expect(lookup.indexOf('return;')).toBeLessThan(
      lookup.indexOf('listRuntimes'),
    );
  });

  it('passes the store’s launch on to the request', () => {
    const store = read('stores/agentRuntimeStore.ts');
    expect(store).toContain('appSpec: runtimeOptions.appSpec');
    expect(store).toContain('appUid: runtimeOptions.appUid');
    expect(store).toContain('deploymentUid: runtimeOptions.deploymentUid');
  });

  it('gives the hook the application of the payload', () => {
    const bridge = read('loop/plugins/agents/DatalayerAgentBridge.tsx');
    expect(bridge).toContain('appLaunchOf(createPayload)');
    expect(bridge).toContain('...(appLaunch ? { appLaunch } : {})');
  });
});
