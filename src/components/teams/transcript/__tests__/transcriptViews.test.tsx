/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The three views under one switch (SCENES S2-03) and the drill-down (S3):
 * Lines, Table and Sequence show the same lines after a filter; *Copy*
 * copies each view as its own text; a click on a line or a row opens the
 * detail, which says a recording has no span to open and, with the spans,
 * reads the refused call's error; *failed only* narrows to the exchange;
 * *Export JSON* hands a file the reader takes back.
 */

// @vitest-environment jsdom
import * as React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { linesOfTranscriptJson } from '../transcriptExport';
import {
  TranscriptViews,
  copyTextOf,
  sequenceCastOf,
} from '../TranscriptViews';
import type { MermaidLike } from '../SequenceDiagram';
import {
  HARNESS_STEPS,
  MEMBERS,
  OPEN_AND_FAILED,
  SCRIPTED,
  recorded,
} from './fixture';

afterEach(cleanup);

// Primer's table measures itself: jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  ResizeObserverStub;

/** A mermaid that draws the source as text: jsdom draws no SVG. */
const fakeMermaid: MermaidLike = {
  initialize: () => undefined,
  render: async (_id, source) => ({
    svg: `<svg data-fake-mermaid=""><text class="messageText">${source.split('\n').length}</text></svg>`,
  }),
};
const load = async () => fakeMermaid;

