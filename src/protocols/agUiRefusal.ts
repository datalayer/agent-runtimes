/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Why an AG-UI run was not answered, in the page's own words (LOOP F-15).
 *
 * What a person met before was `AG-UI request failed: 404` — the status and
 * nothing else. A 404 at an agent's AG-UI address has one meaning: the agent
 * is not on the runtime the page is addressing. The commonest way to get
 * there is to open an application whose agent runs its code in the browser:
 * the runtime refuses to start it (`browser_sandbox_refusal`, 422), the page
 * addresses it anyway, and the address answers nothing. So the page says
 * that, and says what to do about it.
 *
 * When the server said why — a refusal of the platform's own, carried as
 * `detail` — that sentence is the better one and is used instead: it is
 * about this agent, where ours is about any.
 *
 * Pure, so the hook, the adapter and the tests read a refusal the same way
 * (the repo's jest/vitest rule: rules live outside components).
 *
 * @module protocols/agUiRefusal
 */

/** What the page says when an agent's AG-UI address answers nothing. */
export const AG_UI_NOT_ON_RUNTIME =
  'This agent is not on the runtime the page is addressing: its AG-UI address answered nothing. ' +
  'An agent that runs its code in the browser is never started on a runtime — run it in the page, ' +
  'or give it a sandbox a runtime has (eval, jupyter-server).';

/** What the page says when the address refused the caller. */
export const AG_UI_NOT_ALLOWED =
  'This agent did not answer the page: the run was refused. ' +
  'Sign in again, or open the application from its own address.';

/**
 * The `detail` a platform refusal carries, or `''`.
 *
 * A body that is not JSON — an HTML 404 from the page's own origin, which is
 * what a page addressing a runtime it never got answers — carries none.
 */
export function refusalDetail(body: string | undefined): string {
  if (!body) {
    return '';
  }
  let said: unknown;
  try {
    said = JSON.parse(body);
  } catch {
    return '';
  }
  if (!said || typeof said !== 'object') {
    return '';
  }
  const detail = (said as { detail?: unknown }).detail;
  return typeof detail === 'string' ? detail.trim() : '';
}

/**
 * Why the run was not answered, as the page says it.
 *
 * @param status - The status the address answered with.
 * @param statusText - Its text, for a status we have nothing better for.
 * @param body - What came back, when it was read; a refusal's `detail` wins.
 */
export function agUiRefusal(
  status: number,
  statusText: string,
  body?: string,
): string {
  const detail = refusalDetail(body);
  if (detail) {
    return detail;
  }
  if (status === 404) {
    return AG_UI_NOT_ON_RUNTIME;
  }
  if (status === 401 || status === 403) {
    return AG_UI_NOT_ALLOWED;
  }
  return `AG-UI request failed: ${status} ${statusText}`.trim();
}

/**
 * Read a refusal's body without letting the reading itself throw: a body
 * already consumed, or a connection that went away, leaves us with the
 * status alone, which is still better than nothing.
 */
export async function refusalBody(response: {
  text: () => Promise<string>;
}): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
