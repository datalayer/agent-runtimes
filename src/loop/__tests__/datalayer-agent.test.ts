/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Datalayer target runs a real agent, from a spec.
 *
 * It used to be a *sandbox* setting: choosing Datalayer told the host's own
 * agent-runtimes server to put its sandbox on a Datalayer runtime. That gave a
 * Jupyter server in the cloud and an agent still running locally — a person
 * picked Datalayer and stayed on whatever agent the host had, which is not
 * what the target says it is.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TARGET_SPECS } from '../plugins/agents/switchable';

const AGENTS = join(__dirname, '..', 'plugins', 'agents');

function read(file: string): string {
  return readFileSync(join(AGENTS, file), 'utf8');
}

describe('the Datalayer target', () => {
  it('no longer configures the host’s sandbox', () => {
    // The `configure` payload is what made it a sandbox setting.
    expect(TARGET_SPECS.datalayer.configure).toBeUndefined();
    // The server-backed targets still do; this is not a blanket removal.
    expect(TARGET_SPECS.local.configure?.variant).toBe('jupyter-server');
    expect(TARGET_SPECS.jupyter.configure?.variant).toBe('jupyter-server');
  });

  it('still counts as having an agent', () => {
    expect(TARGET_SPECS.datalayer.hasAgent).toBe(true);
  });

  it('launches one through the agent hook, from an agentspec', () => {
    const bridge = read('DatalayerAgentBridge.tsx');
    expect(bridge).toContain('useAgentRuntimes(');
    expect(bridge).toContain('agentSpecId');
    // The cloud variant: this target is a Datalayer runtime, not a local one.
    expect(bridge).toContain("variant: 'cloud-pydanticai'");
  });

  it('defaults to the tutor', () => {
    // The front door of the notebook team, and the agent a person landing on
    // a Datalayer runtime should meet first.
    expect(read('DatalayerAgentBridge.tsx')).toContain("'jupyter-tutor'");
  });

  it('does not allocate a runtime for a target nobody picked', () => {
    // A runtime allocated by accident is one somebody pays for.
    const bridge = read('DatalayerAgentBridge.tsx');
    expect(bridge).toContain('autoStart: onDatalayer');
    expect(bridge).toContain('autoCreateAgent: onDatalayer');
  });

  it('reports the runtime it gets back, for the surfaces to read', () => {
    // Every surface already reads the sandbox snapshot; reporting into it is
    // what makes the notebook bind to the runtime's Jupyter server.
    const bridge = read('DatalayerAgentBridge.tsx');
    expect(bridge).toContain('service.report(');
    expect(bridge).toContain('jupyter_url: runtime.jupyterBaseUrl');
    expect(bridge).toContain('agent_base_url: runtime.agentBaseUrl');
  });

  it('is loaded lazily, so its runtime stack is not everyone’s', () => {
    // The agent hook reaches JupyterLab, Lumino and the web components. In the
    // plugin's static imports that lands in every host that merely mounts it.
    expect(read('DatalayerAgentMount.tsx')).toContain('lazy(');
    expect(read('plugin.ts')).not.toContain("from './DatalayerAgentBridge'");
  });
});

describe('addressing the agent', () => {
  it('uses the runtime’s own server when it brought one', () => {
    /*
     * A Datalayer runtime creates the agent on the pod. Addressing the server
     * the workspace was opened against would be talking to a machine that has
     * never heard of it.
     */
    const chat = readFileSync(
      join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
      'utf8',
    );
    expect(chat).toContain(
      'workspace.sandbox.agentBaseUrl || workspace.serverUrl',
    );
    expect(chat).toContain('${agentServerUrl}/api/v1/ag-ui/');
    // And nothing still reaches for the host's URL directly.
    expect(chat).not.toContain('${workspace.serverUrl}/api/v1/');
  });
});
