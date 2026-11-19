/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMBED_OBSERVED_ATTRIBUTES } from '../embed/embedConfig';

const element = readFileSync(
  join(__dirname, '..', 'embed', 'element.tsx'),
  'utf8',
);

/**
 * React 19 sets a prop on a custom element as a property when the element
 * already has a member of that name: a method named after an attribute was
 * overwritten by the attribute's string on a remount ("this.api is not a
 * function", 14 November 2026). Only accessors that write the attribute may
 * share an attribute's name.
 */
describe('<datalayer-app> members', () => {
  it('names no method after an attribute', () => {
    const camel = (name: string) =>
      name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    for (const attribute of EMBED_OBSERVED_ATTRIBUTES) {
      const method = new RegExp(
        `^\\s+(private |public |protected )?(async )?${camel(attribute)}\\(`,
        'm',
      );
      expect([attribute, method.test(element)]).toEqual([attribute, false]);
    }
    expect(element).toContain('private spacerUrl(): string {');
    expect(element).toContain('private originUrl(): string {');
  });
});
