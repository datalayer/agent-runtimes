/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Agent Details…* and *Code Sandbox Details…*, in the assistant's menu:
 * offered where the host describes the agent and where the agent has a
 * sandbox, each opening its dialog; the team's entry has the kernel of the
 * notebook open under the graph; a sandbox's URL is shown without its
 * token, and its variables are read through what the page can reach.
 */

// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  AssistantStage,
  assistantMenuItems,
  type AssistantStageProps,
} from '../assistant/AssistantStage';
import {
  assistantSandboxOf,
  displayUrl,
  sandboxExecuteOverHttp,
  timeLeft,
} from '../assistant/assistantDetails';
import { parsePyodideFacts } from '../assistant/SandboxDetailsDialog';
import { A2ATeamGraph } from '../../components/teams/A2ATeamGraph';
import { teamNotebookKernel } from '../../components/teams/teamNotebookKernel';
import { AT_REST } from '../../components/teams/useA2ATeam';

/** jupyter-react's KernelVariables, stood in for: what it is handed. */
vi.mock('@datalayer/jupyter-react', () => ({
  KernelVariables: (props: Record<string, unknown>) => (
    <div
      data-kernel-variables-stub=""
      data-has-execute={String(typeof props.execute === 'function')}
      data-has-connection={String(Boolean(props.connection))}
    />
  ),
  executeSilently: vi.fn(async () => ({ stdout: '' })),
}));

/** The runtime-reading AgentDetails, stood in for: what it is handed. */
vi.mock('../../agents/AgentDetails', () => ({
  AgentDetails: (props: Record<string, any>) => (
    <div
      data-agent-details-stub=""
      data-runtime={String(props.runtime)}
      data-agent-id={props.agentId ?? ''}
    >
      {[props.summary?.spec, props.summary?.model, props.summary?.where]
        .filter(Boolean)
        .join(' | ')}
    </div>
  ),
}));

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  if (!('DOMMatrixReadOnly' in window)) {
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m22 = 1;
        constructor() {}
      },
    );
  }
});

const mounted: Array<() => void> = [];
afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  cleanup();
  document.body.innerHTML = '';
  teamNotebookKernel.value = null;
});

async function renderStage(props: Partial<AssistantStageProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <AssistantStage
          character="paperclip"
          state="idle"
          place={{ left: 10, top: 300 }}
          stageRef={createRef<HTMLDivElement>()}
          onDragStart={() => {}}
          open={false}
          onToggle={() => {}}
          onDismiss={() => {}}
          {...props}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
}

const openMenu = async (figure?: Element | null) => {
  await act(async () => {
    (figure ??
      document.querySelector('[data-assistant-figure]'))!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
  });
};
const menuIds = () =>
  [...document.querySelectorAll('[data-assistant-menu-item]')].map(item =>
    item.getAttribute('data-assistant-menu-item'),
  );
const choose = async (id: string) => {
  await act(async () => {
    document
      .querySelector<HTMLElement>(`[data-assistant-menu-item="${id}"]`)
      ?.click();
  });
};

describe('the entries', () => {
  const noop = () => {};
  it('come after Inspect, each only when the host gives what it needs', () => {
    const ids = (extra: object) =>
      assistantMenuItems({
        name: 'Clip',
        open: false,
        onToggle: noop,
        onDismiss: noop,
        inspect: noop,
        ...extra,
      }).map(item => item.id);
    expect(ids({})).not.toContain('agent-details');
    expect(ids({})).not.toContain('sandbox-details');
    expect(
      ids({ agentDetails: noop, sandboxDetails: noop }).slice(0, 4),
    ).toEqual(['inspect', 'agent-details', 'sandbox-details', 'conversation']);
  });

  it('are left out by a stage that knows nothing of its agent', async () => {
    await renderStage();
    await openMenu();
    expect(menuIds()).not.toContain('agent-details');
    expect(menuIds()).not.toContain('sandbox-details');
  });
});

describe('Agent Details…', () => {
  it('opens a dialog describing an agent in the page by its spec, model and where', async () => {
    await renderStage({
      about: {
        name: 'Sales',
        spec: 'sales:0.0.1',
        model: 'claude',
        where: 'in your browser',
      },
    });
    await openMenu();
    expect(menuIds()).toContain('agent-details');
    expect(menuIds()).not.toContain('sandbox-details');
    await choose('agent-details');
    await vi.waitFor(
      () =>
        expect(
          document.querySelector('[data-assistant-agent-details]'),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const details = document.querySelector('[data-agent-details-stub]')!;
    expect(details.getAttribute('data-runtime')).toBe('false');
    expect(details.textContent).toBe('sales:0.0.1 | claude | in your browser');
  });

  it('reads an agent on a runtime there', async () => {
    await renderStage({
      about: { name: 'Clip', agentId: 'a1', apiBase: 'http://localhost:8765' },
    });
    await openMenu();
    await choose('agent-details');
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-agent-details-stub]'),
      ).not.toBeNull(),
    );
    const details = document.querySelector('[data-agent-details-stub]')!;
    expect(details.getAttribute('data-runtime')).toBe('true');
    expect(details.getAttribute('data-agent-id')).toBe('a1');
  });
});

