/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Scenes example's selection (SCENES S3-02): the page holds the line's
 * key, so that a click on an edge of the graph selects in the transcript what
 * a click in the transcript selects on the graph.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SceneTranscriptLine, SelectedEdge } from '../../components/teams';

/** What the page last handed the graph and the view. */
const seen = vi.hoisted(() => ({
  lines: [] as unknown[],
  graph: {} as Record<string, unknown>,
  view: {} as Record<string, unknown>,
}));

vi.mock('../../components/teams', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../components/teams')>();
  return {
    ...actual,
    A2ATeamGraph: (props: Record<string, unknown>) => {
      seen.graph = props;
      return null;
    },
    SceneView: (props: Record<string, unknown>) => {
      seen.view = props;
      return <>{props.children as React.ReactNode}</>;
    },
    useSceneTranscript: () => seen.lines,
  };
});
vi.mock('../../runtimes/browser/a2aPeer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../runtimes/browser/a2aPeer')>();
  return {
    ...actual,
    connectA2APeer: async () => {
      throw new Error('fetch failed');
    },
  };
});
vi.mock('../../runtimes/browser/model', () => ({
  createBrowserModel: () => ({ specificationVersion: 'v2' }),
}));
vi.mock('../utils/themedProvider', async () => {
  const { ThemeProvider } = await import('@primer/react');
  return {
    ThemedProvider: ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    ),
  };
});
vi.mock('../../hooks/useBrowserInference', () => ({
  useBrowserInference: () => ({
    inference: { inferenceUrl: 'http://inference.test', token: 'visitor' },
    needsSignIn: false,
    anonymous: { status: 'idle' },
    inferenceUrl: 'http://inference.test',
  }),
}));

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  seen.lines = [];
});

const graphSelected = () => seen.graph.selected as SelectedEdge | null;
const viewSelected = () => seen.view.selected as string | null;

describe('the Scenes example’s selection', () => {
  it('selects an edge’s latest line in the transcript, and the edge of a line selected there', async () => {
    const { ScenesExample } = await import('../ScenesExample');
    const { container, rerender } = render(<ScenesExample />);
    await act(async () => {
      fireEvent.click(
        container.querySelector('[data-scene-tab="sales-and-accounting"]')!,
      );
    });
    const [asker, asked] = seen.view.members as { id: string; name: string }[];
    const line: SceneTranscriptLine = {
      key: 'a2:asked',
      at: 2,
      from: asker.name,
      to: asked.name,
      kind: 'asked',
      text: 'Open invoices?',
    };
    seen.lines = [
      { ...line, key: 'a1:asked', at: 1 },
      line,
      {
        key: 'p:asked',
        at: 3,
        from: 'You',
        to: asker.name,
        kind: 'asked',
        text: 'Hi',
      },
    ];
    rerender(<ScenesExample />);
    expect(viewSelected()).toBeNull();

    const onSelectEdge = seen.graph.onSelectEdge as (
      edge: Pick<SelectedEdge, 'from' | 'to'>,
    ) => void;
    act(() => onSelectEdge({ from: asker.id, to: asked.id }));
    expect(viewSelected()).toBe('a2:asked');
    expect(graphSelected()).toMatchObject({
      from: asker.id,
      to: asked.id,
      key: 'a2:asked',
    });

    // Selected in the transcript: the edge follows, or goes for a line on none.
    const onSelect = seen.view.onSelect as (
      selection: { key: string } | null,
    ) => void;
    act(() => onSelect({ key: 'a1:asked' }));
    expect(viewSelected()).toBe('a1:asked');
    expect(graphSelected()?.key).toBe('a1:asked');
    act(() => onSelect({ key: 'p:asked' }));
    expect(viewSelected()).toBe('p:asked');
    expect(graphSelected()).toBeNull();
    act(() => onSelect(null));
    expect(viewSelected()).toBeNull();

    // An edge with nothing on it selects nothing.
    act(() => onSelect({ key: 'a1:asked' }));
    act(() => onSelectEdge({ from: 'no-one', to: 'no-one-else' }));
    expect(viewSelected()).toBeNull();
    expect(graphSelected()).toBeNull();
  });
});
