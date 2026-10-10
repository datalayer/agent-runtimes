/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The host's functions, end to end through the bridge (STUDIO D-10): a
 * runtime stood in for asks the page to call `host_<name>`, as a runtime
 * asks the chat to run a frontend tool; the page dispatches the call as
 * `ChatBase` does — the tool found by its name among the frontend tools, its
 * handler run, the result sent back as the tool's result — and the runtime
 * answers with what came back. Under each rule naming the tool: none, or
 * *leave it to me*, refused before the page is called; *ask me first* and
 * *do it if I asked*, the person on the page asked, and refused when they
 * say no; *do it*, done and nobody asked. What the page is told (`action`)
 * follows each.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AppBehaviour, AppSpec } from '../../types/agentspecs';
import type {
  FrontendToolDefinition,
  ToolCallRequest,
  ToolExecutionResult,
} from '../../types/tools';
import { emptyAppspec } from '../apps/appspec';
import {
  hostFrontendTools,
  hostNotAllowed,
  hostRefused,
  hostTool,
  type AppEmbedHost,
} from '../embed/hostBridge';

/** The application, its page offering `open_ticket`, its rule naming the tool with `behaviour`. */
function hosted(behaviour?: AppBehaviour): AppSpec {
  const app = emptyAppspec('chat');
  app.id = 'shop-help';
  app.name = 'Shop help';
  app.agent = 'support-agent';
  app.deployment = {
    embedded: {
      mode: 'bubble',
      origins: [],
      host: {
        context: [],
        functions: [
          {
            name: 'open_ticket',
            description: 'Open a ticket in the helpdesk',
            parameters: {
              type: 'object',
              properties: { title: { type: 'string' } },
            },
          },
        ],
      },
    },
  };
  app.rules = behaviour
    ? [
        {
          action: 'Open a ticket',
          appliesTo: [hostTool('open_ticket')],
          behaviour,
        },
      ]
    : [];
  return app;
}

/**
 * The page's side, as `ChatBase` runs a frontend tool the runtime asked for:
 * the tool found by its name, its handler run with the call's arguments, and
 * the result — whatever the handler answered, a refusal included — sent back
 * to the runtime as the tool's result. A name no frontend tool has is the
 * runtime's own to run: nothing is sent.
 */
async function dispatch(
  tools: FrontendToolDefinition[],
  call: ToolCallRequest,
  sendToolResult: (
    toolCallId: string,
    result: ToolExecutionResult,
  ) => Promise<void>,
): Promise<void> {
  const tool = tools.find(each => each.name === call.toolName);
  if (!tool?.handler) {
    return;
  }
  const result = await tool.handler(call.args);
  await sendToolResult(call.toolCallId, {
    toolCallId: call.toolCallId,
    success: true,
    result,
  });
}

/**
 * A runtime stood in for. Its model calls `host_open_ticket` once; the
 * runtime hands the call to the page, waits for the tool's result, and
 * answers from it: *done* with what the page returned, or the page's own
 * sentence when the result carries `error`.
 */
function fakeRuntime(tools: FrontendToolDefinition[]) {
  const results: ToolExecutionResult[] = [];
  return {
    results,
    async run(): Promise<string> {
      const call: ToolCallRequest = {
        toolCallId: 'call-1',
        toolName: hostTool('open_ticket'),
        args: { title: 'Late order' },
        argsComplete: true,
      };
      await dispatch(tools, call, async (_id, result) => {
        results.push(result);
      });
      const back = results.at(-1)?.result as
        { result?: unknown; error?: string } | undefined;
      if (!back) {
        return 'The runtime ran it itself: no frontend tool answered.';
      }
      return back.error
        ? `Refused: ${back.error}`
        : `Done: ${JSON.stringify(back.result)}`;
    },
  };
}

