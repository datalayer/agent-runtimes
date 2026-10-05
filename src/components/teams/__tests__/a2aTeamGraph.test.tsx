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
import {
  ANSWER_SHOWN_MS,
  CALL_SHOWN_MS,
  callsAfter,
  connectionOfTool,
  flowAfter,
  flowEnds,
  pruneCalls,
  toolWords,
  type A2ATeamCall,
  type A2ATeamConnection,
} from '../a2aTeamFlow';
import { ReactFlowProvider } from '@xyflow/react';
import {
  A2ATeamGraph,
  CallEdge,
  flowWords,
  teamViewport,
} from '../A2ATeamGraph';
import { teamConnectionsOf } from '../teamConnections';
import { AT_REST, balloonLine, type A2ATeamPersona } from '../useA2ATeam';
import type { A2ATeamFlow } from '../a2aTeamFlow';
import type { A2APeerEvent } from '../../../runtimes/browser/a2aPeer';
import { ACCOUNTING_APP_0_0_1 } from '../../../specs/apps';

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
      flowAfter({
        phase: 'answered',
        taskId: 't',
        answer: '3 invoices',
        artifacts: [],
      }),
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

const ODOO: A2ATeamConnection = {
  id: 'odoo-accounting',
  name: 'Odoo Accounting',
  label: 'Odoo',
  emoji: '🧮',
  via: 'via MCP',
  tools: ['odoo_accounting_list_invoices', 'odoo_accounting_trial_balance'],
  prefix: 'odoo_accounting_',
};

const call = (name: string, ended = false, id = 'c1'): A2APeerEvent => ({
  phase: 'working',
  taskId: 't',
  tool: { id, name, ended },
});

describe("Accounting's connections", () => {
  it('are read from its Appspec: the odoo-accounting server, its mark and its tools', () => {
    const [odoo, ...others] = teamConnectionsOf(ACCOUNTING_APP_0_0_1);
    expect(others).toEqual([]);
    expect(odoo).toMatchObject({
      id: 'odoo-accounting',
      name: 'Odoo Accounting',
      label: 'Odoo',
      icon: '@datalayer/icons-react:odoo',
      via: 'via MCP',
      prefix: 'odoo_accounting_',
    });
    expect(odoo.tools).toContain('odoo_accounting_list_invoices');
  });

  it('own the tools named for them, with or without a host prefix', () => {
    expect(connectionOfTool('odoo_accounting_list_invoices', [ODOO])).toBe(
      ODOO,
    );
    expect(
      connectionOfTool('odoo-accounting_odoo_accounting_trial_balance', [ODOO]),
    ).toBe(ODOO);
    expect(connectionOfTool('odoo_accounting_new_tool', [ODOO])).toBe(ODOO);
    expect(connectionOfTool('tavily_search', [ODOO])).toBeUndefined();
    expect(toolWords('odoo_accounting_list_invoices', ODOO)).toBe(
      'list invoices',
    );
  });
});

describe('callsAfter', () => {
  it('keeps a call from its start to its end, and shows a quick one a moment longer', () => {
    let calls = callsAfter(
      [],
      call('odoo_accounting_list_invoices'),
      'accounting',
      [ODOO],
      1000,
    ).calls;
    expect(calls).toEqual([
      {
        member: 'accounting',
        connection: 'odoo-accounting',
        tool: 'odoo_accounting_list_invoices',
        id: 'c1',
        started: 1000,
      },
    ]);
    // Ended at once: still shown until CALL_SHOWN_MS has passed.
    const quick = callsAfter(
      calls,
      call('odoo_accounting_list_invoices', true),
      'accounting',
      [ODOO],
      1200,
    );
    expect(quick.holdMs).toBe(CALL_SHOWN_MS - 200);
    expect(quick.calls[0].ended).toBe(true);
    expect(pruneCalls(quick.calls, 1000 + CALL_SHOWN_MS)).toEqual([]);
    // Ended after it was shown long enough: gone.
    calls = callsAfter(
      calls,
      call('odoo_accounting_list_invoices', true),
      'accounting',
      [ODOO],
      1000 + CALL_SHOWN_MS + 1,
    ).calls;
    expect(calls).toEqual([]);
  });

  it('ignores the tools of nothing drawn, and ends every call with the answer', () => {
    const started = callsAfter(
      [],
      call('odoo_accounting_trial_balance'),
      'accounting',
      [ODOO],
      0,
    ).calls;
    expect(
      callsAfter(started, call('tavily_search'), 'accounting', [ODOO], 1).calls,
    ).toBe(started);
    expect(
      callsAfter(
        started,
        { phase: 'answered', taskId: 't', answer: 'done', artifacts: [] },
        'accounting',
        [ODOO],
        2,
      ).calls,
    ).toEqual([]);
  });
});

