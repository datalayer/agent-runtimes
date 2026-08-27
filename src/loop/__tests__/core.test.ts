/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, expect, it } from 'vitest';
import {
  LoopCommand,
  LoopMention,
  LoopViewType,
  canOpenView,
  parseCommand,
  type LoopWorkspaceContext,
  type ViewTypeContribution,
} from '../core';

const workspace: LoopWorkspaceContext = {
  serverUrl: 'http://server',
  agentId: 'loop-base',
  sandbox: { state: 'idle' },
  activeViewType: 'chat',
  setActiveViewType: () => {},
};

function view(overrides: Partial<ViewTypeContribution> = {}): ViewTypeContribution {
  return {
    viewType: 'notebook',
    title: 'Notebook',
    load: async () => ({ default: () => null }),
    ...overrides,
  };
}

describe('extension points', () => {
  it('are distinct', () => {
    const ids = [LoopViewType.id, LoopCommand.id, LoopMention.id];
    expect(new Set(ids).size).toBe(3);
    expect(LoopViewType.id).toBe('loop.viewType');
  });
});

describe('canOpenView', () => {
  it('says yes when a view has no opinion', () => {
    expect(canOpenView(view(), workspace)).toBe(true);
  });

  it('asks the view about the live workspace', () => {
    const gated = view({
      canOpen: ctx => ctx.sandbox.state === 'running',
    });

    expect(canOpenView(gated, workspace)).toBe(false);
    expect(
      canOpenView(gated, { ...workspace, sandbox: { state: 'running' } }),
    ).toBe(true);
  });
});

describe('parseCommand', () => {
  it('splits a command from its arguments', () => {
    expect(parseCommand('/models openai:gpt-4o')).toEqual({
      name: 'models',
      argv: 'openai:gpt-4o',
    });
  });

  it('lowercases the name and keeps the arguments as typed', () => {
    expect(parseCommand('/Models Openai:GPT-4o')).toEqual({
      name: 'models',
      argv: 'Openai:GPT-4o',
    });
  });

  it('handles a bare command', () => {
    expect(parseCommand('  /help  ')).toEqual({ name: 'help', argv: '' });
  });

  it('is not fooled by prose that merely contains a slash', () => {
    expect(parseCommand('what does a/b mean?')).toBeUndefined();
    expect(parseCommand('/')).toBeUndefined();
    expect(parseCommand('')).toBeUndefined();
  });
});
