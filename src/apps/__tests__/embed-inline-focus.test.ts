/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application embedded inline in someone else's page never takes the
 * focus as it loads: its prompt grabbing the caret scrolled the host page
 * down to the embed (the user, 27 November 2026, on /features/studio).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('an inline embed', () => {
  it('mounts its application with the prompt unfocused, as the floating window does', () => {
    const source = readFileSync(
      join(__dirname, '..', 'embed', 'AppEmbed.tsx'),
      'utf8',
    );
    const inline = source.slice(
      source.indexOf('const inline = !session.ready'),
      source.indexOf('const inline = !session.ready') + 2500,
    );
    expect(inline).toContain('<AppRenderer');
    expect(inline).toContain('autoFocusPrompt={false}');
    expect(
      source.match(/autoFocusPrompt=\{false\}/g)!.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
