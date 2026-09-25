/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Delegation in the browser harness.
 *
 * Built the way the Vercel AI SDK documents — a subagent is a `ToolLoopAgent`
 * the parent reaches through an ordinary tool — so what is worth testing is
 * not the SDK but the two decisions that are ours: which conversation the
 * child is given, and what the parent's model reads back.
 */

import { describe, expect, it } from 'vitest';

import { STOPPED, subagentTools } from '../browser/subagents';

const INFERENCE_URL = 'https://prod1.example';

/** One non-streaming chat completion, as the inference service answers. */
function completion(text: string): Response {
  return new Response(
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion',
      created: 0,
      model: 'stub',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * The same completion, streamed — what the child asks for now that a
 * delegated run is watched as it goes. Three chunks and the end marker, as
 * the OpenAI-compatible service sends them.
 */
function streamed(text: string): Response {
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'stub',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  const body =
    chunk({ role: 'assistant', content: '' }, null) +
    chunk({ content: text }, null) +
    chunk({}, 'stop') +
    'data: [DONE]\n\n';
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * Delegate once, and report what the child actually asked the model.
 *
 * Through a stubbed `fetch` rather than a stubbed model: `createBrowserModel`
 * takes one, and it is the only seam that shows the messages as they go over
 * the wire — which is the thing worth asserting.
 */
async function delegate(options: {
  sharing?: 'shared' | 'isolated' | 'own-turns';
  messages?: unknown[];
  task?: string;
}) {
  const sent: Record<string, unknown>[] = [];
  const events: AgentStreamSubagentPayload[] = [];
  const fetchStub = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    sent.push(body);
    // Streamed when asked to stream, as the service would.
    return body.stream
      ? streamed('31 cells to 18.')
      : completion('31 cells to 18.');
  }) as unknown as typeof globalThis.fetch;

  const tools = subagentTools({
    subagents: [
      {
        name: 'Compactor',
        description: 'Shortens a notebook without changing what it computes.',
        instructions: 'Be brief.',
      },
    ],
    inference: { inferenceUrl: INFERENCE_URL, token: 'tok', fetch: fetchStub },
    model: 'bedrock:us.anthropic.claude-sonnet-4-6',
    sharing: options.sharing,
    onEvent: event => events.push(event),
  });

  const entry = tools.Compactor as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
    toModelOutput: (options: { output: unknown }) => unknown;
  };

  const result = await entry.execute(
    { task: options.task ?? 'compact it' },
    { messages: options.messages ?? [], toolCallId: 'call-7' },
  );

  return { entry, result, sent, events };
}

/** The `content` of every message the child sent, in order. */
function contents(body: Record<string, unknown>): string[] {
  return ((body.messages ?? []) as { content: unknown }[]).map(message =>
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content),
  );
}

describe('the delegation tools', () => {
  it('names one tool per subagent, described for the model to choose on', () => {
    const tools = subagentTools({
      subagents: [
        { name: 'Compactor', description: 'Shortens a notebook.' },
        { name: 'CellFixer', description: 'Repairs a failing cell.' },
      ],
      inference: { inferenceUrl: INFERENCE_URL },
    });

    // Named after the agent rather than a single `delegate_task(name, …)`: a
    // name the model can read is a name it picks correctly more often.
    expect(Object.keys(tools)).toEqual(['Compactor', 'CellFixer']);
    expect(tools.CellFixer.description).toBe('Repairs a failing cell.');
  });

  it('refuses a task that does not say what to do', async () => {
    const tools = subagentTools({
      subagents: [{ name: 'Compactor', description: 'Shortens a notebook.' }],
      inference: { inferenceUrl: INFERENCE_URL },
    });
    const entry = tools.Compactor as {
      execute: (input: unknown, options: unknown) => Promise<unknown>;
    };
    await expect(entry.execute({ task: '  ' }, {})).resolves.toEqual({
      error: 'A delegated task needs to say what to do.',
    });
  });
});

describe('what the parent reads back', () => {
  it('is the conclusion, not the whole delegated run', async () => {
    // The person sees everything in the transcript; the parent's model needs
    // only the result. Paying for the rest in context is how a delegation
    // model runs out of room three hand-offs in.
    const { entry } = await delegate({});
    expect(
      entry.toModelOutput({
        output: { agent: 'Compactor', result: '31 cells to 18.' },
      }),
    ).toEqual({ type: 'text', value: '31 cells to 18.' });
  });

  it('says who failed and why, rather than throwing', async () => {
    // A failed delegation is a step the parent can recover from — try another
    // member, or tell the person. A throw would abort the whole run.
    const { entry } = await delegate({});
    expect(
      entry.toModelOutput({
        output: { agent: 'Compactor', error: 'no notebook open' },
      }),
    ).toEqual({
      type: 'text',
      value: 'Compactor could not finish: no notebook open',
    });
  });

  it('falls back to something rather than nothing', async () => {
    const { entry } = await delegate({});
    expect(entry.toModelOutput({ output: {} })).toEqual({
      type: 'text',
      value: 'Done.',
    });
  });
});

