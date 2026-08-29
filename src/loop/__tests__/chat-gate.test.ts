/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sandbox tells the chat whether there is anything to talk to.
 *
 * The one fact that has to cross between two plugins that must not import each
 * other. It travels as a reactor gate: the chat asks, the sandbox answers, and
 * a workspace with no sandbox plugin has a working chat because nothing
 * answering means allowed.
 */

import { describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  configurePlugin,
} from '@datalayer/reactor';
import { LoopAgentGate, createPromptChannel } from '../core';
import type { LoopWorkspaceContext, SandboxSnapshot } from '../core';
import { CodeSandboxPlugin } from '../plugins/code-sandbox';
import { SANDBOX_TARGETS, TARGET_SPECS } from '../plugins/code-sandbox';

function workspaceOn(target: string): LoopWorkspaceContext {
  const sandbox: SandboxSnapshot = { state: 'running', target };
  return {
    serverUrl: '',
    agentId: 'a',
    sandbox,
    setSandbox: () => {},
    activeViewType: 'chat',
    setActiveViewType: () => {},
    prompts: createPromptChannel(),
    submit: async () => ({ handled: true }),
    viewControls: {},
    setViewControls: () => {},
  };
}

function sandboxReactor() {
  const reactor = buildReactorFromPlugins([
    configurePlugin(CodeSandboxPlugin, { serverUrl: '', target: 'browser' }),
  ]);
  reactor.start();
  return reactor;
}

describe('with no sandbox plugin', () => {
  it('leaves the chat usable', () => {
    // Nothing answering must never be a wall.
    const reactor = buildReactorFromPlugins([]);
    reactor.start();

    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('browser')).allowed,
    ).toBe(true);
  });
});

describe('with the sandbox plugin', () => {
  it('refuses on every target that has no agent', () => {
    const reactor = sandboxReactor();

    for (const target of SANDBOX_TARGETS) {
      const verdict = reactor.checkGate(LoopAgentGate, workspaceOn(target));
      expect(verdict.allowed, target).toBe(TARGET_SPECS[target].hasAgent);
    }
  });

  it('says which targets those are', () => {
    // Browser and anonymous Jupyter are sandbox-only. Local and Datalayer
    // runtimes both have an agent for chat and model selection.
    const withAgent = SANDBOX_TARGETS.filter(t => TARGET_SPECS[t].hasAgent);
    expect(withAgent).toEqual(['local', 'datalayer']);
  });

  it('gives the chat a reason it can show', () => {
    const reactor = sandboxReactor();
    const verdict = reactor.checkGate(LoopAgentGate, workspaceOn('browser'));

    expect(verdict.reason).toMatch(/no agent/i);
    // And names who refused, for a host that shows provenance.
    expect(verdict.blockedBy).toBe(CodeSandboxPlugin.name);
  });

  it('follows the target the workspace is on, not the one it started on', () => {
    // The service started on `browser`; the ask carries `datalayer`.
    const reactor = sandboxReactor();

    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('datalayer')).allowed,
    ).toBe(true);
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('browser')).allowed,
    ).toBe(false);
  });

  it('stops refusing when the sandbox plugin is switched off', () => {
    const reactor = sandboxReactor();
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('browser')).allowed,
    ).toBe(false);

    reactor.disable(CodeSandboxPlugin.name);

    // Its answer went with it: a chat should not stay disabled by a plugin
    // that is no longer there.
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('browser')).allowed,
    ).toBe(true);
  });
});

describe('the target order', () => {
  it('puts Jupyter between Local and Datalayer', () => {
    expect([...SANDBOX_TARGETS]).toEqual([
      'browser',
      'local',
      'jupyter',
      'datalayer',
    ]);
  });
});
