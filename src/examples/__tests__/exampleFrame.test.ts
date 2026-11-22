/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The examples shell's layout contract: the page never scrolls, every example
 * fills the content area under the header and scrolls its own panels.
 *
 * The browser check is scripts/check-examples-viewport.py; these hold the CSS
 * it relies on, and keep the viewport units (taller than the content area by
 * the header, and scaled under a zoomed root) out of the examples.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EXAMPLE_FRAME_SX,
  EXAMPLE_ROOT_SX,
  EXAMPLES_CONTENT_SX,
  EXAMPLES_HEADER_SX,
  EXAMPLES_SHELL_SX,
} from '../components/exampleFrame';

const EXAMPLES_DIR = resolve(__dirname, '..');
const REPO = resolve(EXAMPLES_DIR, '..', '..');

describe('the examples shell', () => {
  it('is pinned to the window, a column that clips', () => {
    expect(EXAMPLES_SHELL_SX).toMatchObject({
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });
  });

  it('gives the header its own height, never squeezed, above the content', () => {
    expect(EXAMPLES_HEADER_SX).toMatchObject({
      flex: 'none',
      minWidth: 0,
      position: 'relative',
      zIndex: 100,
    });
  });

  it("lets the header's popovers hang over the example: no clipping", () => {
    expect(EXAMPLES_HEADER_SX).not.toHaveProperty('overflow');
    expect(EXAMPLES_HEADER_SX).not.toHaveProperty('contain');
  });

  it('gives the content area what is left, and nothing past it', () => {
    expect(EXAMPLES_CONTENT_SX).toMatchObject({
      flex: '1 1 0',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      // An example's fixed layers stay under the header.
      contain: 'layout',
    });
  });

  it('frames every example: filled, clipped, its root capped', () => {
    expect(EXAMPLE_FRAME_SX).toMatchObject({
      flex: '1 1 0',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
    });
    expect(EXAMPLE_ROOT_SX).toMatchObject({
      flex: '1 1 0',
      minHeight: 0,
      maxHeight: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
    });
  });

  it('measures nothing in viewport units', () => {
    const sx = JSON.stringify([
      EXAMPLES_SHELL_SX,
      EXAMPLES_HEADER_SX,
      EXAMPLES_CONTENT_SX,
      EXAMPLE_FRAME_SX,
      EXAMPLE_ROOT_SX,
    ]);
    expect(sx).not.toMatch(/\d(d|s|l)?v[hw]\b/);
  });

  it('keeps html, body and #root full height, unscrolled, without margin', () => {
    const html = readFileSync(join(REPO, 'html', 'examples.html'), 'utf8');
    const rule = html.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule![1];
    expect(body).toMatch(/height:\s*100%/);
    expect(body).toMatch(/margin:\s*0/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });
});

describe('the examples', () => {
  // The shell's own file draws the callback and notebook-only pages, which
  // are not framed.
  const files = readdirSync(EXAMPLES_DIR).filter(
    name => /\.tsx$/.test(name) && name !== 'main.tsx',
  );

  it.each(files)('%s sizes nothing by the viewport', name => {
    const source = readFileSync(join(EXAMPLES_DIR, name), 'utf8');
    // `100vh` in the frame is the header's height too tall; `100vw` counts
    // the scrollbar. `calc(100vh - …)` offsets are left to the sweep, which
    // measures whether they fit.
    expect(source).not.toMatch(/['"]100d?v[hw]['"]/);
  });
});
