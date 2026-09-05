/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Asking a server that does not offer server-side execution.
 *
 * `api/kernels/{id}/execute` is an agent-runtimes extension. A JupyterLite
 * kernel in the page does not have it, and neither does a plain Jupyter server
 * — so the sweep must read a 404 as "this server cannot do that", once, rather
 * than as a failure worth reporting on every pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import { CodeCell } from '@jupyterlab/cells';
import {
  resetServerExecutionState,
  resumeServerExecutions,
} from '../serverExecution';

const settings = ServerConnection.makeSettings({ baseUrl: 'http://x/' });

/**
 * A notebook with one code cell and a kernel, which is all the sweep needs.
 *
 * The cell is a bare `CodeCell` prototype rather than a constructed one: the
 * sweep only asks `instanceof` and then reads metadata that is absent here,
 * and building a real cell would drag in the editor for no gain.
 */
function notebookWithKernel() {
  return {
    isDisposed: false,
    content: {
      widgets: [
        Object.create(CodeCell.prototype, {
          // `isDisposed` is a getter on `Widget`, so it is defined rather
          // than assigned.
          isDisposed: { get: () => false },
          // Enough shared model for the metadata reads on the resume path.
          model: {
            value: {
              getMetadata: () => undefined,
              sharedModel: {
                getId: () => 'cell-1',
                getMetadata: () => undefined,
              },
            },
          },
        }),
      ] as unknown[],
    },
    sessionContext: {
      session: { kernel: { id: 'k1', serverSettings: settings } },
    },
  } as never;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetServerExecutionState();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.restoreAllMocks();
});

describe('a server without the execution endpoint', () => {
  it('is asked once and never complained about', async () => {
    const request = vi.spyOn(ServerConnection, 'makeRequest').mockResolvedValue(
      // A 404 with no body, which is what JupyterLite answers.
      new Response(null, { status: 404 }) as never,
    );

    const panel = notebookWithKernel();
    // The sweep runs on every notebook change; this one has nothing to resume,
    // but it still asks the first time.
    await resumeServerExecutions(panel);
    await resumeServerExecutions(panel);
    await resumeServerExecutions(panel);

    // Asked once, because the answer cannot change for this server.
    expect(request).toHaveBeenCalledTimes(1);
    // And not reported: a feature this server lacks is not a fault.
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a server that is briefly unwell', () => {
  it('is asked again, and reported with its status', async () => {
    const request = vi
      .spyOn(ServerConnection, 'makeRequest')
      // An empty body used to make the error path throw a `SyntaxError` of its
      // own, replacing the status the reader needed with a parse error.
      .mockResolvedValue(new Response(null, { status: 503 }) as never);

    const panel = notebookWithKernel();
    await resumeServerExecutions(panel);
    await resumeServerExecutions(panel);

    // Not recorded, so the next sweep tries again.
    expect(request).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    const reported = String(warn.mock.calls[0]?.[1] ?? '');
    expect(reported).toContain('503');
  });
});

describe('a notebook with no kernel', () => {
  it('asks nothing at all', async () => {
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await resumeServerExecutions({
      isDisposed: false,
      content: { widgets: [] },
      sessionContext: { session: { kernel: null } },
    } as never);

    expect(request).not.toHaveBeenCalled();
  });
});
