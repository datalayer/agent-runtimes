/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A deployment's page asks its runtime nothing but the application's own
 * routes (PAP_DATALAYER's release gates, decided 14 October 2026).
 *
 * Round 19 (94c9586c) told the chat (`ownRoutesOnly`): Stop is the
 * session's, no monitoring stream, no sandbox socket, no model switch. What
 * was left asked three routes such a runtime answers 404: the agent's status
 * (`GET /runtime/status`) and its deletion (`DELETE /agents/{id}`) in the
 * page's launch code, and the runtime's model catalogue (`GET
 * /configure/models`) in its chat. With the same flag, none is asked; a
 * Preview, on its Maker's runtime, still asks them.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jupyterlab/services', () => ({
  ServerConnection: { makeSettings: (settings: unknown) => settings },
}));
vi.mock('@jupyterlab/services/lib/manager', () => ({
  ServiceManager: class {
    ready = Promise.resolve();
    serverSettings: unknown;
    constructor(options: { serverSettings: unknown }) {
      this.serverSettings = options.serverSettings;
    }
  },
}));
vi.mock('@datalayer/core', () => ({
  useCoreStore: vi.fn(),
  useDatalayer: vi.fn(),
}));
vi.mock('@datalayer/core/lib/state', () => ({ useIAMStore: vi.fn() }));
vi.mock('../../state', () => ({ runtimesStore: { getState: vi.fn() } }));
vi.mock('../../stores/agentRuntimeStore', () => ({
  agentRuntimeStore: { getState: vi.fn() },
  useAgentRuntimeStore: vi.fn(),
  useAgentRuntimeConnection: vi.fn(),
  useAgentRuntimeStatus: vi.fn(),
  useAgentRuntimeError: vi.fn(),
  useAgentRuntimeIsLaunching: vi.fn(),
}));
vi.mock('../../services/sandboxServiceManagers', () => ({
  disposeSandboxServiceManagers: vi.fn(),
}));
vi.mock('../../runtimes/lifecycle', () => ({
  runtimeUrl: vi.fn(),
  runtimesUrl: vi.fn(),
}));

import {
  agentDeletionUrl,
  launchesOwnRoutesOnly,
  runtimeModelsUrl,
  runtimeStatusUrl,
} from '../ownRoutes';
import { createServiceManagerFromAgentSandbox } from '../useAgentRuntimes';

const RUNTIME = 'https://r1.example/agent-runtimes/pool/01rt';

describe('the routes a page asks besides an application’s own', () => {
  it('are none on a deployment’s runtime', () => {
    expect(runtimeStatusUrl(RUNTIME, 'desk', true)).toBeUndefined();
    expect(agentDeletionUrl(RUNTIME, 'desk', true)).toBeUndefined();
    expect(runtimeModelsUrl(RUNTIME, 'desk', true)).toBeUndefined();
  });

  it('are the runtime’s own elsewhere, as before', () => {
    expect(runtimeStatusUrl(`${RUNTIME}/`, 'a b', false)).toBe(
      `${RUNTIME}/api/v1/runtime/status?agent_id=a%20b`,
    );
    expect(agentDeletionUrl(RUNTIME, 'a/b', false)).toBe(
      `${RUNTIME}/api/v1/agents/a%2Fb`,
    );
    expect(runtimeModelsUrl(RUNTIME, 'desk', false)).toBe(
      `${RUNTIME}/api/v1/configure/models?agent_id=desk`,
    );
  });

  it('a launch for a deployment answers only its own; a Preview’s does not', () => {
    const appSpec = { id: 'exchange-desk' };
    expect(
      launchesOwnRoutesOnly({ appSpec, appUid: '01APP', deploymentUid: 'd-1' }),
    ).toBe(true);
    expect(launchesOwnRoutesOnly({ appSpec, appUid: '01APP' })).toBe(false);
    expect(launchesOwnRoutesOnly(undefined)).toBe(false);
  });
});

describe('the sandbox of an agent on its runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const info = {
    baseUrl: 'https://r1.example/jupyter/01rt?token=ingress-token',
    agentId: 'desk',
    agentBaseUrl: RUNTIME,
  };

  it('asks a deployment’s runtime nothing, and binds to the ingress given', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const manager = (await createServiceManagerFromAgentSandbox(
      { ...info, ownRoutesOnly: true },
      'a-token',
    )) as unknown as { serverSettings: { baseUrl: string; token: string } };
    expect(fetched).not.toHaveBeenCalled();
    expect(manager.serverSettings.baseUrl).toBe(
      'https://r1.example/jupyter/01rt',
    );
    expect(manager.serverSettings.token).toBe('ingress-token');
  });

  it('asks the agent’s status elsewhere, with the person’s token', async () => {
    const fetched = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    await createServiceManagerFromAgentSandbox(info, 'a-token');
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched).toHaveBeenCalledWith(
      `${RUNTIME}/api/v1/runtime/status?agent_id=desk`,
      { headers: { Authorization: 'Bearer a-token' } },
    );
  });
});

/*
 * The hook and the chat need a whole workspace to render: read from the
 * source, as the other ChatView pins are.
 */
describe('the page’s launch code and its chat', () => {
  const hook = readFileSync(
    join(__dirname, '..', 'useAgentRuntimes.ts'),
    'utf8',
  );
  const chat = readFileSync(
    join(__dirname, '..', '..', 'apps/plugins/chat/ChatView.tsx'),
    'utf8',
  );

  it('say the flag once, from the launch, and delete no deployment’s agent', () => {
    expect(hook).toContain(
      'const ownRoutesOnly = launchesOwnRoutesOnly(appLaunch);',
    );
    expect(hook).toMatch(
      /const deletion =\s+agentId && agentBaseUrl\s+\? agentDeletionUrl\(agentBaseUrl, agentId, ownRoutesOnly\)\s+: undefined;\s+if \(deletion\) \{/,
    );
    expect(hook).not.toContain('/api/v1/agents/${');
    expect(hook).not.toContain('/api/v1/runtime/status');
  });

  it('reads no model catalogue from a deployment’s runtime', () => {
    expect(chat).toContain(
      'const modelsUrl = runtimeModelsUrl(agentServerUrl, agentId, ownRoutesOnly);',
    );
    expect(chat).toMatch(
      /if \(!modelsUrl\) \{\s+setCatalogModels\(\[\]\);\s+return undefined;\s+\}/,
    );
    expect(chat).not.toContain('/api/v1/configure/models');
  });
});
