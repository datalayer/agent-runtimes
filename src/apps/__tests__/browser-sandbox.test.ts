/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where an in-page kernel looks for itself.
 *
 * A JupyterLite service manager reads `PageConfig` when it is built, and the
 * kernel connection then opens a socket at whatever `wsUrl` said. That makes
 * one shared global decide whether the browser sandbox talks to the page it is
 * in or to a remote Jupyter — and on any host configured for a remote one, the
 * regression is silent: the kernel starts, the socket goes to a server that
 * refuses it, and cells run into nothing. No error, no output, no kernel
 * anybody can blame.
 *
 * This lived in the landing page for exactly this reason and was lost when the
 * embedding moved into the package. It belongs here, beside the sandbox that
 * needs it, which is the whole argument for the move.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(__dirname, '..', 'plugins', 'agents', 'browserService.ts'),
  'utf8',
);

describe('the in-page sandbox', () => {
  it('points Jupyter at this origin before it builds the kernel', () => {
    // `lite: true` is jupyter-react's own way of saying "the page is the
    // server". The order matters as much as the call: the manager reads the
    // configuration once, when it is created.
    expect(SOURCE).toContain('loadJupyterConfig({ lite: true })');
    const configured = SOURCE.indexOf('loadJupyterConfig({ lite: true })');
    const built = SOURCE.indexOf('await createLiteServiceManager()');
    expect(configured).toBeGreaterThan(-1);
    expect(built).toBeGreaterThan(configured);
  });

  it('uses the loader rather than the setter that refuses to run', () => {
    // `setJupyterServerUrl` throws when no config has been loaded, and a
    // workspace can start a sandbox before any Jupyter component has mounted
    // to load one.
    expect(SOURCE).not.toContain('setJupyterServerUrl');
  });

  it('gives the page back what it borrowed', () => {
    // `PageConfig` is shared by everything on the page, and a workspace is a
    // component on somebody's page rather than the page itself.
    expect(SOURCE).toContain('release: () => {');
    expect(SOURCE).toContain('source.release?.()');
  });
});
