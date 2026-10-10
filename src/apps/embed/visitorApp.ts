/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A public application in the element, for a visitor without an account
 * (STUDIO D-07, R-30).
 *
 * `<datalayer-app app="…">` with no token names a public application. The
 * element reads what it is without anybody's credentials, as the landing's
 * hosted page does for whoever is signed out:
 *
 * - **an example Datalayer keeps warm for visitors** (`web-research`,
 *   `customer-interview`): its Appspec from the catalogue this bundle
 *   carries; the visitors' runtime answers its id;
 * - **an application at its address** (`demo-accounting`): ai-agents'
 *   `GET /apps/deployments/at/<slug>` without a token says what its page is
 *   drawn from — the Appspec of the version it runs — and whether somebody
 *   signed out may talk to it (`session.opens`); the visitors' runtime
 *   answers `at:<slug>`, making the address's agent when first talked to;
 * - **a decision**, named by its id (`01M…`): framed from Datalayer's run
 *   page, as before.
 *
 * The conversation then runs as the landing's signed-out one does: the chat
 * mints the visitor's token itself from ai-inference (`useVisitorToken`,
 * `POST /anonymous/token {app}`), minted again before it runs out, and talks
 * to the visitors' runtime with it — in every mode, inline or floating.
 *
 * What a visitor may not have is said in one sentence, before anything is
 * drawn (fail fast): a private address (ai-agents answers *No application is
 * at this address*), one that acts through its owner's connections or
 * documents (ai-agents' own reason), an example the visitors' runtime does
 * not keep. Each says the embed token is what an embed of it takes.
 *
 * Pure but for the one request, given or `fetch`.
 *
 * @module apps/embed/visitorApp
 */

import type { AppSpec } from '../../types/agentspecs';
import { getApp } from '../../specs/apps';
import { parseAppspec } from '../apps/appspec';
import type { DatalayerVisitors } from '../apps/visitorToken';
import { runnable } from './embedConfig';

/** Where the visitors' runtime is published, on ai-agents' host (its chart). */
export const VISITORS_PATH = '/api/loop-visitors';

/** The examples the visitors' runtime keeps warm (its chart's `AGENT_RUNTIMES_VISITORS`). */
export const VISITOR_EXAMPLES: readonly string[] = [
  'web-research',
  'customer-interview',
];

/** The key of an application at its address, as a visitor's token names it. */
export const AT_PREFIX = 'at:';

/** Datalayer's services, where the element names none (`api`). */
export const DEFAULT_API = 'https://prod1.datalayer.run';

/** An application's id on Datalayer: a ULID. */
export const isAppUid = (value: string): boolean =>
  /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);

/** An address, as ai-agents spells one. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** What `app` with no token resolves to. */
export type VisitorApp =
  /** A chat or a widget a visitor talks to on the visitors' runtime. */
  | { kind: 'visitors'; app: AppSpec; visitors: DatalayerVisitors }
  /** A decision, framed from Datalayer's run page. */
  | { kind: 'decision'; app: string }
  /** Not run, and why, in a sentence. */
  | { kind: 'said'; text: string };

/** Where a visitor's conversation with `app` runs: the visitors' runtime beside ai-agents, its token from ai-inference. */
export function visitorsAt(api: string, app: string): DatalayerVisitors {
  const base = api.replace(/\/+$/, '');
  return { url: `${base}${VISITORS_PATH}`, app, inferenceUrl: base };
}

/** What an embed without a token is told it takes. */
export const TOKEN_HINT =
  'Embedded for a visitor it refuses, it takes its embed token (the "token" attribute).';

/** The sentence for an example the visitors' runtime does not keep. */
export const notKeptSentence = (app: string): string =>
  `datalayer-app: "${app}" is an example Datalayer does not keep ready for visitors (${VISITOR_EXAMPLES.join(', ')} are); embed it at its address once it is deployed. ${TOKEN_HINT}`;

/** The sentence for an application a visitor may not talk to, in ai-agents' words. */
export const refusedSentence = (reason: string): string =>
  `datalayer-app: ${reason.trim().replace(/\.?\s*Sign in to use it\.?$/, '.')} ${TOKEN_HINT}`;

/**
 * Read what `app` is for a visitor without an account: a decision to frame,
 * an example or an address to run on the visitors' runtime, or a sentence.
 *
 * @param api - Datalayer's services (ai-agents, ai-inference): the `api` attribute.
 * @param app - The `app` attribute: a decision's id, an example's id or an address.
 * @param fetcher - What asks ai-agents; `fetch` unless given.
 * @param catalogue - The examples; the bundle's catalogue unless given.
 */
export async function readVisitorApp({
  api = DEFAULT_API,
  app,
  fetcher = fetch,
  catalogue = getApp,
}: {
  api?: string;
  app: string;
  fetcher?: typeof fetch;
  catalogue?: (ref: string) => AppSpec | undefined;
}): Promise<VisitorApp> {
  const named = app.trim();
  if (isAppUid(named)) {
    return { kind: 'decision', app: named };
  }
  const example = catalogue(named);
  if (example) {
    if (example.kind === 'decision') {
      return { kind: 'decision', app: named };
    }
    if (!VISITOR_EXAMPLES.includes(example.id)) {
      return { kind: 'said', text: notKeptSentence(named) };
    }
    return {
      kind: 'visitors',
      app: runnable({ app: example, problems: [] }),
      visitors: visitorsAt(api, example.id),
    };
  }
  if (!SLUG.test(named)) {
    return {
      kind: 'said',
      text: `datalayer-app: "${named}" is neither an application's id, an example's, nor an address.`,
    };
  }
  let response: Response;
  try {
    response = await fetcher(
      `${api.replace(/\/+$/, '')}/api/ai-agents/v1/apps/deployments/at/${encodeURIComponent(named)}`,
    );
  } catch (error) {
    return {
      kind: 'said',
      text: `datalayer-app: Datalayer could not be reached to read "${named}" (${
        error instanceof Error ? error.message : String(error)
      }).`,
    };
  }
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || body.success === false) {
    const reason = String(
      body.detail ?? body.message ?? `No application is at "${named}".`,
    );
    return { kind: 'said', text: refusedSentence(reason) };
  }
  const session = (body.session ?? {}) as { opens?: unknown; reason?: unknown };
  if (!session.opens) {
    return {
      kind: 'said',
      text: refusedSentence(
        String(session.reason || `"${named}" is not run without an account.`),
      ),
    };
  }
  const deployment = (body.deployment ?? {}) as { app_name?: unknown };
  const parsed = parseAppspec(body.spec);
  if (parsed.app.kind === 'decision') {
    return { kind: 'decision', app: named };
  }
  const name =
    typeof deployment.app_name === 'string' && deployment.app_name
      ? deployment.app_name
      : parsed.app.name;
  return {
    kind: 'visitors',
    app: runnable({ app: { ...parsed.app, name }, problems: parsed.problems }),
    visitors: visitorsAt(api, `${AT_PREFIX}${named}`),
  };
}
