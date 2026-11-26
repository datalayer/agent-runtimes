/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation's switches over the session API (the user, 19 November
 * 2026): read once its session is held, each switch a PUT for that
 * conversation alone, with the caller's token, and a refused one said in the
 * runtime's sentence, never dropped.
 */

// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useConversationSwitches } from '../useConversationSwitches';
import {
  appSessionsClient,
  type ConversationSwitchesState,
} from '../../portable/sessions';

afterEach(cleanup);

const EMPTY: ConversationSwitchesState = {
  mcp_tools: {},
  mcp_approved: {},
  skills: {},
  skills_approved: {},
};

type Asked = { method: string; url: string; body?: unknown; auth?: string };

/** A runtime that keeps one conversation's switches, and refuses booking-com. */
function runtime() {
  const asked: Asked[] = [];
  let state: ConversationSwitchesState = { ...EMPTY };
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    asked.push({
      method: init?.method ?? 'GET',
      url,
      body,
      auth: (init?.headers as Record<string, string>)?.Authorization,
    });
    if (init?.method === 'PUT') {
      if (body.server === 'booking-com') {
        return new Response(
          JSON.stringify({
            detail:
              'booking-com is not running on this runtime: there is nothing of it to switch.',
          }),
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      }
      if (body.kind === 'skill') {
        state = {
          ...state,
          skills: { ...state.skills, [body.skill]: body.enabled },
        };
      }
      if (body.kind === 'server') {
        state = {
          ...state,
          mcp_tools: {
            ...state.mcp_tools,
            [body.server]: body.enabled ? ['a'] : [],
          },
        };
      }
    }
    return new Response(JSON.stringify(state), { status: 200 });
  };
  const client = appSessionsClient({
    baseUrl: 'https://r/',
    getAccessToken: () => 'visitor-token',
    fetch: fetcher,
  });
  return { asked, client };
}

function probe(props: Parameters<typeof useConversationSwitches>[0]) {
  const seen: { current?: ReturnType<typeof useConversationSwitches> } = {};
  function Probe(p: Parameters<typeof useConversationSwitches>[0]) {
    seen.current = useConversationSwitches(p);
    return null;
  }
  const view = render(<Probe {...props} />);
  return { seen, view, Probe };
}

describe('useConversationSwitches', () => {
  it('asks nothing until the runtime holds the conversation, then reads its switches', async () => {
    const { asked, client } = runtime();
    const { seen, view, Probe } = probe({
      client,
      uid: 'thread-1',
      held: false,
      skillOn: () => true,
    });
    expect(asked).toEqual([]);
    expect(seen.current?.started).toBe(false);
    view.rerender(
      <Probe client={client} uid="thread-1" held skillOn={() => true} />,
    );
    await waitFor(() => expect(seen.current?.started).toBe(true));
    expect(asked).toEqual([
      {
        method: 'GET',
        url: 'https://r/api/v1/apps/sessions/thread-1/switches',
        body: undefined,
        auth: 'Bearer visitor-token',
      },
    ]);
  });

  it('switches for the conversation, from the agent’s word, and keeps what the runtime answers', async () => {
    const { asked, client } = runtime();
    const { seen } = probe({
      client,
      uid: 'thread-1',
      held: true,
      skillOn: skill => skill === 'travel-planning',
    });
    await waitFor(() => expect(seen.current?.started).toBe(true));
    act(() => seen.current?.onToggleSkill('travel-planning'));
    await waitFor(() =>
      expect(seen.current?.skillsSwitched).toEqual({
        'travel-planning': false,
      }),
    );
    act(() => seen.current?.onToggleAllMcpServerTools('kiwi', [], false));
    await waitFor(() =>
      expect(seen.current?.enabledMcpTools.get('kiwi')).toEqual(new Set()),
    );
    expect(
      asked.filter(each => each.method === 'PUT').map(each => each.body),
    ).toEqual([
      { kind: 'skill', skill: 'travel-planning', enabled: false },
      { kind: 'server', server: 'kiwi', enabled: false },
    ]);
  });

  it('counts what only reads as approved, less what the conversation said must ask', async () => {
    const answer: ConversationSwitchesState = {
      ...EMPTY,
      mcp_approved: { overture: [], kiwi: ['search-flight'] },
      mcp_asked: { overture: ['overture_search_places'] },
      mcp_read_only: {
        overture: ['overture_search_places', 'overture_place_details'],
      },
    };
    const asked: unknown[] = [];
    const client = {
      switches: async () => answer,
      switchIn: async (_uid: string, switched: unknown) => {
        asked.push(switched);
        return answer;
      },
    };
    const { seen } = probe({
      client,
      uid: 'thread-1',
      held: true,
      skillOn: () => true,
    });
    await waitFor(() => expect(seen.current?.started).toBe(true));
    expect(seen.current?.approvedMcpTools.get('overture')).toEqual(
      new Set(['overture_place_details']),
    );
    expect(seen.current?.approvedMcpTools.get('kiwi')).toEqual(
      new Set(['search-flight']),
    );
    // A reader runs without asking: its switch asks to be asked first.
    act(() =>
      seen.current?.onToggleMcpToolApproval(
        'overture',
        'overture_place_details',
      ),
    );
    expect(asked).toEqual([
      {
        kind: 'tool_approval',
        server: 'overture',
        tool: 'overture_place_details',
        approved: false,
      },
    ]);
  });

  it('says a refused switch in the runtime’s sentence', async () => {
    const { client } = runtime();
    const { seen } = probe({
      client,
      uid: 'thread-1',
      held: true,
      skillOn: () => true,
    });
    await waitFor(() => expect(seen.current?.started).toBe(true));
    act(() => seen.current?.onToggleAllMcpServerTools('booking-com', [], true));
    await waitFor(() =>
      expect(seen.current?.refusal).toContain(
        'booking-com is not running on this runtime',
      ),
    );
  });

  it('refuses to switch before the conversation is held', () => {
    const { client } = runtime();
    const { seen } = probe({
      client,
      uid: 'thread-1',
      held: false,
      skillOn: () => true,
    });
    expect(() => seen.current?.onToggleSkill('travel-planning')).toThrow(
      /not held by its runtime yet/,
    );
  });
});