describe('Code Sandbox Details…', () => {
  it('opens a summary without the token, and the variables read through the agent’s server', async () => {
    await renderStage({
      about: { name: 'Clip' },
      sandbox: {
        kind: 'local',
        status: 'running',
        variant: 'jupyter-server',
        url: 'http://localhost:8888/?token=secret',
        agentId: 'a1',
        serverUrl: 'http://localhost:8765',
      },
    });
    await openMenu();
    expect(menuIds()).toContain('sandbox-details');
    await choose('sandbox-details');
    await vi.waitFor(
      () =>
        expect(
          document.querySelector('[data-assistant-sandbox-details]'),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const dialog = document.querySelector('[data-assistant-sandbox-details]')!;
    expect(
      dialog
        .querySelector('[data-sandbox-kind]')
        ?.getAttribute('data-sandbox-kind'),
    ).toBe('local');
    expect(dialog.querySelector('[data-sandbox-status]')?.textContent).toBe(
      'running',
    );
    expect(dialog.textContent).toContain('http://localhost:8888/');
    expect(dialog.textContent).not.toContain('secret');
    expect(
      dialog.querySelector('[data-sandbox-fact="Agent"]')?.textContent,
    ).toBe('a1');
    // Unknown facts are left out, not shown blank.
    expect(dialog.querySelector('[data-sandbox-fact="Time left"]')).toBeNull();
    const variables = dialog.querySelector('[data-kernel-variables-stub]')!;
    expect(variables.getAttribute('data-has-execute')).toBe('true');
  });
});

describe('the team graph', () => {
  const member = (id: string, name: string) => ({
    id,
    name,
    character: id === 'sales' ? 'paperclip' : 'wizard',
    where: id === 'sales' ? 'in your browser' : 'on a runtime',
    persona: AT_REST,
    about: { name },
  });
  it('gives the entry the open notebook’s kernel as its sandbox, and the peer none', async () => {
    teamNotebookKernel.value = { id: 'k1' } as any;
    const { container } = render(
      <ThemeProvider>
        <A2ATeamGraph
          entry={member('sales', 'Sales')}
          peer={member('accounting', 'Accounting')}
          flow="still"
          connected
        />
      </ThemeProvider>,
    );
    const figure = (id: string) =>
      container.querySelector(
        `[data-team-member="${id}"] [data-assistant-figure]`,
      );
    await openMenu(figure('sales'));
    expect(menuIds()).toContain('agent-details');
    expect(menuIds()).toContain('sandbox-details');
    cleanup();
    document.body.innerHTML = '';
    teamNotebookKernel.value = null;
    const again = render(
      <ThemeProvider>
        <A2ATeamGraph
          entry={member('sales', 'Sales')}
          peer={member('accounting', 'Accounting')}
          flow="still"
          connected
        />
      </ThemeProvider>,
    );
    await openMenu(
      again.container.querySelector(
        '[data-team-member="accounting"] [data-assistant-figure]',
      ),
    );
    expect(menuIds()).toContain('agent-details');
    expect(menuIds()).not.toContain('sandbox-details');
  });
});

describe('the helpers', () => {
  it('show a URL without its credentials or tokens', () => {
    expect(displayUrl('http://u:p@localhost:8888/lab?token=abc&x=1')).toBe(
      'http://localhost:8888/lab?x=1',
    );
    expect(displayUrl('not a url?token=abc')).toBe('not a url');
    expect(displayUrl(undefined)).toBeUndefined();
  });

  it('name a sandbox by its status', () => {
    expect(
      assistantSandboxOf(
        {
          variant: 'jupyter-server',
          jupyter_url: 'http://127.0.0.1:8888',
          jupyter_connected: true,
        },
        { agentId: 'a1' },
      ),
    ).toMatchObject({ kind: 'local', status: 'running', agentId: 'a1' });
    expect(
      assistantSandboxOf({ variant: 'datalayer', sandbox_running: true })?.kind,
    ).toBe('cloud');
    expect(assistantSandboxOf({ variant: 'eval' })?.kind).toBe('runtime');
    expect(assistantSandboxOf({})).toBeUndefined();
    expect(assistantSandboxOf(null)).toBeUndefined();
  });

  it('say the time left, and never when unmetered', () => {
    const now = Date.parse('2026-10-05T10:00:00Z');
    expect(timeLeft(null, now)).toBe('never');
    expect(timeLeft('2026-10-05T11:20:00Z', now)).toBe('1 h 20 min');
    expect(timeLeft('2026-10-05T09:00:00Z', now)).toBe('ended');
    expect(timeLeft(undefined, now)).toBeUndefined();
  });

  it('run code in an agent’s sandbox over HTTP', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ stdout: 'out', error: null }),
    }));
    vi.stubGlobal('fetch', fetch);
    const execute = sandboxExecuteOverHttp(
      'http://localhost:8765/api/v1',
      'a1',
    );
    expect(await execute('print(1)')).toEqual({
      stdout: 'out',
      error: undefined,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8765/api/v1/sandbox/execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'print(1)', agent_id: 'a1' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('read Pyodide’s version and packages', () => {
    expect(
      parsePyodideFacts(
        'x__DL_PYODIDE__{"version": "0.29.4", "python": "3.13.2", "packages": ["numpy"]}__DL_PYODIDE__',
      ),
    ).toEqual({ version: '0.29.4', python: '3.13.2', packages: ['numpy'] });
    expect(parsePyodideFacts('')).toBeUndefined();
  });
});
