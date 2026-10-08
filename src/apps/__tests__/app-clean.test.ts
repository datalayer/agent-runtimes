/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The rules of clean (LOOP T-17), held where an application's own chrome is
 * drawn: its reactions (the thumbs of V-18, T-06), the rail (T-07) and the
 * split — line icons in the ink, no verdict's colour on a control, no
 * filled button beside the composer's, no gradient.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8');

const CHROME = [
  'apps/AppFeedback.tsx',
  'shell/SidebarRail.tsx',
  'plugins/page-layout/SplitLayout.tsx',
];

describe("an application's chrome, by the rules of clean", () => {
  it.each(CHROME)(
    '%s: no verdict colour, no filled button, no gradient',
    path => {
      const text = source(path);
      expect(text).not.toMatch(/variant=\{?['"]?(danger|primary)/);
      expect(text).not.toMatch(/['"]primary['"]|['"]danger['"]/);
      expect(text).not.toMatch(
        /(danger|success|attention)\.(fg|emphasis|muted|subtle)/,
      );
      expect(text).not.toMatch(/gradient\(/);
    },
  );

  it('says a refused reaction in the ink, as an alert', () => {
    const text = source('apps/AppFeedback.tsx');
    expect(text).toMatch(
      /role="alert" sx=\{\{ fontSize: 0, color: 'fg.default' \}\}/,
    );
  });
});
