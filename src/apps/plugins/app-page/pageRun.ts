/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A widget's page written in its code, run on its inputs (LOOP P-05).
 *
 * The page opens a session of the application's agent on its runtime
 * (`POST /api/v1/apps/sessions`), then, each time an input changes, sends
 * them all as the session's `page` action (`POST …/sessions/{uid}/actions`,
 * `{name: "page", payload: {inputs}}`). The runtime checks them against the
 * page's form — refused with 422 and a sentence — runs its code's
 * `@app.page` on them, and answers its outputs as a `CUSTOM` event named
 * `loop.page`, `{inputs, outputs}`, which the page shows in place. Nothing is
 * said in the conversation.
 *
 * @module apps/plugins/app-page/pageRun
 */

/** The `CUSTOM` event that says what a page shows. */
export const LOOP_PAGE = 'loop.page';

/** Where the page reaches the application's session API, and as whom. */
export type PageRunContext = {
  /** The agent-runtimes server that runs the application. */
  serverUrl: string;
  /** The application's agent there. */
  agentId: string;
  /** The person's token; none on the machine itself. */
  token?: string;
  fetcher?: typeof fetch;
};

/** What a turn of the session API said: the events of its stream, parsed. */
export function streamEvents(stream: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const block of stream.split('\n\n')) {
    const data = block
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('');
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as Record<string, unknown>);
    } catch {
      // Not an event: skipped, as a reader of the stream skips it.
    }
  }
  return events;
}

/** What a run of the page answered: its outputs, by name, or why there are none. */
export type PageTurn =
  | { outputs: Record<string, unknown>; inputs: Record<string, unknown> }
  | { refused: string };

/** The page's turn, read from the stream the runtime answered. */
export function pageTurnOf(stream: string): PageTurn {
  let shown: PageTurn | null = null;
  for (const event of streamEvents(stream)) {
    if (event.type === 'RUN_ERROR') {
      return { refused: String(event.message ?? 'Its page could not run.') };
    }
    if (event.type === 'CUSTOM' && event.name === LOOP_PAGE) {
      const value = (event.value ?? {}) as {
        outputs?: Record<string, unknown>;
        inputs?: Record<string, unknown>;
      };
      shown = { outputs: value.outputs ?? {}, inputs: value.inputs ?? {} };
    }
  }
  return (
    shown ?? {
      refused: 'Its page showed nothing: its code answered no outputs.',
    }
  );
}

const base = (context: PageRunContext): string =>
  `${context.serverUrl.replace(/\/+$/, '')}/api/v1/apps/sessions`;

async function posted(
  context: PageRunContext,
  url: string,
  body: unknown,
): Promise<string> {
  const response = await (context.fetcher ?? fetch)(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(context.token ? { Authorization: `Bearer ${context.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const said = (await response.json()) as { detail?: unknown };
      detail = typeof said.detail === 'string' ? said.detail : '';
    } catch {
      // No sentence: the status says it.
    }
    throw new Error(detail || `Its page was refused (${response.status}).`);
  }
  return response.text();
}

/** Open the session its page runs in; its uid, as the runtime says it. */
export async function openPageSession(
  context: PageRunContext,
): Promise<string> {
  const stream = await posted(context, base(context), {
    agent: context.agentId,
  });
  for (const event of streamEvents(stream)) {
    if (event.type === 'CUSTOM' && event.name === 'loop.session') {
      const uid = (event.value as { uid?: unknown } | undefined)?.uid;
      if (typeof uid === 'string' && uid) {
        return uid;
      }
    }
  }
  throw new Error('The runtime opened no session for its page.');
}

/**
 * Run the page on its inputs in a session: its outputs, or the runtime's
 * sentence — its form refusing an input, its code failing.
 */
export async function runPageIn(
  context: PageRunContext,
  uid: string,
  inputs: Record<string, unknown>,
): Promise<PageTurn> {
  try {
    const stream = await posted(
      context,
      `${base(context)}/${encodeURIComponent(uid)}/actions`,
      { name: 'page', payload: { inputs } },
    );
    return pageTurnOf(stream);
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}

/** Each output as the page's data holds it, by path. */
export function outputsData(
  outputs: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(outputs).map(([name, value]) => [`/outputs/${name}`, value]),
  );
}
