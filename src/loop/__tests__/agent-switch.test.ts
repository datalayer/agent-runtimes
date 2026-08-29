/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Assigning a different agent has to reach the workspace.
 *
 * The picker used to keep the new name in its own state. That changed the
 * label in the header and nothing else: the chat kept talking to the old
 * agent's endpoint, the sandbox stayed connected as the old agent, and the
 * notebook kept the old id — a switch that looked like it happened and had
 * not, which is worse than one that visibly fails.
 *
 * So the id lives in the workspace, and everything that follows an agent reads
 * it from there.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loopSurfaceId } from '../core';

const LOOP = join(__dirname, '..');

function read(...parts: string[]): string {
  return readFileSync(join(LOOP, ...parts), 'utf8');
}

describe('the workspace owns which agent it talks to', () => {
  it('offers a way to change it', () => {
    expect(read('core', 'index.ts')).toContain('setAgentId:');
  });

  it('holds it as state rather than passing the prop through', () => {
    // A prop straight through cannot be changed from inside, which is why the
    // picker had nowhere to put the new value.
    const shell = read('shell', 'LoopWorkspace.tsx');
    expect(shell).toContain('const [agentId, setAgentId] = useState(');
    expect(shell).toContain('setAgentId,');
  });

  it('still follows the host when it re-mounts on another agent', () => {
    // The host's prop is the session it means to open; a stale in-page choice
    // must not outlive it.
    expect(read('shell', 'LoopWorkspace.tsx')).toContain(
      'setAgentId(initialAgentId)',
    );
  });
});

describe('the picker', () => {
  const picker = read('plugins', 'agentspecs', 'AgentspecPicker.tsx');

  it('tells the workspace, not only itself', () => {
    expect(picker).toContain('workspace.setAgentId(agentId)');
  });

  it('does so only once the server has accepted the switch', () => {
    // Announcing a switch the server refused would leave the workspace
    // pointing at an agent that is not there.
    const guarded = picker.slice(picker.indexOf('if (response.ok)'));
    expect(guarded.indexOf('workspace.setAgentId(agentId)')).toBeGreaterThan(0);
  });
});

describe('what follows the agent', () => {
  it('is not the surface: the notebook stays put across a switch', () => {
    /*
     * The surface is named from the session, so the id the notebook renders
     * under is the same before and after. It used to be named from the agent,
     * which made every switch a remount: you changed who you were talking to
     * and lost the work you were talking about.
     */
    const shell = read('shell', 'LoopWorkspace.tsx');
    expect(shell).toContain('const surfaceIdRef = useRef(');
    expect(shell).not.toContain('loopSurfaceId(agentId)');
  });

  it('connects the sandbox as the workspace’s agent', () => {
    expect(read('plugins', 'agents', 'SandboxStatusBridge.tsx')).toContain(
      'service?.connect(agentId)',
    );
  });
});

describe('the Datalayer bridge', () => {
  it('calls the sandbox running when its ingress is, not when the agent is', () => {
    /*
     * `runtime.isReady` is about the agent being registered. A Datalayer
     * runtime serves kernels well before that, so reporting the agent's
     * readiness as the sandbox's left the workspace with a live server URL,
     * no notebook, no chat, and a kernel indicator saying `connected-dead`.
     */
    const bridge = read('plugins', 'agents', 'DatalayerAgentBridge.tsx');
    expect(bridge).toContain('sandbox_running: Boolean(runtime.serviceManager)');
    expect(bridge).not.toContain('sandbox_running: Boolean(runtime.isReady)');
  });
});
