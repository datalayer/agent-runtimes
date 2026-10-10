/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The host page and an embedded application (LOOP D-10): what the page
 * passes, read with `host_context` for the names the Appspec gives; the
 * page's functions called as `host_<name>`, each as the rule naming it
 * decides — one no rule names refused before the page is called; what it
 * did told to the page; the Appspec read, written and checked.
 */

import { describe, expect, it, vi } from 'vitest';
import { checkApp } from '../apps/checks';
import { dumpAppspec, emptyAppspec, parseAppspec } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';
import {
  HOST_CONTEXT_TOOL,
  hostFrontendTools,
  hostRefused,
  hostToolsOf,
  hostUserRunProps,
  signedUser,
  type AppEmbedHost,
  fetchUserToken,
} from '../embed/hostBridge';

const HOST = {
  context: ['user', 'page', 'plan'],
  functions: [
    {
      name: 'open_ticket',
      description: 'Open a ticket in the helpdesk',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' } },
      },
    },
    {
      name: 'refund',
      description: 'Refund an order',
      parameters: { type: 'object', properties: {} },
    },
  ],
};

function hosted(rules: AppSpec['rules'] = []): AppSpec {
  const app = emptyAppspec('chat');
  app.id = 'shop-help';
  app.name = 'Shop help';
  app.agent = 'support-agent';
  app.deployment = {
    embedded: { mode: 'assistant', origins: [], host: HOST },
  };
  app.rules = rules;
  return app;
}

const RULED = hosted([
  {
    action: 'Read what the page says',
    appliesTo: ['host_context'],
    behaviour: 'do_it',
  },
  {
    action: 'Open a ticket',
    appliesTo: ['host_open_ticket'],
    behaviour: 'ask_first',
  },
]);

const tool = (tools: ReturnType<typeof hostFrontendTools>, name: string) =>
  tools.find(each => each.name === name)!;

