/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of N in the page (LOOP A-08): the entry asks each peer with a tool
 * of its own, its instructions naming each; each peer keeps its own persona,
 * history, flow and calls; and an entry on a runtime is asked over A2A from
 * the page itself.
 */

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { A2APeer, A2APeerEvent } from '../../../runtimes/browser/a2aPeer';
import {
  ACCOUNTING_APP_0_0_1,
  CHANGE_DETECTION_APP_0_0_1,
  DISASTER_ASSESSMENT_APP_0_0_1,
  EVENT_RESPONSE_APP_0_0_1,
  MONTH_END_CLOSE_APP_0_0_1,
  SALES_APP_0_0_1,
} from '../../../specs/apps';

/** The tools the entry asks with, as the hook makes them, by the peer's name. */
const told = vi.hoisted(() => ({
  tools: new Map<string, (event: A2APeerEvent) => void>(),
  asked: [] as { peer: string; request: string }[],
  answer: 'The imagery shows a flooded plain.',
}));
vi.mock('../../../runtimes/browser/a2aPeer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../runtimes/browser/a2aPeer')>();
  return {
    ...actual,
    a2aPeerTool: (options: {
      peer: A2APeer;
      onEvent?: (event: A2APeerEvent) => void;
    }) => {
      if (options.onEvent) {
        told.tools.set(options.peer.card.name, options.onEvent);
      }
      return { description: 'ask', inputSchema: {}, execute: async () => ({}) };
    },
    // The entry on a runtime: asked directly, scripted.
    askA2APeer: async (
      peer: A2APeer,
      request: string,
      options: { onEvent?: (event: A2APeerEvent) => void },
    ) => {
      told.asked.push({ peer: peer.card.name, request });
      options.onEvent?.({ phase: 'asked', request });
      options.onEvent?.({
        phase: 'working',
        taskId: 't',
        tool: {
          id: 'c1',
          name: 'earthdata_search_earth_datasets',
          ended: false,
        },
      });
      options.onEvent?.({
        phase: 'answered',
        taskId: 't',
        answer: told.answer,
        artifacts: [],
      });
      return { answer: told.answer, artifacts: [] };
    },
  };
});
/** The model is never asked here: the agent's tools are what is checked. */
const agents = vi.hoisted(() => ({
  made: [] as { instructions: string; tools: string[] }[],
}));
vi.mock('../../../runtimes/browser/model', () => ({
  createBrowserModel: () => ({ specificationVersion: 'v2' }),
}));
vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    ToolLoopAgent: class {
      constructor(options: {
        instructions: string;
        tools: Record<string, unknown>;
      }) {
        agents.made.push({
          instructions: options.instructions,
          tools: Object.keys(options.tools),
        });
      }
    },
  };
});

afterEach(() => {
  cleanup();
  told.tools.clear();
  told.asked.length = 0;
  agents.made.length = 0;
});

const peerNamed = (name: string) =>
  ({ card: { name, skills: [] }, skill: { name } }) as unknown as A2APeer;

const EARTHDATA = {
  id: 'earthdata',
  name: 'NASA Earthdata',
  label: 'Earthdata',
  via: 'via MCP',
  tools: ['search_earth_datasets', 'search_earth_datagranules'],
  prefix: 'earthdata_',
};

