/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The two editors reach a sandbox the same way.
 *
 * They had drifted: the notebook bound to the services of an in-page sandbox,
 * the document only knew how to connect to a URL. On Pyodide there is no URL,
 * so the document rendered an empty editor and logged nothing — the failure
 * was a silent early return.
 *
 * These read the source rather than rendering, because what went wrong is
 * which props one view passes and the other does not, and that is exactly what
 * a render test would not have noticed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEWS = join(__dirname, '..', 'plugins');

const notebook = readFileSync(
  join(VIEWS, 'notebook', 'NotebookView.tsx'),
  'utf8',
);
const document = readFileSync(
  join(VIEWS, 'document', 'DocumentView.tsx'),
  'utf8',
);

describe('both editors', () => {
  it('bind to the services of an in-page sandbox', () => {
    for (const [name, source] of [
      ['notebook', notebook],
      ['document', document],
    ] as const) {
      expect(source, name).toContain('getServiceManager()');
      expect(source, name).toContain('serviceManager={browserManager}');
    }
  });

  it('join that sandbox’s kernel rather than starting a rival', () => {
    for (const [name, source] of [
      ['notebook', notebook],
      ['document', document],
    ] as const) {
      expect(source, name).toContain('kernelId={browserManager');
    }
  });

  it('fall back to the URL only when there is no in-page manager', () => {
    for (const [name, source] of [
      ['notebook', notebook],
      ['document', document],
    ] as const) {
      // `!browserManager &&` is the guard that stops a server URL from
      // overriding services the host already handed over.
      expect(source, name).toContain('!browserManager && snapshot.jupyterUrl');
    }
  });
});

describe('the document component', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'chat', 'document', 'EphemeralDocument.tsx'),
    'utf8',
  );

  it('accepts services from its host', () => {
    expect(source).toContain('serviceManager?: ServiceManager.IManager');
    expect(source).toContain('kernelId?: string');
  });

  it('says so when it cannot reach the kernel it was given', () => {
    // The bug was not the failure; it was the silence.
    expect(source).toContain('could not reach the kernel');
  });

  it('never disposes a manager it did not build', () => {
    // Disposing the host's manager would take the sandbox down with the view.
    expect(source).toContain('Only what this component built');
  });
});

describe('the in-page sandbox', () => {
  const source = readFileSync(
    join(VIEWS, 'agents', 'browserService.ts'),
    'utf8',
  );

  it('keeps its manager to itself, never publishing it as the page’s', () => {
    // Every component on the page with no manager of its own adopts the
    // published one (below). Published, the in-page kernel's manager took
    // over the site's headless JupyterLab, whose settings and sessions then
    // asked the site itself (22 November 2026). The views that want it take
    // it from `getServiceManager()`.
    expect(source).not.toContain('setServiceManager(');
  });
});

/**
 * Why the sandbox must not publish: in the library, a component with no
 * manager of its own adopts whatever the page has published rather than
 * building one for the configured server.
 *
 * Skipped when jupyter-react is not checked out beside this repository — an
 * install from the registry has no source to read.
 */
describe('the jupyter-react fallback', () => {
  const source = (() => {
    try {
      return readFileSync(
        join(
          __dirname,
          '../../../../../tech/jupyter/ui/packages/react/src/state/JupyterReactState.ts',
        ),
        'utf8',
      );
    } catch {
      return undefined;
    }
  })();

  // Runs only where jupyter-ui is checked out beside this repository (the monorepo):
  // it reads JupyterReactState.ts from there; this repository's CI has no such checkout.
  it.runIf(source)('prefers a published manager over building one', () => {
    // Seeded from the store, so a component mounting after the sandbox is up
    // never renders a frame without it...
    expect(source).toContain(
      'propsServiceManager ?? jupyterReactStore.getState().serviceManager',
    );
    // ...and consulted again in the effect, for one that mounted before.
    const effect = source!.slice(source!.indexOf('if (!serviceManager) {'));
    expect(
      effect.indexOf('jupyterReactStore.getState().serviceManager'),
    ).toBeLessThan(effect.indexOf('if (lite) {'));
  });
});