describe('the tools of the host', () => {
  it('are host_context and host_<name>, for what the Appspec names', () => {
    expect(hostToolsOf(HOST)).toEqual([
      'host_context',
      'host_open_ticket',
      'host_refund',
    ]);
    expect(hostToolsOf({ context: [], functions: [] })).toEqual([]);
    expect(hostToolsOf(undefined)).toEqual([]);
    const tools = hostFrontendTools(RULED, () => ({}));
    expect(tools.map(each => [each.name, each.location])).toEqual([
      ['host_context', 'frontend'],
      ['host_open_ticket', 'frontend'],
      ['host_refund', 'frontend'],
    ]);
    expect(tool(tools, 'host_open_ticket').parameters).toEqual(
      HOST.functions[0].parameters,
    );
    expect(hostFrontendTools(emptyAppspec('chat'), () => ({}))).toEqual([]);
  });

  it('read what the page passes now, only the values the Appspec names', async () => {
    let passed: Record<string, unknown> = {
      user: { name: 'Ana' },
      secret: 'never',
    };
    const tools = hostFrontendTools(RULED, () => ({ context: () => passed }));
    const read = tool(tools, HOST_CONTEXT_TOOL).handler!;
    expect(await read({})).toEqual({
      values: { user: { name: 'Ana' } },
      unsaid: ['page', 'plan'],
    });
    passed = { user: 'Ana', page: '/orders/7', plan: 'pro' };
    expect(await read({})).toEqual({
      values: { user: 'Ana', page: '/orders/7', plan: 'pro' },
    });
  });

  it('call the page’s function as the rule naming it decides, and tell the page', async () => {
    const onEvent = vi.fn();
    const openTicket = vi.fn(async (args: Record<string, unknown>) => ({
      ticket: 42,
      title: args.title,
    }));
    const ask = vi.fn(() => true);
    const host: AppEmbedHost = {
      functions: { open_ticket: openTicket },
      onEvent,
      ask,
    };
    const tools = hostFrontendTools(RULED, () => host);
    expect(
      await tool(tools, 'host_open_ticket').handler!({ title: 'Late' }),
    ).toEqual({ result: { ticket: 42, title: 'Late' } });
    expect(openTicket).toHaveBeenCalledWith({ title: 'Late' });
    // Its rule says ask first: the person on the page was asked.
    expect(ask).toHaveBeenCalledWith({
      function: 'open_ticket',
      arguments: { title: 'Late' },
      sentence: 'Open a ticket? (open_ticket with {"title":"Late"})',
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'action',
      detail: {
        function: 'open_ticket',
        arguments: { title: 'Late' },
        result: { ticket: 42, title: 'Late' },
      },
    });
  });

  it('refuse a call the person did not allow, and ask nobody for one done', async () => {
    const openTicket = vi.fn();
    const tools = hostFrontendTools(RULED, () => ({
      functions: { open_ticket: openTicket },
      ask: async () => false,
    }));
    expect(await tool(tools, 'host_open_ticket').handler!({})).toEqual({
      error:
        'The person did not allow host_open_ticket: the page was not called.',
    });
    expect(openTicket).not.toHaveBeenCalled();
    // No page asker and no confirm to ask with: refused too.
    vi.stubGlobal('window', {});
    const silent = hostFrontendTools(RULED, () => ({
      functions: { open_ticket: openTicket },
    }));
    expect(await tool(silent, 'host_open_ticket').handler!({})).toEqual({
      error:
        'The person did not allow host_open_ticket: the page was not called.',
    });
    vi.unstubAllGlobals();
    const ask = vi.fn(() => true);
    const done = hostFrontendTools(
      hosted([
        { action: 'Refund', appliesTo: ['host_refund'], behaviour: 'do_it' },
      ]),
      () => ({ functions: { refund: () => 'ok' }, ask }),
    );
    expect(await tool(done, 'host_refund').handler!({})).toEqual({
      result: 'ok',
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it('refuse, before the page is called, a tool no rule names', async () => {
    const onEvent = vi.fn();
    const refund = vi.fn();
    const tools = hostFrontendTools(RULED, () => ({
      functions: { refund },
      onEvent,
      context: () => ({ user: 'Ana' }),
    }));
    expect(await tool(tools, 'host_refund').handler!({})).toEqual({
      error: hostRefused('host_refund'),
    });
    expect(refund).not.toHaveBeenCalled();
    expect(onEvent.mock.calls[0][0].detail.error).toBe(
      'No rule of this application names host_refund: it is left to the person, and the page was not called.',
    );
    // Without the rule that names it, the page's values are not read either.
    const unruled = hostFrontendTools(hosted(), () => ({
      context: () => ({ user: 'Ana' }),
    }));
    expect(await tool(unruled, HOST_CONTEXT_TOOL).handler!({})).toEqual({
      error: hostRefused(HOST_CONTEXT_TOOL),
    });
  });

  it('say a function the page does not offer, and one that failed', async () => {
    const tools = hostFrontendTools(RULED, () => ({
      functions: {},
      ask: () => true,
    }));
    expect(await tool(tools, 'host_open_ticket').handler!({})).toEqual({
      error: 'The page offers no function open_ticket: it was not called.',
    });
    const failing = hostFrontendTools(RULED, () => ({
      ask: () => true,
      functions: {
        open_ticket: () => {
          throw new Error('the helpdesk is down');
        },
      },
    }));
    expect(await tool(failing, 'host_open_ticket').handler!({})).toEqual({
      error: "The page's open_ticket failed: the helpdesk is down",
    });
  });
});

describe('the Appspec of the host', () => {
  it('is read and written again, parameters left out when there are none', () => {
    const written = dumpAppspec(RULED);
    expect(
      (written.deployment as { embedded: { host: unknown } }).embedded.host,
    ).toEqual({
      context: ['user', 'page', 'plan'],
      functions: [
        {
          name: 'open_ticket',
          description: 'Open a ticket in the helpdesk',
          parameters: HOST.functions[0].parameters,
        },
        { name: 'refund', description: 'Refund an order' },
      ],
    });
    expect(parseAppspec(written).app.deployment.embedded?.host).toEqual(HOST);
  });

  it('is checked: a rule may name its tools, and one no rule names is said', () => {
    const problems = (app: AppSpec) =>
      checkApp(app).problems.filter(problem => /host/.test(problem));
    expect(problems(RULED)).toEqual([
      'No rule names “host_refund”, which the host page offers it: it is left to the person until a rule decides it.',
    ]);
    const wrong = hosted();
    wrong.deployment.embedded!.host = {
      context: ['user', 'user', 'Page'],
      functions: [
        {
          name: 'Open Ticket',
          description: ' ',
          parameters: { type: 'string' },
        },
      ],
    };
    expect(problems(wrong)).toEqual(
      expect.arrayContaining([
        'Cannot use “Page” as a value of the host: lower-case letters, digits and `_`.',
        'The host’s values are named once each.',
        'Cannot use “Open Ticket” as a host function: lower-case letters, digits and `_`.',
        'The host function “Open Ticket” says what it does.',
        'The host function “Open Ticket” takes its arguments as a JSON Schema of `type: object`.',
      ]),
    );
  });
});

describe('who its user is (D-21)', () => {
  const signed = (): AppSpec => {
    const app = hosted(RULED.rules);
    app.deployment.embedded!.host = { ...HOST, user: 'signed' };
    return app;
  };

  it('is what the page says unless the Appspec says signed', () => {
    expect(signedUser(HOST)).toBe(false);
    expect(signedUser({ ...HOST, user: 'signed' })).toBe(true);
    expect(signedUser(undefined)).toBe(false);
    expect(hostUserRunProps(RULED, () => ({}))).toBeUndefined();
  });

  it('sends the token the host signed with every run, the newest', () => {
    let token: string | undefined = 'one.two.three';
    const runProps = hostUserRunProps(signed(), () => ({
      userToken: () => token,
    }))!;
    expect(runProps.id).toBe('host-user');
    expect(runProps.props()).toEqual({
      loop: { user_token: 'one.two.three' },
    });
    token = 'four.five.six';
    expect(runProps.props()).toEqual({ loop: { user_token: 'four.five.six' } });
    // None given: nothing sent, and the runtime refuses the session.
    token = '  ';
    expect(runProps.props()).toEqual({});
    expect(hostUserRunProps(signed(), () => ({}))!.props()).toEqual({});
  });

  it('is written, read back and checked', () => {
    const written = dumpAppspec(signed());
    expect(
      (written.deployment as { embedded: { host: { user: string } } }).embedded
        .host.user,
    ).toBe('signed');
    expect(parseAppspec(written).app.deployment.embedded?.host?.user).toBe(
      'signed',
    );
    // Claimed is what it is unless said: not written.
    expect(
      'user' in
        (dumpAppspec(RULED).deployment as { embedded: { host: object } })
          .embedded.host,
    ).toBe(false);
    const wrong = signed();
    wrong.deployment.embedded!.host!.user = 'verified' as 'signed';
    expect(
      checkApp(wrong).problems.filter(problem => /host/.test(problem)),
    ).toContain(
      '“verified” is not how the host’s user is taken: claimed or signed.',
    );
  });
});

describe('fetchUserToken (D-21; STUDIO A-18 to A-20)', () => {
  it('asks ai-agents to sign the person, with their own token, and says its refusal', async () => {
    const fetcher = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ user_token: 'u.t.k', exp: 2000 }), {
          status: 200,
        }),
    );
    await expect(
      fetchUserToken('https://r1.datalayer.run/', 'd 1', 'tok', fetcher),
    ).resolves.toEqual({ token: 'u.t.k', exp: 2000 });
    expect(fetcher).toHaveBeenCalledWith(
      'https://r1.datalayer.run/api/ai-agents/v1/apps/deployments/d%201/user-token',
      { method: 'POST', headers: { Authorization: 'Bearer tok' } },
    );
    const refusing = async () =>
      new Response(
        JSON.stringify({ detail: 'Only a person is signed as themselves.' }),
        { status: 403 },
      );
    await expect(
      fetchUserToken('https://r1', 'd', 'tok', refusing),
    ).rejects.toThrow('Only a person is signed as themselves.');
    const empty = async () => new Response('{}', { status: 200 });
    await expect(
      fetchUserToken('https://r1', 'd', 'tok', empty),
    ).rejects.toThrow('ai-agents answered no user token.');
  });
});