/** A page: its function, what it is told, and how it answers when asked. */
function page(allow?: boolean) {
  const openTicket = vi.fn(async (args: Record<string, unknown>) => ({
    ticket: 42,
    title: args.title,
  }));
  const onEvent = vi.fn();
  const ask = vi.fn(async () => allow ?? false);
  const host: AppEmbedHost = {
    functions: { open_ticket: openTicket },
    onEvent,
    ...(allow === undefined ? {} : { ask }),
  };
  return { host, openTicket, onEvent, ask };
}

describe('a host function called through the bridge, from a runtime', () => {
  it('is refused before the page is called when no rule names it', async () => {
    const { host, openTicket, onEvent, ask } = page(true);
    const runtime = fakeRuntime(hostFrontendTools(hosted(), () => host));
    expect(await runtime.run()).toBe(
      `Refused: ${hostRefused('host_open_ticket')}`,
    );
    expect(openTicket).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    // The runtime got the result as a tool result: success, the refusal inside.
    expect(runtime.results).toEqual([
      {
        toolCallId: 'call-1',
        success: true,
        result: { error: hostRefused('host_open_ticket') },
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'action',
      detail: {
        function: 'open_ticket',
        arguments: { title: 'Late order' },
        error: hostRefused('host_open_ticket'),
      },
    });
  });

  it('is refused the same under leave it to me', async () => {
    const { host, openTicket, ask } = page(true);
    const runtime = fakeRuntime(
      hostFrontendTools(hosted('leave_to_me'), () => host),
    );
    expect(await runtime.run()).toBe(
      `Refused: ${hostRefused('host_open_ticket')}`,
    );
    expect(openTicket).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it.each(['ask_first', 'if_asked'] as const)(
    'asks the person on the page under %s, and does it when they allow',
    async behaviour => {
      const { host, openTicket, onEvent, ask } = page(true);
      const runtime = fakeRuntime(
        hostFrontendTools(hosted(behaviour), () => host),
      );
      expect(await runtime.run()).toBe(
        'Done: {"ticket":42,"title":"Late order"}',
      );
      expect(ask).toHaveBeenCalledWith({
        function: 'open_ticket',
        arguments: { title: 'Late order' },
        sentence: 'Open a ticket? (open_ticket with {"title":"Late order"})',
      });
      expect(openTicket).toHaveBeenCalledWith({ title: 'Late order' });
      expect(onEvent).toHaveBeenCalledWith({
        type: 'action',
        detail: {
          function: 'open_ticket',
          arguments: { title: 'Late order' },
          result: { ticket: 42, title: 'Late order' },
        },
      });
    },
  );

  it('is refused under ask me first when the person says no, the page not called', async () => {
    const { host, openTicket, ask } = page(false);
    const runtime = fakeRuntime(
      hostFrontendTools(hosted('ask_first'), () => host),
    );
    expect(await runtime.run()).toBe(
      `Refused: ${hostNotAllowed('host_open_ticket')}`,
    );
    expect(ask).toHaveBeenCalledTimes(1);
    expect(openTicket).not.toHaveBeenCalled();
  });

  it('is done under do it, nobody asked', async () => {
    const { host, openTicket, ask } = page(true);
    const runtime = fakeRuntime(hostFrontendTools(hosted('do_it'), () => host));
    expect(await runtime.run()).toBe(
      'Done: {"ticket":42,"title":"Late order"}',
    );
    expect(ask).not.toHaveBeenCalled();
    expect(openTicket).toHaveBeenCalledTimes(1);
  });

  it('is the runtime’s own to run when the page offers no such tool', async () => {
    const { host } = page(true);
    const app = hosted('do_it');
    // The Appspec names no host: the page offers no frontend tool at all.
    app.deployment = { embedded: { mode: 'bubble', origins: [] } };
    const runtime = fakeRuntime(hostFrontendTools(app, () => host));
    expect(await runtime.run()).toBe(
      'The runtime ran it itself: no frontend tool answered.',
    );
    expect(runtime.results).toEqual([]);
  });
});
