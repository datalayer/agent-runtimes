/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a visitor's key for an in-page agent is for, and what a visitor is
 * offered to choose among.
 *
 * ai-inference serves a visitor's key the models of what it names, and mints
 * none for nothing: the host says it (`visitorFor`), or a workspace with a
 * team names its team. The chat asks its key for that, and offers a visitor
 * without an account the models less those kept for people signed in.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { visitorForOf } from '../plugins/agents/visitorFor';
import { loopPlugins } from '../presets';

const source = (...path: string[]) =>
  readFileSync(join(__dirname, '..', ...path), 'utf8');

describe('what a visitor’s key is for', () => {
  it('is what the host said, else its team, else nothing', () => {
    expect(
      visitorForOf({
        visitorFor: 'scene:sales-and-accounting',
        teamId: 'jupyter',
      }),
    ).toBe('scene:sales-and-accounting');
    expect(visitorForOf({ teamId: 'jupyter' })).toBe('team:jupyter');
    expect(visitorForOf({})).toBe('');
    expect(visitorForOf(undefined)).toBe('');
  });

  it('reaches the agents plugin from the preset', () => {
    const configs = loopPlugins({ visitorFor: 'quote-calculator' }).map(
      ref => (ref as { config?: Record<string, unknown> }).config,
    );
    expect(
      configs.some(config => config?.visitorFor === 'quote-calculator'),
    ).toBe(true);
  });

  it('is what the chat asks its key for, and the badge reads', () => {
    const chat = source('plugins', 'chat', 'ChatView.tsx');
    expect(chat).toContain('useBrowserInference(inPage, visitorFor)');
    expect(chat).toContain('visitorsModels(');
    const badge = source('plugins', 'agents', 'AnonymousKeyBadge.tsx');
    expect(badge).toContain('useAnonymousSession(visitorFor)');
    expect(badge).toContain('.expire(visitorFor)');
  });
});