describe('what the child is told', () => {
  const HISTORY = [
    { role: 'user', content: 'what does cell 3 do?' },
    { role: 'assistant', content: 'it loads the CSV.' },
  ];

  it('hands over the conversation when the team shares one', async () => {
    // `shared` is what a supervisor team wants: routing is guesswork if the
    // member receiving the work cannot see what was asked before.
    const { sent } = await delegate({ sharing: 'shared', messages: HISTORY });

    expect(contents(sent[0])).toEqual([
      'Be brief.',
      'what does cell 3 do?',
      'it loads the CSV.',
      'compact it',
    ]);
  });

  it('starts the child on the task alone when the team isolates', async () => {
    // The SDK's own default, and what a delegation model wants: the child runs
    // blind and returns a result.
    const { sent } = await delegate({ sharing: 'isolated', messages: HISTORY });

    expect(contents(sent[0])).toEqual(['Be brief.', 'compact it']);
  });

  it('treats own-turns as isolated, because a subagent has no turns', async () => {
    // The honest reading of "only its own history" for something that has
    // never spoken before is "no history".
    const { sent } = await delegate({
      sharing: 'own-turns',
      messages: HISTORY,
    });

    expect(contents(sent[0])).toEqual(['Be brief.', 'compact it']);
  });

  it('shares by default, matching the teamspec default', async () => {
    const { sent } = await delegate({ messages: HISTORY });
    expect(contents(sent[0])).toContain('what does cell 3 do?');
  });

  it('returns the child’s answer to the parent', async () => {
    const { result } = await delegate({ messages: [] });
    expect(result).toEqual({ agent: 'Compactor', result: '31 cells to 18.' });
  });
});

describe('what the page is shown while the child works', () => {
  it('reports the run as it goes, keyed by the parent’s tool call', async () => {
    const { events } = await delegate({ messages: [] });
    expect(events.map(event => event.phase)).toEqual(['start', 'text', 'end']);
    for (const event of events) {
      expect(event.subagentName).toBe('Compactor');
      expect(event.toolCallId).toBe('call-7');
    }
    expect(events[0].task).toBe('compact it');
    expect(events.at(-1)?.output).toBe('31 cells to 18.');
  });

  it('reports a failure as one, and still answers the parent', async () => {
    const events: AgentStreamSubagentPayload[] = [];
    const fetchStub = (async () =>
      new Response('down', {
        status: 503,
      })) as unknown as typeof globalThis.fetch;
    const tools = subagentTools({
      subagents: [
        { name: 'Writer', description: 'Writes.', instructions: 'Write.' },
      ],
      inference: {
        inferenceUrl: INFERENCE_URL,
        token: 'tok',
        fetch: fetchStub,
      },
      model: 'stub',
      onEvent: event => events.push(event),
    });
    const entry = tools.Writer as {
      execute: (input: unknown, options: unknown) => Promise<unknown>;
    };
    const result = (await entry.execute(
      { task: 'write it' },
      { messages: [] },
    )) as {
      agent: string;
      error?: string;
    };
    expect(result.agent).toBe('Writer');
    expect(result.error).toBeTruthy();
    expect(events.map(event => event.phase)).toEqual(['start', 'error']);
  });
});

describe('when the person presses stop', () => {
  it('stops the child, and says so rather than failing', async () => {
    const events: AgentStreamSubagentPayload[] = [];
    const controller = new AbortController();
    // A model that never answers until aborted, like a slow one would.
    const fetchStub = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof globalThis.fetch;
    const tools = subagentTools({
      subagents: [
        { name: 'Writer', description: 'Writes.', instructions: 'Write.' },
      ],
      inference: {
        inferenceUrl: INFERENCE_URL,
        token: 'tok',
        fetch: fetchStub,
      },
      model: 'stub',
      onEvent: event => events.push(event),
      signal: () => controller.signal,
    });
    const entry = tools.Writer as {
      execute: (input: unknown, options: unknown) => Promise<unknown>;
    };
    const run = entry.execute({ task: 'write it' }, { messages: [] });
    controller.abort();
    const result = (await run) as { agent: string; error?: string };
    expect(result).toEqual({ agent: 'Writer', error: STOPPED });
    expect(events.map(event => event.phase)).toEqual(['start', 'error']);
    expect(events[1].error).toBe(STOPPED);
  });
});
