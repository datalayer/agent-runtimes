/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The composer empties when the message is taken, and only then.
 *
 * `InputPromptBase` clears itself when it owns its own text, and deliberately
 * does not when the value is controlled — that value belongs to whoever passed
 * it. The LOOP chat passes one, because a page embedding the workspace can
 * offer a prompt and needs somewhere outside the editor to put it. So clearing
 * is this view's job, and it was not doing it: the sentence stayed in the box
 * after the agent had answered, the next thing typed was appended to the last
 * thing asked, and the placeholder that suggests what to ask never came back.
 *
 * The other half matters as much. A send nothing accepted must leave the words
 * where they were typed — the reason appears under the prompt, and emptying
 * the box as well would make a failure look like a success while costing the
 * person their sentence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
  'utf8',
);

/** `handleSend`, from its opening to the end of its dependency list. */
function sendHandler(): string {
  const start = CHAT_VIEW.indexOf('const handleSend = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = CHAT_VIEW.indexOf('[workspace],', start);
  expect(end).toBeGreaterThan(start);
  return CHAT_VIEW.slice(start, end);
}

describe('sending a message', () => {
  it('empties the composer', () => {
    expect(sendHandler()).toContain("setDraft('')");
  });

  it('keeps the words when nothing took them', () => {
    // The early return on an unhandled outcome has to come first, or the
    // clear runs on the failing path too.
    const handler = sendHandler();
    const refused = handler.indexOf('if (!outcome.handled)');
    const cleared = handler.indexOf("setDraft('')");
    expect(refused).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(refused);
    expect(handler.slice(refused, cleared)).toContain('return;');
  });
});
