/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When a sandbox counts as running.
 *
 * The surfaces key everything on this: a snapshot that says `idle` gives the
 * notebook and the document nothing to connect to, however healthy the thing
 * on the other end is. So the rule has to name every variant reached over a
 * Jupyter server, and it named only one — which is why a Datalayer runtime
 * could be launched, visible in the SaaS, and still show as nothing here.
 */

import { describe, expect, it } from 'vitest';

import { summarize } from '../plugins/agents/service';

const JUPYTER = {
  jupyter_url: 'https://runtime.example/api/jupyter-server',
  jupyter_token: 'tok',
  kernel_id: 'k1',
};

describe('summarising a sandbox', () => {
  it('is running when the manager says so', () => {
    expect(
      summarize({ variant: 'datalayer', sandbox_running: true }, 'idle').state,
    ).toBe('running');
  });

  it.each(['jupyter-server', 'datalayer'])(
    'is running when %s answers over Jupyter',
    variant => {
      // The manager can be between sandboxes while the server it reaches is
      // perfectly alive. Both variants are reached that way.
      const snapshot = summarize(
        { variant, jupyter_connected: true, ...JUPYTER },
        'idle',
      );
      expect(snapshot.state).toBe('running');
      // And it carries what a surface needs to connect, which is the point of
      // saying it is running at all.
      expect(snapshot.jupyterUrl).toBe(JUPYTER.jupyter_url);
      expect(snapshot.jupyterToken).toBe(JUPYTER.jupyter_token);
      expect(snapshot.kernelId).toBe(JUPYTER.kernel_id);
    },
  );

  it('is not running when nothing says it is', () => {
    expect(
      summarize({ variant: 'datalayer', jupyter_connected: false }, 'idle')
        .state,
    ).toBe('idle');
  });

  it('does not invent a connection for a variant with no Jupyter server', () => {
    // `docker` runs code in this process's world; a `jupyter_connected` flag
    // would mean nothing there, and treating it as running would be a lie.
    expect(
      summarize({ variant: 'docker', jupyter_connected: true }, 'idle').state,
    ).toBe('idle');
  });
});