function draw(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const view = (container: HTMLElement, choice: string) =>
  container.querySelector<HTMLElement>(
    `[data-transcript-view-choice="${choice}"]`,
  )!;

describe('TranscriptViews', () => {
  it('shows the same lines in the three views, narrowed by the same filter', async () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    const { container } = draw(
      <TranscriptViews lines={lines} members={MEMBERS} loadMermaid={load} />,
    );
    const root = container.querySelector<HTMLElement>(
      '[data-transcript-views]',
    )!;
    expect(root.dataset.transcriptViews).toBe('lines');
    expect(root.dataset.transcriptKept).toBe('4');
    expect(container.querySelectorAll('[data-transcript-line]')).toHaveLength(
      4,
    );
    // Failed only: the exchange that failed, its ask and its refusal.
    fireEvent.click(container.querySelector('[data-transcript-failed-only]')!);
    expect(root.dataset.transcriptKept).toBe('2');
    expect(
      [...container.querySelectorAll('[data-transcript-line]')].map(
        line => line.textContent,
      ),
    ).toEqual([
      expect.stringContaining('Open invoices.'),
      expect.stringContaining('could not answer'),
    ]);
    fireEvent.click(view(container, 'table'));
    expect(root.dataset.transcriptViews).toBe('table');
    expect(
      container
        .querySelector('[data-transcript-table]')!
        .getAttribute('data-transcript-rows'),
    ).toBe('2');
    expect(container.querySelectorAll('[data-transcript-row]')).toHaveLength(2);
    expect(
      container.querySelectorAll('[data-transcript-state="failed"]'),
    ).toHaveLength(1);
    fireEvent.click(view(container, 'sequence'));
    expect(root.dataset.transcriptViews).toBe('sequence');
    await act(async () => {
      await Promise.resolve();
    });
    const diagram = container.querySelector<HTMLElement>(
      '[data-sequence-diagram]',
    )!;
    expect(diagram.dataset.sequenceDiagram).toBe('drawn');
    expect(diagram.dataset.sequenceArrows).toBe('2');
    expect(container.querySelector('[data-fake-mermaid]')).not.toBeNull();
  });

  it('copies each view as its own text', async () => {
    const { lines } = recorded(SCRIPTED);
    const copied: string[] = [];
    const writeText = async (text: string) => {
      copied.push(text);
    };
    const { container } = draw(
      <TranscriptViews
        lines={lines}
        members={MEMBERS}
        writeText={writeText}
        loadMermaid={load}
      />,
    );
    const cast = sequenceCastOf(MEMBERS);
    expect(cast).toEqual([
      { name: 'Sales' },
      { name: 'Accounting' },
      { name: 'Odoo', system: true },
    ]);
    for (const choice of ['lines', 'table', 'sequence'] as const) {
      fireEvent.click(view(container, choice));
      const button = container.querySelector<HTMLElement>(
        `[data-transcript-copy="${choice}"]`,
      )!;
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      expect(copied.at(-1)).toBe(copyTextOf(choice, lines, cast));
    }
    expect(copied[0]).toContain('You → Sales: Give me the aged receivables');
    expect(copied[1].startsWith('| Time | From | To |')).toBe(true);
    expect(copied[2].startsWith('sequenceDiagram\n')).toBe(true);
    expect(container.querySelector('[data-transcript-copy]')!.textContent).toBe(
      'Copied',
    );
  });

  it('opens the detail on a line, says a recording has no span, and closes', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    const onSelect = vi.fn();
    const { container } = draw(
      <TranscriptViews lines={lines} members={MEMBERS} onSelect={onSelect} />,
    );
    expect(
      container.querySelector('[data-transcript-recorded]'),
    ).not.toBeNull();
    const refusal = container.querySelectorAll<HTMLElement>(
      '[data-transcript-line]',
    )[3];
    fireEvent.click(refusal);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key: 'f2:said',
        from: 'Accounting',
        to: 'Sales',
        kind: 'said',
        failed: true,
      }),
    );
    const detail = container.querySelector<HTMLElement>(
      '[data-transcript-detail]',
    )!;
    expect(detail.dataset.transcriptDetail).toBe('f2:said');
    expect(detail.dataset.transcriptDetailStatus).toBe('failed');
    expect(
      detail.querySelector('[data-transcript-detail-recorded]')!.textContent,
    ).toBe('This line comes from a recording: there is no span to open.');
    expect(
      detail.querySelector('[data-transcript-detail-inspector]'),
    ).toBeNull();
    expect(refusal.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(detail.querySelector('[data-transcript-detail-close]')!);
    expect(container.querySelector('[data-transcript-detail]')).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('opens a harness step refused by the Shield with its rule', () => {
    const { lines, spans } = recorded(HARNESS_STEPS);
    const { container } = draw(
      <TranscriptViews
        lines={lines}
        members={MEMBERS}
        spans={spans}
        loadMermaid={load}
      />,
    );
    const edit = container.querySelectorAll<HTMLElement>(
      '[data-transcript-line]',
    )[2];
    fireEvent.click(edit);
    const detail = container.querySelector<HTMLElement>(
      '[data-transcript-detail]',
    )!;
    expect(detail.dataset.transcriptDetailStatus).toBe('failed');
    const shield = detail.querySelector<HTMLElement>(
      '[data-transcript-detail-shield]',
    )!;
    expect(shield.dataset.transcriptDetailShield).toBe('deny');
    expect(shield.textContent).toContain('leave it to me');
    expect(
      detail.querySelector('[data-transcript-detail-rule]')!.textContent,
    ).toBe('by the rule \u2018Change a file\u2019 (team)');
    expect(
      detail.querySelector('[data-transcript-detail-error]')!.textContent,
    ).toBe(
      "Refused by the Shield: leave it to me, by the rule 'Change a file' (team).",
    );
  });

  it('reads the refused call from its span in the table, and opens the Inspector', () => {
    const { lines, spans } = recorded(OPEN_AND_FAILED);
    const onOpenInspector = vi.fn();
    const { container } = draw(
      <TranscriptViews
        lines={lines}
        members={MEMBERS}
        spans={spans}
        defaultView="table"
        onOpenInspector={onOpenInspector}
        inspectorHref={ids => `/observability/traces/${ids.traceId}`}
      />,
    );
    expect(container.querySelector('[data-transcript-recorded]')).toBeNull();
    const row = container.querySelector<HTMLElement>(
      '[data-transcript-row="f2:said"]',
    )!;
    fireEvent.click(row);
    const detail = container.querySelector<HTMLElement>(
      '[data-transcript-detail]',
    )!;
    expect(
      detail.querySelector('[data-transcript-detail-error]')!.textContent,
    ).toBe('TASK_STATE_FAILED');
    expect(within(detail).getByText(/span\s+f2/)).toBeTruthy();
    expect(
      detail
        .querySelector<HTMLAnchorElement>('[data-transcript-detail-trace]')!
        .getAttribute('href'),
    ).toBe('/observability/traces/t1');
    fireEvent.click(
      detail.querySelector('[data-transcript-detail-inspector]')!,
    );
    expect(onOpenInspector).toHaveBeenCalledWith({
      traceId: 't1',
      spanId: 'f2',
      parentSpanId: 'f1',
    });
    // The open call to Odoo: its tool, still running.
    fireEvent.click(
      container.querySelector('[data-transcript-row="f3:called"]')!,
    );
    const call = container.querySelector<HTMLElement>(
      '[data-transcript-detail]',
    )!;
    expect(call.dataset.transcriptDetailStatus).toBe('running');
    expect(
      call.querySelector('[data-transcript-detail-part="tool"]')!.textContent,
    ).toContain('odoo_accounting_list_invoices');
  });

  it('exports the kept lines as JSON the reader takes back', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    const files: [string, string][] = [];
    const { container } = draw(
      <TranscriptViews
        lines={lines}
        members={MEMBERS}
        scene="sales-and-accounting"
        download={(name, text) => files.push([name, text])}
      />,
    );
    fireEvent.click(container.querySelector('[data-transcript-failed-only]')!);
    fireEvent.click(container.querySelector('[data-transcript-export]')!);
    expect(files).toHaveLength(1);
    expect(files[0][0]).toBe('sales-and-accounting-transcript.json');
    expect(linesOfTranscriptJson(files[0][1]).map(line => line.key)).toEqual([
      'f2:asked',
      'f2:said',
    ]);
  });

  it('says the filter matched nothing, and holds the view the page chose', () => {
    const { lines } = recorded(SCRIPTED);
    const onViewChange = vi.fn();
    const { container } = draw(
      <TranscriptViews
        lines={lines}
        members={MEMBERS}
        view="table"
        onViewChange={onViewChange}
      />,
    );
    expect(
      container
        .querySelector('[data-transcript-views]')!
        .getAttribute('data-transcript-views'),
    ).toBe('table');
    fireEvent.click(container.querySelector('[data-transcript-failed-only]')!);
    expect(
      container.querySelector('[data-transcript-table]')!.textContent,
    ).toBe('No row matches the filter.');
    fireEvent.click(view(container, 'lines'));
    expect(onViewChange).toHaveBeenCalledWith('lines');
    // Held by the page: still the table until the page says.
    expect(
      container
        .querySelector('[data-transcript-views]')!
        .getAttribute('data-transcript-views'),
    ).toBe('table');
  });
});
