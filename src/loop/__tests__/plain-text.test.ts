/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2022-2026 Datalayer, Inc.
 *
 * Datalayer License
 */

import { describe, expect, it } from 'vitest';
import { flattenMarkdown } from '../plugins/page-layout/plainText';

describe('flattenMarkdown', () => {
  it('takes bold and italic marks off, both syntaxes', () => {
    expect(flattenMarkdown('**South** is the __outlier__, *really* _so_')).toBe(
      'South is the outlier, really so',
    );
  });

  it('keeps arithmetic asterisks and snake_case words', () => {
    expect(flattenMarkdown('2 * 3 * 4 and total_revenue')).toBe(
      '2 * 3 * 4 and total_revenue',
    );
  });

  it('keeps the words of headings, quotes, code and links', () => {
    expect(
      flattenMarkdown(
        '## Findings\n> `df.head()` shows [the drop](https://x.y)\n```python\nprint(1)\n```',
      ),
    ).toBe('Findings\ndf.head() shows the drop\nprint(1)\n');
  });

  it('never joins lines', () => {
    expect(flattenMarkdown('**a\nb**')).toBe('**a\nb**');
  });
});
