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
import { buildReactorFromPlugins, configurePlugin } from '@datalayer/reactor';
import { LoopAgentGate, createPromptChannel } from '../core';
import type { LoopWorkspaceContext, SandboxSnapshot } from '../core';
import { AgentsPlugin } from '../plugins/agents';
import {
  SANDBOX_TARGETS,
  TARGET_SPECS,
  targetRunsAgentInPage,
} from '../plugins/agents';

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
    configurePlugin(AgentsPlugin, { serverUrl: '', target: 'browser' }),
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
    // Only the anonymous Jupyter server is sandbox-only now. The browser
    // joined the others when the loop learned to turn in the page: it has no
    // server, which used to be the same thing as having no agent, and is not
    // any more.
    const withAgent = SANDBOX_TARGETS.filter(t => TARGET_SPECS[t].hasAgent);
    expect(withAgent).toEqual(['browser', 'local', 'datalayer']);
  });

  it('gives the chat a reason it can show', () => {
    const reactor = sandboxReactor();
    const verdict = reactor.checkGate(LoopAgentGate, workspaceOn('jupyter'));

    expect(verdict.reason).toMatch(/no agent/i);
    // And names who refused, for a host that shows provenance.
    expect(verdict.blockedBy).toBe(AgentsPlugin.name);
  });

  it('follows the target the workspace is on, not the one it started on', () => {
    // The service started on `browser`; the ask carries `jupyter`.
    const reactor = sandboxReactor();

    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('datalayer')).allowed,
    ).toBe(true);
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('jupyter')).allowed,
    ).toBe(false);
  });

  it('says where the loop turns, not only whether there is one', () => {
    // Two kinds of yes, and a chat has to tell them apart: an in-page agent is
    // reached by calling it, a remote one by addressing it.
    expect(targetRunsAgentInPage('browser')).toBe(true);
    for (const target of ['local', 'jupyter', 'datalayer'] as const) {
      expect(targetRunsAgentInPage(target), target).toBe(false);
    }
  });

  it('stops refusing when the sandbox plugin is switched off', () => {
    const reactor = sandboxReactor();
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('jupyter')).allowed,
    ).toBe(false);

    reactor.disable(AgentsPlugin.name);

    // Its answer went with it: a chat should not stay disabled by a plugin
    // that is no longer there.
    expect(
      reactor.checkGate(LoopAgentGate, workspaceOn('jupyter')).allowed,
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
