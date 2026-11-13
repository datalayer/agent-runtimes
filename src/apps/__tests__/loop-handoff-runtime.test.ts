/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A session handed over by `/browser` runs where the terminal started it.
 *
 * On Datalayer the page is served through the terminal's relay, which looks
 * like a local server and carries no WebSocket: started on Local, the page
 * waited on "Starting Notebook…" for a sandbox status that never came. The
 * handoff now says where, the page takes that place, the switch holds the
 * others, and the notebook opens on the runtime's Jupyter.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';

import { AgentsPlugin } from '../plugins/agents';
import {
  agentsConfigOf,
  sessionRuntimeOf,
} from '../plugins/agents/handoffRuntime';
import {
  SANDBOX_TARGETS,
  heldTargetReason,
  type SwitchableSandboxService,
} from '../plugins/agents/switchable';

const RELAY = 'http://127.0.0.1:43123';
const RUNTIME = {
  where: 'datalayer',
  name: 'abc',
  jupyter_url: 'https://r1.example/jupyter/server/pool/abc',
  jupyter_token: 'runtime-token',
};

function sandboxOf(
  config: ReturnType<typeof agentsConfigOf>,
): SwitchableSandboxService {
  const reactor = buildReactorFromPlugins([
    configurePlugin(AgentsPlugin, config),
  ]);
  reactor.start();
  return reactor.getOutput<{ sandbox: SwitchableSandboxService }>(
    AgentsPlugin.name,
  )!.sandbox;
}

describe('the handoff’s runtime', () => {
  it('is read from the exchange, and refused when it says nothing', () => {
    expect(sessionRuntimeOf({ where: 'local' })).toEqual({ where: 'local' });
    expect(sessionRuntimeOf(RUNTIME)).toEqual({
      where: 'datalayer',
      name: 'abc',
      jupyterUrl: RUNTIME.jupyter_url,
      jupyterToken: 'runtime-token',
    });
    expect(() => sessionRuntimeOf(undefined)).toThrow(
      /does not say where its agent runs/,
    );
    expect(() => sessionRuntimeOf({ where: 'datalayer' })).toThrow(
      /does not say where its agent runs/,
    );
  });
});

describe('a session on Datalayer', () => {
  const config = agentsConfigOf(RELAY, sessionRuntimeOf(RUNTIME));

  it('reaches its agent and the runtime’s Jupyter through what was handed over', () => {
    expect(config).toMatchObject({
      serverUrl: RELAY,
      target: 'datalayer',
      targetFixed: true,
      datalayerKept: {
        url: RELAY,
        name: 'abc',
        jupyter: { url: RUNTIME.jupyter_url, token: 'runtime-token' },
      },
    });
  });

  it('starts on Datalayer, holds the others with the reason, and refuses them', async () => {
    const sandbox = sandboxOf(config);
    expect(sandbox.target.peek()).toBe('datalayer');
    expect(sandbox.fixedTarget).toBe('datalayer');
    for (const target of SANDBOX_TARGETS.filter(t => t !== 'datalayer')) {
      expect(heldTargetReason(target, RELAY, sandbox.fixedTarget)).toBe(
        'This session runs on Datalayer: it cannot be moved from here.',
      );
    }
    expect(
      heldTargetReason('datalayer', RELAY, sandbox.fixedTarget),
    ).toBeUndefined();
    await expect(sandbox.setTarget('local')).rejects.toThrow(
      /^This session runs on Datalayer/,
    );
    expect(sandbox.target.peek()).toBe('datalayer');
  });

  it('opens the notebook once the runtime’s Jupyter is reported', () => {
    const sandbox = sandboxOf(config);
    // What the bridge reports for an agent already on its runtime with a
    // Jupyter given (`DatalayerAgentBridge`).
    sandbox.report({
      variant: 'datalayer',
      sandbox_running: true,
      jupyter_url: RUNTIME.jupyter_url,
      jupyter_token: 'runtime-token',
      agent_base_url: RELAY,
    });
    expect(sandbox.snapshot.peek()).toMatchObject({
      state: 'running',
      jupyterUrl: RUNTIME.jupyter_url,
      jupyterToken: 'runtime-token',
      agentBaseUrl: RELAY,
    });
    const bridge = readFileSync(
      join(__dirname, '..', 'plugins', 'agents', 'DatalayerAgentBridge.tsx'),
      'utf8',
    );
    expect(bridge).toContain('kept?.jupyter');
    expect(bridge).toContain('sandbox_running: Boolean(jupyter)');
  });
});

describe('a local session', () => {
  it('starts on Local and holds the others', async () => {
    const sandbox = sandboxOf(agentsConfigOf(RELAY, { where: 'local' }));
    expect(sandbox.target.peek()).toBe('local');
    expect(sandbox.fixedTarget).toBe('local');
    expect(heldTargetReason('datalayer', RELAY, sandbox.fixedTarget)).toBe(
      'This session runs on Local: it cannot be moved from here.',
    );
    await expect(sandbox.setTarget('browser')).rejects.toThrow(
      /^This session runs on Local/,
    );
  });

  it('is movable when the page was opened without a handoff', () => {
    const sandbox = sandboxOf(agentsConfigOf(RELAY, undefined));
    expect(sandbox.target.peek()).toBe('local');
    expect(sandbox.fixedTarget).toBeUndefined();
  });
});
