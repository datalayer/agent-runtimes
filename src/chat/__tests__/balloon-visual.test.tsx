/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A large visual in the balloon (LOOP T-23): what goes with the words shows
 * in either display, a tool line or not; a large visual (a notebook) offers
 * *Expand*, drawn into the element the host names, or in a dialog over the
 * page that Esc closes; a notebook's large view is the one that runs on the
 * browser sandbox, loaded only then.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';

vi.mock('../../components/teams/TeamNotebookView', () => ({
  default: ({ fileName }: { fileName: string }) => (
    <div data-testid="sandbox-notebook">{fileName}</div>
  ),
}));

import {
  AssistantStage,
  type AssistantStageProps,
} from '../assistant/AssistantStage';
import type { BalloonVisual } from '../assistant/BalloonVisual';
import { notebookBalloonVisual } from '../../components/teams/TeamNotebook';

// Primer's dialog measures itself.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render(
  props: Partial<AssistantStageProps> = {},
  before?: React.ReactNode,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        {before}
        <AssistantStage
          character="paperclip"
          state="speaking"
          place={{ left: 10, top: 300 }}
          stageRef={createRef<HTMLDivElement>()}
          onDragStart={() => {}}
          open={false}
          onToggle={() => {}}
          onDismiss={() => {}}
          insist
          {...props}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
  return { container };
}

const chart: BalloonVisual = {
  id: 'chart',
  title: 'The chart',
  render: () => <div data-testid="large">the chart, large</div>,
};
const small = <div data-testid="small">the chart, small</div>;
const expandButton = () =>
  document.querySelector<HTMLElement>('[data-balloon-expand]');

describe('what goes with the words', () => {
  it('shows in current while a tool runs', async () => {
    await render({
      balloonDisplay: 'current',
      balloon: {
        text: 'Using list_invoices…',
        tool: {
          id: 'c1',
          tool: 'list_invoices',
          name: 'list_invoices',
          phase: 'running',
        },
        attachment: small,
      },
    });
    expect(
      document.querySelector('[data-balloon-attachment] [data-testid="small"]'),
    ).not.toBeNull();
  });

  it('shows in history too', async () => {
    await render({
      balloonDisplay: 'history',
      balloon: { text: 'Here it is.', attachment: small },
    });
    expect(
      document.querySelector('[data-balloon-attachment] [data-testid="small"]'),
    ).not.toBeNull();
  });
});

describe('a large visual', () => {
  it('offers Expand only when the balloon carries one', async () => {
    await render({
      balloonDisplay: 'current',
      balloon: { text: 'Here it is.', attachment: small },
    });
    expect(expandButton()).toBeNull();
    mounted.splice(0).forEach(unmount => unmount());
    await render({
      balloonDisplay: 'current',
      balloon: { text: 'Here it is.', attachment: small, visual: chart },
    });
    expect(expandButton()?.textContent).toContain('Expand');
    expect(document.querySelector('[data-testid="large"]')).toBeNull();
  });

  it('is drawn into the element named, through a portal', async () => {
    const target = document.createElement('div');
    target.setAttribute('data-testid', 'target');
    document.body.appendChild(target);
    await render({
      balloonDisplay: 'current',
      expandTarget: { current: target },
      balloon: { text: 'Here it is.', attachment: small, visual: chart },
    });
    await act(async () => expandButton()?.click());
    expect(
      target.querySelector(
        '[data-balloon-expanded="target"] [data-testid="large"]',
      ),
    ).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // Closed from its corner.
    await act(async () =>
      target
        .querySelector<HTMLElement>('[data-balloon-expanded-close]')
        ?.click(),
    );
    expect(target.querySelector('[data-testid="large"]')).toBeNull();
  });

  it('opens in a dialog over the page when no element is named; Esc closes it', async () => {
    await render({
      balloonDisplay: 'current',
      balloon: { text: 'Here it is.', attachment: small, visual: chart },
    });
    await act(async () => expandButton()?.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(
      dialog?.querySelector(
        '[data-balloon-expanded="overlay"] [data-testid="large"]',
      ),
    ).not.toBeNull();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('can be drawn into its element as it arrives', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    await render({
      balloonDisplay: 'current',
      expandTarget: { current: target },
      expandOnArrival: true,
      balloon: { text: 'Here it is.', attachment: small, visual: chart },
    });
    expect(target.querySelector('[data-testid="large"]')).not.toBeNull();
  });
});

describe("a notebook's large view", () => {
  it('is the notebook that runs on the browser sandbox, loaded only then', async () => {
    const visual = notebookBalloonVisual(
      {
        mediaType: 'application/x-ipynb+json',
        name: 'Open invoices',
        filename: 'open-invoices.ipynb',
        data: { cells: [] },
      },
      'Accounting’s notebook',
    );
    await render({
      balloonDisplay: 'current',
      balloon: { text: 'Here it is.', attachment: small, visual },
    });
    expect(
      document.querySelector('[data-testid="sandbox-notebook"]'),
    ).toBeNull();
    await act(async () => expandButton()?.click());
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          '[role="dialog"] [data-team-notebook] [data-testid="sandbox-notebook"]',
        )?.textContent,
      ).toBe('open-invoices.ipynb'),
    );
  });
});
