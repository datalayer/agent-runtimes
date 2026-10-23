/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The forced height under the notebook.
 *
 * A workaround, pinned here so it is found deliberately rather than stumbled
 * on. The notebook lives inside Lumino widgets: `.jp-NotebookPanel` holds
 * `.jp-Notebook`, which is absolutely positioned and therefore sized entirely
 * by its parent. Lumino sets that size from a resize message it expects to be
 * told about, and when the message does not arrive — intermittently, and more
 * often on a slow first paint than a fast one — the parent measures zero and
 * the notebook inside it has nothing to fill. The cells are in the DOM
 * throughout. Nothing is on screen.
 *
 * Measured side by side on a good load, every element in that chain has
 * exactly the geometry it has locally. There is no wrong number to correct,
 * only a number that sometimes never arrives — which is why this is CSS the
 * browser resolves on layout rather than a value computed from anything.
 *
 * The real fix belongs in the widget layer. Until it lands, this stays scoped
 * to the LOOP workspace's own view, so it cannot quietly become the way every
 * notebook in the package is sized.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'notebook', 'NotebookView.tsx'),
  'utf8',
);

describe('the Lumino height workaround', () => {
  it('pins the panel that the notebook is positioned against', () => {
    expect(VIEW).toContain("'& .jp-NotebookPanel'");
    expect(VIEW).toContain("height: '100% !important'");
  });

  it('makes the box above it able to fill', () => {
    // A panel told to be 100% of a parent that wraps its content is 100% of
    // nothing, so the box between the flex column and the panel has to fill.
    expect(VIEW).toContain("'& .dla-Box-Notebook'");
    expect(VIEW).toContain("flexDirection: 'column'");
  });

  it('says out loud that it is a workaround', () => {
    // The one thing that stops a hack becoming the design: the next person to
    // read it must know it is not load-bearing on purpose.
    expect(VIEW).toContain('WORKAROUND');
  });

  it('stays inside this view', () => {
    // Scoped selectors, not a global stylesheet: every rule is a descendant
    // of the box this view renders.
    const rules = VIEW.match(/'& \.[a-zA-Z-]+'/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.startsWith("'& ")).toBe(true);
    }
  });
});
