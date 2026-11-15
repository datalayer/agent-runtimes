/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string =>
  readFileSync(join(__dirname, '..', 'embed', file), 'utf8');

/**
 * An embedded application shows a skeleton at once, never "Loading…" (the
 * user, 15 November 2026): the loader draws one in each element before the
 * module is fetched, and the element draws its own while it reads the
 * application.
 */
describe('<datalayer-app> while it loads', () => {
  it('gets a placeholder from the loader before the module is imported, removed once the element is defined', () => {
    const loader = read('loader.ts');
    const placeholderAt = loader.indexOf(
      "document.querySelectorAll('datalayer-app').forEach(placeholder);",
    );
    const importAt = loader.indexOf('import(/* @vite-ignore */ main)');
    expect(placeholderAt).toBeGreaterThan(0);
    expect(placeholderAt).toBeLessThan(importAt);
    expect(loader).toContain("const SKELETON = 'data-datalayer-skeleton';");
    expect(loader).toContain('new MutationObserver(');
    expect(loader).not.toMatch(/Loading…|Loading\.\.\./);
    const element = read('element.tsx');
    expect(element).toMatch(
      /this\.querySelectorAll\(':scope > \[data-datalayer-skeleton\]'\)\.forEach\(\s*node => node\.remove\(\),?\s*\);/,
    );
  });

  it('draws its own skeleton while it reads the application, inline only', () => {
    const element = read('element.tsx');
    const connected = element.slice(
      element.indexOf('connectedCallback(): void {'),
      element.indexOf('disconnectedCallback(): void {'),
    );
    expect(connected.indexOf('this.waiting();')).toBeLessThan(
      connected.indexOf('void this.load();'),
    );
    expect(element).toContain("box.className = 'datalayer-app-waiting';");
    expect(element).toMatch(/if \(\s*\(mode && mode !== 'inline'\)/);
    expect(read('embedTheme.ts')).toContain('.datalayer-app-waiting {');
  });
});
