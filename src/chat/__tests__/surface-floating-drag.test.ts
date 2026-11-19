/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const chatBase = readFileSync(
  join(__dirname, '..', 'base', 'ChatBase.tsx'),
  'utf8',
);

/** "Floating draggable" over a notebook or a document moves by its handle (the user, 14 November 2026). */
describe('the floating chat over a surface', () => {
  it('draws the handle in "Floating draggable" and moves by it about the viewport', () => {
    expect(chatBase).toContain(
      "surfaceChatFloating && chatViewMode === 'floating-draggable'",
    );
    expect(chatBase).toContain('useViewportDrag(floatingChatRef)');
    expect(chatBase).toContain('ref={floatingChatRef}');
    expect(chatBase).toMatch(
      /\{draggableFloating && \(\s*<Box\s*onPointerDown=\{onFloatingHandlePointerDown\}/,
    );
    expect(chatBase).toContain('<GrabberIcon size={16} />');
    expect(chatBase).toContain("position: 'fixed'");
  });
});
