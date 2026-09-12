/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The end of the trial has to be visible wherever the chat is.
 *
 * The panel used to be rendered inside the transcript, which was the whole
 * page when the chat was the workspace. On the page layout the transcript is
 * a side panel that starts closed, so a visitor whose key ran out saw an
 * agent that had stopped answering and no reason anywhere on screen. It
 * covers the workspace now — chat, editors, prompt and picker together.
 *
 * Read off the source: mounting the whole chat view needs a sandbox, a
 * runtime and an inference service, and the fact under test is where one
 * element sits.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
  'utf8',
);

/** The view's outermost element, from its `return (` to the end. */
function workspaceRoot(): string {
  const at = CHAT_VIEW.lastIndexOf('    <Box\n      ref={viewRef}');
  expect(at).toBeGreaterThan(-1);
  return CHAT_VIEW.slice(at);
}

describe('the expired-key panel', () => {
  it('is rendered by the workspace root, not by the transcript', () => {
    const root = workspaceRoot();
    // One panel, and it belongs to the root element.
    expect(CHAT_VIEW.match(/<AnonymousKeyExpired/g)).toHaveLength(1);
    expect(root).toContain('{keyExpired ? (');
    expect(root).toContain('<AnonymousKeyExpired');
  });

  it('covers the layout rather than replacing it', () => {
    // Everything stays mounted underneath, so signing in gives the visitor
    // their notebook and their transcript back as they left them.
    const root = workspaceRoot();
    const panel = root.slice(root.indexOf('{keyExpired ? ('));
    expect(panel).toContain("position: 'absolute'");
    expect(panel).toContain('inset: 0');
    // And the root is what it is positioned against.
    expect(root).toContain("position: 'relative'");
  });
});