function TeamWithOdoo({ calls }: { calls: A2ATeamCall[] }) {
  return (
    <A2ATeamGraph
      entry={member('sales', 'Sales', AT_REST)}
      peer={{
        ...member('accounting', 'Accounting', {
          ...AT_REST,
          state: 'working',
        }),
        connections: [ODOO],
      }}
      flow="asking"
      connected
      calls={calls}
    />
  );
}

/** A page's graph, driven by what Accounting tells over A2A. */
function DrivenByEvents({ events }: { events: A2APeerEvent[] }) {
  let calls: A2ATeamCall[] = [];
  events.forEach((event, at) => {
    calls = callsAfter(calls, event, 'accounting', [ODOO], at * 10_000).calls;
  });
  return <TeamWithOdoo calls={calls} />;
}

describe('A2ATeamGraph with a connection', () => {
  it('draws Odoo under Accounting: its mark, its name and how it is reached', () => {
    const { container } = render(<TeamWithOdoo calls={[]} />);
    const odoo = container.querySelector(
      '[data-team-connection="odoo-accounting"]',
    );
    expect(odoo?.textContent).toContain('Odoo');
    expect(odoo?.querySelector('[data-connection-via]')?.textContent).toBe(
      'via MCP',
    );
    expect(odoo?.querySelector('[data-mark]')).not.toBeNull();
    expect(odoo?.getAttribute('data-connection-busy')).toBe('false');
    // The library's credit is not on the page.
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });

  it('flows toward Odoo while Accounting calls one of its tools, and stops when it ends', () => {
    const asked: A2APeerEvent = { phase: 'asked', request: 'Open invoices?' };
    const { container, rerender } = render(
      <DrivenByEvents
        events={[asked, call('odoo_accounting_list_invoices')]}
      />,
    );
    const graph = () => container.querySelector('[data-a2a-team-graph]');
    expect(
      container
        .querySelector('[data-team-connection="odoo-accounting"]')
        ?.getAttribute('data-connection-busy'),
    ).toBe('true');
    expect(graph()?.getAttribute('data-a2a-calls')).toBe('1');
    expect(graph()?.textContent).toContain(
      'Accounting calls Odoo · list invoices',
    );
    act(() =>
      rerender(
        <DrivenByEvents
          events={[
            asked,
            call('odoo_accounting_list_invoices'),
            call('odoo_accounting_list_invoices', true),
          ]}
        />,
      ),
    );
    expect(
      container
        .querySelector('[data-team-connection="odoo-accounting"]')
        ?.getAttribute('data-connection-busy'),
    ).toBe('false');
    expect(graph()?.getAttribute('data-a2a-calls')).toBe('0');
    expect(graph()?.textContent).not.toContain('calls Odoo');
  });

  it('under reduced motion, keeps the arrow and the words, without movement', () => {
    const { container } = render(
      <DrivenByEvents events={[call('odoo_accounting_trial_balance')]} />,
    );
    // Told to a screen reader, and on the edge, in words.
    expect(container.textContent).toContain(
      'Accounting calls Odoo · trial balance',
    );
    const css = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .join('\n');
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(
      /a2a-team-flow[^{]*a2a-team-connection-busy[^{]*\{[^}]*animation:\s*none/,
    );
  });
});

/** The edge from a member to its connection, drawn alone (jsdom measures no handles). */
function Edge({ calling }: { calling: string }) {
  return (
    <ReactFlowProvider>
      <svg>
        <CallEdge
          {...({
            id: 'accounting->accounting/odoo-accounting',
            source: 'accounting',
            target: 'accounting/odoo-accounting',
            sourceX: 100,
            sourceY: 0,
            targetX: 100,
            targetY: 44,
            data: { calling },
          } as unknown as React.ComponentProps<typeof CallEdge>)}
        />
      </svg>
    </ReactFlowProvider>
  );
}

describe('The edge to a connection', () => {
  it('is still at rest, and flows toward the connection with an arrow while a call runs', () => {
    const { container, rerender } = render(<Edge calling="" />);
    expect(container.querySelector('[data-mcp-edge-call]')).toBeNull();
    act(() => rerender(<Edge calling="list invoices" />));
    const call = container.querySelector('[data-mcp-edge-call]');
    expect(call?.getAttribute('data-mcp-edge-call')).toBe('list invoices');
    // The moving dashes, and the arrow that says the way without them.
    expect(call?.querySelector('.a2a-team-call.a2a-team-flow')).not.toBeNull();
    expect(call?.querySelectorAll('path').length).toBe(2);
    act(() => rerender(<Edge calling="" />));
    expect(container.querySelector('[data-mcp-edge-call]')).toBeNull();
  });
});

describe('A2ATeamGraph: a click on a member', () => {
  const said = (persona: Partial<A2ATeamPersona>) => ({
    ...AT_REST,
    ...persona,
  });
  function Team({
    sales,
    accounting,
    onToggle,
  }: {
    sales: Partial<A2ATeamPersona>;
    accounting: Partial<A2ATeamPersona>;
    onToggle?: () => void;
  }) {
    return (
      <A2ATeamGraph
        entry={{ ...member('sales', 'Sales', said(sales)), onToggle }}
        peer={member('accounting', 'Accounting', said(accounting))}
        flow="still"
        connected
      />
    );
  }
  const balloonOf = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-team-member="${id}"] [data-speech-balloon]`);
  const click = (container: HTMLElement, id: string) =>
    act(() => {
      container
        .querySelector<HTMLElement>(
          `[data-team-member="${id}"] [data-assistant-figure]`,
        )!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

  it('hides its balloon, and a second shows it again, member by member', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Team
        sales={{ saying: 'Hello!', insist: true }}
        accounting={{ saying: 'Ready.', insist: true }}
        onToggle={onToggle}
      />,
    );
    expect(balloonOf(container, 'sales')).not.toBeNull();
    expect(balloonOf(container, 'accounting')).not.toBeNull();
    click(container, 'sales');
    expect(balloonOf(container, 'sales')).toBeNull();
    // The other member's is its own.
    expect(balloonOf(container, 'accounting')).not.toBeNull();
    click(container, 'sales');
    expect(balloonOf(container, 'sales')).not.toBeNull();
    click(container, 'accounting');
    expect(balloonOf(container, 'accounting')).toBeNull();
    // The click is the balloon's, not the composer's.
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows a balloon that was not up, and a hidden one comes back with news', () => {
    const { container, rerender } = render(
      <Team sales={{}} accounting={{ saying: 'Ready.', insist: true }} />,
    );
    expect(balloonOf(container, 'sales')).toBeNull();
    click(container, 'sales');
    expect(balloonOf(container, 'sales')).not.toBeNull();
    click(container, 'accounting');
    expect(balloonOf(container, 'accounting')).toBeNull();
    rerender(
      <Team
        sales={{}}
        accounting={{ saying: 'Here are the open invoices.', insist: true }}
      />,
    );
    expect(balloonOf(container, 'accounting')).not.toBeNull();
  });
});
