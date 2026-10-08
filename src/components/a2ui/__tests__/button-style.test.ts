/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An answer's Button is the theme's filled button (STUDIO P-04, T-30): its
 * fill and its label are Primer's primary-button properties, which a theme
 * and an application's accent set together — and its label, a Text, is not
 * painted in the surface's ink (a dark label on Spatial's dark accent).
 */

import { describe, expect, it } from 'vitest';
import { A2UI_RENDER_SCOPE_SX } from '../styles';

const rule = (selector: string): Record<string, unknown> =>
  (A2UI_RENDER_SCOPE_SX as Record<string, Record<string, unknown>>)[selector];

describe('an A2UI button', () => {
  it('wears the theme’s filled button, its label the accent’s own text', () => {
    expect(rule('& .a2ui-button')).toMatchObject({
      background: 'var(--button-primary-bgColor-rest)',
      color: 'var(--button-primary-fgColor-rest)',
    });
    expect(rule('& .a2ui-button:hover')).toMatchObject({
      background: 'var(--button-primary-bgColor-hover)',
    });
  });

  it('keeps its label in the button’s colour, not the surface’s ink', () => {
    expect(rule('& .a2ui-text').color).toContain('--a2ui-color-on-surface');
    expect(rule('& .a2ui-button .a2ui-text')).toEqual({ color: 'inherit' });
  });
});
