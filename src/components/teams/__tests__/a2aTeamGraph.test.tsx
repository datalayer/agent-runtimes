/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team over A2A as a graph: the edge flows toward the peer while the entry
 * asks, back while the peer answers, and is still otherwise.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANSWER_SHOWN_MS, flowAfter, flowEnds } from '../a2aTeamFlow';
import { A2ATeamGraph, flowWords, teamViewport } from '../A2ATeamGraph';
import { AT_REST, balloonLine, type A2ATeamPersona } from '../useA2ATeam';
import type { A2ATeamFlow } from '../a2aTeamFlow';

beforeAll(() => {
  // React Flow measures its box; jsdom has no layout.
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

afterEach(() => cleanup());

describe('flowAfter', () => {
  it('flows toward the peer while a request is out', () => {
    expect(flowAfter({ phase: 'asked', request: 'Open invoices?' })).toEqual({
      flow: 'asking',
    });
    expect(
      flowAfter({ phase: 'working', taskId: 't', note: 'Calling odoo' }),
    ).toEqual({ flow: 'asking' });
  });

  it('flows back for a moment when the peer answers', () => {
    expect(
      flowAfter({ phase: 'answered', taskId: 't', answer: '3 invoices' }),
    ).toEqual({ flow: 'answering', holdMs: ANSWER_SHOWN_MS });
  });

  it('is still when a request fails', () => {
    expect(flowAfter({ phase: 'failed', error: 'refused' })).toEqual({
      flow: 'still',
    });
  });

  it('says which member a message leaves and reaches', () => {
    expect(flowEnds('asking', 'sales', 'accounting')).toEqual({
      from: 'sales',
      to: 'accounting',
    });
    expect(flowEnds('answering', 'sales', 'accounting')).toEqual({
      from: 'accounting',
      to: 'sales',
    });
    expect(flowEnds('still', 'sales', 'accounting')).toBeUndefined();
  });
});

describe('teamViewport', () => {
  it('never draws larger than drawn, and shrinks to a phone', () => {
    expect(teamViewport(2000).zoom).toBe(1);
    const phone = teamViewport(358);
    expect(phone.zoom).toBeLessThan(1);
    expect(phone.x).toBeCloseTo(0);
  });
});

describe('balloonLine', () => {
  it('keeps a balloon to a line', () => {
    expect(balloonLine('a  b\n c')).toBe('a b c');
    expect(balloonLine('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

function member(id: string, name: string, persona: A2ATeamPersona) {
  return {
    id,
    name,
    character: id === 'sales' ? 'paperclip' : 'wizard',
    where: id === 'sales' ? 'in your browser' : 'on a runtime',
    persona,
  };
}

function Graph({ flow }: { flow: A2ATeamFlow }) {
  return (
    <A2ATeamGraph
      entry={member('sales', 'Sales', { ...AT_REST, state: 'waiting' })}
      peer={member('accounting', 'Accounting', {
        ...AT_REST,
        state: 'working',
      })}
      flow={flow}
      connected
      label="A2A · Accounting"
    />
  );
}

describe('A2ATeamGraph', () => {
  it('draws both members, their state and where they run', () => {
    const { container } = render(<Graph flow="still" />);
    const sales = container.querySelector('[data-team-member="sales"]');
    const accounting = container.querySelector(
      '[data-team-member="accounting"]',
    );
    expect(sales?.getAttribute('data-member-state')).toBe('waiting');
    expect(accounting?.getAttribute('data-member-state')).toBe('working');
    expect(sales?.textContent).toContain('in your browser');
    expect(accounting?.textContent).toContain('on a runtime');
    expect(
      container
        .querySelector('[data-a2a-team-graph]')
        ?.getAttribute('data-a2a-flow'),
    ).toBe('still');
  });

  it('says the way a message goes, and follows the flow', () => {
    const { container, rerender } = render(<Graph flow="asking" />);
    const graph = () => container.querySelector('[data-a2a-team-graph]');
    expect(graph()?.getAttribute('data-a2a-flow')).toBe('asking');
    expect(graph()?.textContent).toContain('Sales asks Accounting');
    act(() => rerender(<Graph flow="answering" />));
    expect(graph()?.getAttribute('data-a2a-flow')).toBe('answering');
    expect(graph()?.textContent).toContain('Accounting answers Sales');
    act(() => rerender(<Graph flow="still" />));
    expect(graph()?.textContent).not.toContain('answers');
  });

  it('words a flow for the edge and for a screen reader', () => {
    expect(flowWords('asking', 'Sales', 'Accounting')).toBe(
      'Sales asks Accounting',
    );
    expect(flowWords('answering', 'Sales', 'Accounting')).toBe(
      'Accounting answers Sales',
    );
    expect(flowWords('still', 'Sales', 'Accounting')).toBe('');
  });
});
