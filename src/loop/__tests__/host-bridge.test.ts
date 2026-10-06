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
  type AppEmbedHost,
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
    const host: AppEmbedHost = {
      functions: { open_ticket: openTicket },
      onEvent,
    };
    const tools = hostFrontendTools(RULED, () => host);
    expect(
      await tool(tools, 'host_open_ticket').handler!({ title: 'Late' }),
    ).toEqual({ result: { ticket: 42, title: 'Late' } });
    expect(openTicket).toHaveBeenCalledWith({ title: 'Late' });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'action',
      detail: {
        function: 'open_ticket',
        arguments: { title: 'Late' },
        result: { ticket: 42, title: 'Late' },
      },
    });
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
    }));
    expect(await tool(tools, 'host_open_ticket').handler!({})).toEqual({
      error: 'The page offers no function open_ticket: it was not called.',
    });
    const failing = hostFrontendTools(RULED, () => ({
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