describe('a team of three', () => {
  it('asks each peer with a tool of its own, its instructions naming each', async () => {
    const { useA2ATeam, teamInstructions, askToolOf } =
      await import('../useA2ATeam');
    const peers = [
      {
        app: DISASTER_ASSESSMENT_APP_0_0_1,
        peer: peerNamed('Disaster assessment'),
        connections: [EARTHDATA],
      },
      {
        app: CHANGE_DETECTION_APP_0_0_1,
        peer: peerNamed('Change detection'),
        connections: [EARTHDATA],
      },
    ];
    const { result } = renderHook(() =>
      useA2ATeam({
        entry: EVENT_RESPONSE_APP_0_0_1,
        peers,
        inference: {} as never,
      }),
    );
    expect(result.current.ready).toBe(true);
    expect(result.current.peers.map(peer => peer.askTool)).toEqual([
      'ask_disaster_assessment',
      'ask_change_detection',
    ]);
    expect(askToolOf('change-detection')).toBe('ask_change_detection');
    expect(agents.made.at(-1)?.tools).toEqual([
      'ask_disaster_assessment',
      'ask_change_detection',
    ]);
    const instructions = agents.made.at(-1)?.instructions ?? '';
    expect(instructions.startsWith(EVENT_RESPONSE_APP_0_0_1.instructions)).toBe(
      true,
    );
    expect(instructions).toContain(
      'ask Disaster assessment with `ask_disaster_assessment`, Change detection with `ask_change_detection`',
    );
    // A team of two keeps the entry's instructions as they are.
    expect(
      teamInstructions(SALES_APP_0_0_1, [
        { app: ACCOUNTING_APP_0_0_1, askTool: 'ask_accounting' },
      ]),
    ).toBe(SALES_APP_0_0_1.instructions);
  });

  it('is not ready until every peer is reached', async () => {
    const { useA2ATeam } = await import('../useA2ATeam');
    const { result } = renderHook(() =>
      useA2ATeam({
        entry: EVENT_RESPONSE_APP_0_0_1,
        peers: [
          {
            app: DISASTER_ASSESSMENT_APP_0_0_1,
            peer: peerNamed('Disaster assessment'),
          },
          { app: CHANGE_DETECTION_APP_0_0_1, peer: null },
        ],
        inference: {} as never,
      }),
    );
    expect(result.current.ready).toBe(false);
    expect(result.current.peers.map(peer => peer.connected)).toEqual([
      true,
      false,
    ]);
  });

  it('keeps each peer its own persona, history, flow and calls', async () => {
    const { useA2ATeam, askedLine } = await import('../useA2ATeam');
    const peers = [
      {
        app: DISASTER_ASSESSMENT_APP_0_0_1,
        peer: peerNamed('Disaster assessment'),
        connections: [EARTHDATA],
      },
      {
        app: CHANGE_DETECTION_APP_0_0_1,
        peer: peerNamed('Change detection'),
        connections: [EARTHDATA],
        greeting: 'I compare before and after.',
      },
    ];
    const { result } = renderHook(() =>
      useA2ATeam({
        entry: EVENT_RESPONSE_APP_0_0_1,
        peers,
        inference: {} as never,
      }),
    );
    // Before anything is asked: the one whose balloon opens first greets.
    expect(result.current.peers[0].persona.state).toBe('idle');
    expect(result.current.peers[1].persona).toMatchObject({
      state: 'greeting',
      saying: 'I compare before and after.',
      insist: true,
    });
    const assessor = told.tools.get('Disaster assessment');
    const detector = told.tools.get('Change detection');
    expect(assessor && detector).toBeTruthy();
    act(() => {
      assessor?.({ phase: 'asked', request: 'Valencia, 29 October 2024?' });
      assessor?.({
        phase: 'working',
        taskId: 'a',
        tool: {
          id: 'a1',
          name: 'earthdata_search_earth_datasets',
          ended: false,
        },
      });
    });
    // The assessor works, on Earthdata; the detector is untouched.
    const [assessing, detecting] = result.current.peers;
    expect(assessing.flow).toBe('asking');
    expect(assessing.persona.state).toBe('working');
    expect(assessing.persona.tool).toMatchObject({
      name: 'search_earth_datasets',
      phase: 'running',
    });
    expect(detecting.flow).toBe('still');
    expect(detecting.persona.state).toBe('greeting');
    expect(result.current.flows).toEqual({ 'disaster-assessment': 'asking' });
    expect(result.current.calls).toEqual([
      expect.objectContaining({
        member: 'disaster-assessment',
        connection: 'earthdata',
        tool: 'earthdata_search_earth_datasets',
      }),
    ]);
    // The first peer's state, as a team of two reads it.
    expect(result.current.peerPersona).toBe(assessing.persona);
    expect(result.current.flow).toBe('asking');
    act(() => {
      detector?.({ phase: 'asked', request: 'Valencia, before and after?' });
      detector?.({
        phase: 'working',
        taskId: 'd',
        tool: {
          id: 'd1',
          name: 'earthdata_search_earth_datagranules',
          ended: false,
        },
      });
    });
    // The detector's request does not end the assessor's call.
    expect(result.current.calls.map(call => call.member)).toEqual([
      'disaster-assessment',
      'change-detection',
    ]);
    // Asked, it says what it will look in; a tool step without a note keeps it.
    expect(result.current.peers[1].persona.saying).toBe(askedLine([EARTHDATA]));
    expect(result.current.peers[1].persona.saying).toBe(
      'On it. Let me look in Earthdata.',
    );
    expect(result.current.peers[1].history.map(item => item.id)).toEqual([
      'peer-2',
      'peer-tool:d1',
    ]);
    act(() => {
      assessor?.({
        phase: 'answered',
        taskId: 'a',
        answer: '12 km² flooded.',
        artifacts: [],
      });
    });
    expect(result.current.peers[0].report).toBe('12 km² flooded.');
    expect(result.current.peers[0].flow).toBe('answering');
    expect(result.current.peers[1].report).toBeNull();
    expect(result.current.report).toBe('12 km² flooded.');
    expect(result.current.peers[0].history.map(item => item.id)).toEqual([
      'peer-1',
      'peer-tool:a1',
      'peer-3',
    ]);
    // Sent away by its own hand.
    act(() => result.current.peers[1].setAway(true));
    expect(result.current.peers[1].persona.away).toBe(true);
    expect(result.current.peers[0].persona.away).toBe(false);
  });

  it('says what a member does when asked, by what it reaches', async () => {
    const { askedLine } = await import('../useA2ATeam');
    expect(askedLine([])).toBe('On it.');
    expect(askedLine([EARTHDATA])).toBe('On it. Let me look in Earthdata.');
    expect(
      askedLine([
        {
          id: 'odoo-accounting',
          name: 'Odoo Accounting',
          label: 'Odoo',
          tools: [],
        },
      ]),
    ).toBe('On it. Let me read the books.');
  });
});

