/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's conversation in the workspace's chat (LOOP T-17, T-18,
 * T-19): its face in the empty state at the page's size of the three, and no
 * session controls under its composer — an agent's chat keeps them.
 *
 * Read from the source, as the other `ChatView` pins are: the view needs a
 * whole workspace to render.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loopShapeVars } from '@datalayer/primer-addons';

const chat = readFileSync(
  join(__dirname, '..', 'plugins/chat/ChatView.tsx'),
  'utf8',
);

describe('an application in the chat', () => {
  it('draws its face in the empty state at the page’s size', () => {
    expect(loopShapeVars['--loop-face-large']).toBe('72px');
    expect(chat).toContain(
      "const FACE_LARGE = parseInt(loopShapeVars['--loop-face-large'], 10);",
    );
    expect(chat).toMatch(/style=\{\{ fontSize: FACE_LARGE, lineHeight: 1 \}\}/);
    expect(chat).not.toContain('fontSize: 48');
  });

  it('keeps none of the session’s controls under its composer', () => {
    for (const control of [
      'showAgentsMenu',
      'showModelSelector',
      'showToolsMenu',
      'showSkillsMenu',
    ]) {
      expect(chat).toContain(`${control}: !presence,`);
    }
  });

  it('is switched off, with the reason, when its host says there is nothing to talk to (LOOP R-27)', () => {
    expect(chat).toContain('const ambient = useChatAvailability();');
    expect(chat).toMatch(
      /const chatDisabled =\s+gateBlocked \|\| keyExpired \|\| Boolean\(inPageRefusal\) \|\| ambient\.disabled;/,
    );
    expect(chat).toContain(
      '(ambient.disabled ? ambient.disableReason : undefined)',
    );
  });
});
