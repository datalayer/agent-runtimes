/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Local* — a local agent with the Jupyter server it starts beside itself —
 * is held on the web for now (decided 2026-10-10): shown in the switch, said
 * why, not taken; and since it is the default target, a web page starts in
 * itself. Inside JupyterLab it is offered as before.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';
import { AgentsPlugin } from '../plugins/agents';
import {
  SANDBOX_TARGETS,
  heldTargetReason,
  type SandboxTarget,
} from '../plugins/agents/switchable';

const host = vi.hoisted(() => ({ inside: false }));
vi.mock('../plugins/agents/host', () => ({
  insideJupyterLab: () => host.inside,
}));

afterEach(() => {
  host.inside = false;
});

type Sandbox = {
  target: { peek: () => SandboxTarget };
  setTarget: (target: SandboxTarget) => Promise<void>;
};

/** The sandbox an agents plugin starts with, as a host configures it. */
function sandboxOf(config: Record<string, unknown> = {}): Sandbox {
  const reactor = buildReactorFromPlugins([
    configurePlugin(AgentsPlugin, { serverUrl: '', ...config }),
  ]);
  reactor.start();
  return reactor.getOutput<{ sandbox: Sandbox }>(AgentsPlugin.name)!.sandbox;
}

describe('Local, on the web', () => {
  it('is held, and says why; the other targets are offered', () => {
    expect(heldTargetReason('local')).toMatch(
      /^Not offered on the web for now/,
    );
    for (const target of SANDBOX_TARGETS.filter(each => each !== 'local')) {
      expect([target, heldTargetReason(target)]).toEqual([target, undefined]);
    }
  });

  it('is not where a page starts, though it is the default target', () => {
    // The plugin's own default is Local, and the switch is shown by default.
    expect(sandboxOf().target.peek()).toBe('browser');
    // A host that fixed Local is started in the page too: it is not here.
    expect(
      sandboxOf({ target: 'local', targetFixed: true }).target.peek(),
    ).toBe('browser');
    // A target the web offers is started where it was asked.
    expect(sandboxOf({ target: 'datalayer' }).target.peek()).toBe('datalayer');
  });

  it('is refused whoever asks, and the sandbox stays where it was', async () => {
    const sandbox = sandboxOf();
    await expect(sandbox.setTarget('local')).rejects.toThrow(
      /^Not offered on the web for now/,
    );
    expect(sandbox.target.peek()).toBe('browser');
  });

  it('stays in the switch, drawn held with its reason, and takes no click', () => {
    const selector = readFileSync(
      join(__dirname, '..', 'plugins', 'agents', 'SandboxSelector.tsx'),
      'utf8',
    );
    expect(selector).toContain('const held = heldTargetReason(entry);');
    // `aria-disabled`, not `disabled`: a disabled button takes no pointer,
    // and its reason would never be read.
    expect(selector).toContain('aria-disabled={held ? true : undefined}');
    expect(selector).toContain('title={held ?? TARGET_SPECS[entry].hint}');
    expect(selector).toContain(
      'onClick={() => (held ? undefined : void choose(entry))}',
    );
    // Every target is still drawn.
    expect(selector).toContain('{SANDBOX_TARGETS.map((entry, position) => {');
  });
});

describe('Local, inside JupyterLab', () => {
  it('is offered as before, and is where the plugin starts', () => {
    host.inside = true;
    expect(heldTargetReason('local')).toBeUndefined();
    expect(sandboxOf().target.peek()).toBe('local');
  });
});
