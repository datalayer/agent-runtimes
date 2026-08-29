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
    join(VIEWS, 'code-sandbox', 'browserService.ts'),
    'utf8',
  );

  it('publishes its manager to the store other components fall back to', () => {
    // A Jupyter cell dropped into the document reaches `useJupyter()` with no
    // manager of its own. Without this it built a second one from the page's
    // configured server URL and polled a host nobody asked for — the CORS
    // failures came from there, while the cell ran fine on the kernel here.
    expect(source).toContain('jupyterReactStore');
    expect(source).toContain('setServiceManager(manager)');
  });
});

/**
 * The other half of the same fix, in the library.
 *
 * Publishing to the store only helps if the store is what an unaccompanied
 * component actually falls back to. It was not: the hook seeded its state from
 * the props alone, and its effect built a manager from the configured server
 * URL without ever looking at what the page had already published.
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