describe('an entry on a runtime', () => {
  it('is asked over A2A from the page, its persona following what it tells', async () => {
    const { useA2ATeam } = await import('../useA2ATeam');
    const { result, rerender } = renderHook(
      ({ peer }: { peer: A2APeer | null }) =>
        useA2ATeam({
          entry: MONTH_END_CLOSE_APP_0_0_1,
          entryPeer: peer,
          inference: {} as never,
        }),
      { initialProps: { peer: null } },
    );
    // No agent in the browser, and nobody to ask yet.
    expect(result.current.ready).toBe(false);
    expect(agents.made).toHaveLength(0);
    expect(result.current.peers).toEqual([]);
    rerender({ peer: peerNamed('Month-end close') });
    expect(result.current.ready).toBe(true);
    await act(async () => {
      await result.current.send('How did the month close?');
    });
    expect(told.asked).toEqual([
      { peer: 'Month-end close', request: 'How did the month close?' },
    ]);
    expect(result.current.turns).toEqual([
      { role: 'user', text: 'How did the month close?' },
      { role: 'assistant', text: told.answer },
    ]);
    expect(result.current.entryPersona).toMatchObject({
      state: 'idle',
      saying: told.answer,
      insist: true,
    });
    expect(result.current.entryHistory).toHaveLength(2);
    expect(result.current.busy).toBe(false);
    // Its own calls are not a peer's: nothing on a link.
    expect(result.current.flows).toEqual({});
    expect(result.current.calls).toEqual([]);
  });
});
