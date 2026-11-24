/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The document's kernel on its toolbar (the user, 24 November 2026: "show
 * also the kernel indicator in the toolbar"): which kernel, and whether it
 * is starting, idle or busy, following the kernel as it changes.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Signal } from '@lumino/signaling';

vi.mock('@datalayer/jupyter-react', () => ({
  KernelIndicator: ({ state }: { state?: string }) => (
    <span data-testid="light" data-state={state ?? 'from-kernel'} />
  ),
}));

const { PageKernelIndicator, pageKernelToolbarItems } =
  await import('../plugins/page-document/PageKernelIndicator');

function fakeKernel() {
  const kernel = {
    id: 'pyodide-1',
    name: 'python',
    status: 'idle',
    connectionStatus: 'connected',
    statusChanged: null as unknown as Signal<unknown, string>,
    connectionStatusChanged: null as unknown as Signal<unknown, string>,
  };
  kernel.statusChanged = new Signal(kernel);
  kernel.connectionStatusChanged = new Signal(kernel);
  return kernel;
}

const label = () =>
  screen.getByText(/·/).textContent?.replace(/\s+/g, ' ').trim();

describe('the document’s kernel indicator', () => {
  afterEach(cleanup);

  it('says Python in this browser is starting while there is no kernel', () => {
    render(<PageKernelIndicator source="starting" kernel={null} />);
    expect(label()).toBe('Python in this browser · Starting');
    expect(screen.getByTestId('light').dataset.state).toBe(
      'connected-starting',
    );
  });

  it('follows the browser kernel from idle to busy and back', () => {
    const kernel = fakeKernel();
    render(<PageKernelIndicator source="browser" kernel={kernel as never} />);
    expect(label()).toBe('Python in this browser · Idle');
    expect(screen.getByTestId('light').dataset.state).toBe('from-kernel');
    act(() => {
      kernel.status = 'busy';
      kernel.statusChanged.emit('busy');
    });
    expect(label()).toBe('Python in this browser · Busy');
    act(() => {
      kernel.status = 'idle';
      kernel.statusChanged.emit('idle');
    });
    expect(label()).toBe('Python in this browser · Idle');
  });

  it('names the workspace’s runtime, and connecting until it is connected', () => {
    const kernel = fakeKernel();
    kernel.connectionStatus = 'connecting';
    render(<PageKernelIndicator source="workspace" kernel={kernel as never} />);
    expect(label()).toBe('Runtime · Connecting');
    act(() => {
      kernel.connectionStatus = 'connected';
      kernel.connectionStatusChanged.emit('connected');
    });
    expect(label()).toBe('Runtime · Idle');
  });

  it('sits at the trailing edge of the document’s toolbar', () => {
    const items = pageKernelToolbarItems('browser', null);
    expect(items.map(item => item.type)).toEqual(['spacer', 'custom']);
    const custom = items[1] as { render: () => React.ReactElement };
    render(custom.render());
    expect(label()).toBe('Python in this browser · Starting');
  });
});

describe('the notebook’s toolbar (the user, 24 November 2026: "add the kernel indicator also in the notebook toolbar")', () => {
  it('carries the same indicator, on the page’s browser kernel', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const view = readFileSync(
      join(__dirname, '..', 'plugins', 'page-notebook', 'PageNotebookView.tsx'),
      'utf8',
    );
    expect(view).toContain("pageKernelToolbarItems('browser', browserKernel)");
    expect(view).toMatch(
      /<EphemeralNotebook[\s\S]*showToolbar[\s\S]*toolbarExtraItems=\{toolbarExtraItems\}/,
    );
  });
});
