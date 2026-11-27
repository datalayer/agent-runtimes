/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A public application in the element, for a visitor without an account.
 *
 * `<datalayer-app app="…">` with no token names a public application. The
 * element reads what it is without anybody's credentials, as the landing's
 * hosted page does for whoever is signed out:
 *
 * - **an example Datalayer keeps warm for visitors** (`web-research`,
 *   `customer-interview`): its Appspec from the catalogue this bundle
 *   carries; the visitors' runtime answers its id;
 * - **an application at its address** (`accounting-stage`): ai-agents'
 *   `GET /apps/deployments/at/<slug>` without a token says what its page is
 *   drawn from — the Appspec of the version it runs — and whether somebody
 *   signed out may talk to it (`session.opens`); the visitors' runtime
 *   answers `at:<slug>`, making the address's agent when first talked to —
 *   or, for a version with code of its own (`runs_code`), its deployment's
 *   always-on runtime (`always_on_runtime.url`), which runs that code;
 * - **an example of this bundle deployed at the address of its name** (the
 *   landing's demo agents, `marketer-tryout`): drawn from the Appspec this
 *   bundle carries — its UI, its title bar's items, its presentation, its
 *   starters, its frontend tools — never from the deployment's copy (the
 *   user, 18 November 2026: "the demo agents' specs must not be loaded from
 *   r1; they ship directly in the JavaScript code"). The deployment says
 *   only what the runtime decides: whether a visitor may talk to it, and
 *   where it runs (`runs_code`, `always_on_runtime.url`, `at:<slug>`). The runtime there
 *   runs the version it was deployed with, its own instructions with it, so
 *   the page may draw what that version does not set yet (a header's items
 *   stay empty, a drop-down's option is not read) until its next roll;
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

import { DEFAULT_PLANE_URLS } from '@datalayer/core/lib/config/planes';
import type { AppSpec } from '../../types/agentspecs';
import { getApp } from '../../specs/apps';
import { parseAppspec } from '../apps/appspec';
import type { DatalayerVisitors } from '../apps/visitorToken';
import { runnable } from './embedConfig';

/** Where the visitors' runtime is published, on ai-agents' host (its chart). */
export const VISITORS_PATH = '/api/runtime-visitors';

/** The examples the visitors' runtime keeps warm (its chart's `AGENT_RUNTIMES_VISITORS`). */
export const VISITOR_EXAMPLES: readonly string[] = [
  'web-research',
  'customer-interview',
];

/** The key of an application at its address, as a visitor's token names it. */
export const AT_PREFIX = 'at:';

/**
 * Datalayer's services for a visitor, where the element names none (`api`)
 * and the platform's configuration says none: ai-agents, where an address is
 * read, and beside it the visitors' runtime — the AI plane, as core's plane
 * table says it, never a literal of this bundle's own. Not Spacer's address,
 * which reads an application with its embed token: the two live on different
 * planes (ai-agents on r1, Spacer on prod1), found 15 October 2026 on
 * datalayer.ai's embed; a bundle whose literal still said prod1 failed to
 * mint a visitor's token there on 28 October 2026 ("Failed to fetch"),
 * ai-inference being on r1 with the agents that call it.
 */
export const DEFAULT_API: string = DEFAULT_PLANE_URLS.aiAgentsUrl;

/**
 * ai-inference, which mints a visitor's token, where the element names none
 * (`api`) and the platform's configuration says none: the AI plane, as core's
 * plane table says it.
 */
export const DEFAULT_INFERENCE: string = DEFAULT_PLANE_URLS.aiInferenceUrl;

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
  | { kind: 'said'; text: string }
  /**
   * Nothing at the address: the person reads {@link MISSING_SENTENCE}, the
   * developer the detail, in the console.
   */
  | { kind: 'missing'; detail: string };

/** Said of a demo this bundle does not carry: it is not drawn from anybody else's copy. */
export const notBundledSentence = (app: string): string =>
  `“${app}” is not in this page's build, so it is not shown: its spec ships with the page, never from elsewhere.`;

/** What a person reads where no application is at the address: no internal name, no prefix. */
export const MISSING_SENTENCE = 'No application is at this address.';

/**
 * Where a visitor's conversation with `app` runs: the visitors' runtime beside
 * ai-agents — or `runtime`, the always-on runtime of a deployment with code
 * of its own — its token from ai-inference, at `inference` when it is
 * named, else beside ai-agents.
 */
export function visitorsAt(
  api: string,
  app: string,
  runtime?: string,
  inference?: string,
): DatalayerVisitors {
  const base = api.replace(/\/+$/, '');
  return {
    url: runtime ? runtime.replace(/\/+$/, '') : `${base}${VISITORS_PATH}`,
    app,
    inferenceUrl: (inference || base).replace(/\/+$/, ''),
  };
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
 * @param api - Datalayer's services (ai-agents, and ai-inference unless
 *   `inference` names it): the `api` attribute; the AI plane unless given.
 * @param inference - ai-inference, which mints the visitor's token: `api`
 *   when that is given, else the AI plane.
 * @param app - The `app` attribute: a decision's id, an example's id or an address.
 * @param fetcher - What asks ai-agents; `fetch` unless given.
 * @param catalogue - The examples; the bundle's catalogue unless given.
 */
export async function readVisitorApp({
  api,
  inference,
  app,
  fetcher = fetch,
  catalogue = getApp,
  bundled = false,
}: {
  api?: string;
  inference?: string;
  app: string;
  fetcher?: typeof fetch;
  catalogue?: (ref: string) => AppSpec | undefined;
  /**
   * It must be one of this bundle's (a demo agent of the landing): one the
   * bundle does not carry is refused in a sentence, and nothing is asked.
   */
  bundled?: boolean;
}): Promise<VisitorApp> {
  const agents = api || DEFAULT_API;
  const mints = inference || api || DEFAULT_INFERENCE;
  const named = app.trim();
  if (bundled && !catalogue(named)) {
    return { kind: 'said', text: notBundledSentence(named) };
  }
  if (isAppUid(named)) {
    return { kind: 'decision', app: named };
  }
  const example = catalogue(named);
  if (example) {
    if (example.kind === 'decision') {
      return { kind: 'decision', app: named };
    }
    if (VISITOR_EXAMPLES.includes(example.id)) {
      return {
        kind: 'visitors',
        app: runnable({ app: example, problems: [] }),
        visitors: visitorsAt(agents, example.id, undefined, mints),
      };
    }
    // An example the visitors' runtime does not keep may be deployed at an
    // address of the same name (the landing's marketer-tryout and the like,
    // whose specs the catalogue carries since 14 November 2026): read it there.
    if (!SLUG.test(named)) {
      return { kind: 'said', text: notKeptSentence(named) };
    }
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
      `${agents.replace(/\/+$/, '')}/api/ai-agents/v1/apps/deployments/at/${encodeURIComponent(named)}`,
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
    // Nothing there: one sentence for the person, the detail for the developer.
    if (response.status === 404) {
      return {
        kind: 'missing',
        detail: example ? notKeptSentence(named) : refusedSentence(reason),
      };
    }
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
  const runtime = signedOutRuntime(body);
  if ('said' in runtime) {
    return { kind: 'said', text: refusedSentence(runtime.said) };
  }
  const visitors = visitorsAt(
    agents,
    `${AT_PREFIX}${named}`,
    runtime.url,
    mints,
  );
  // An example of this bundle: its Appspec is the bundle's, never the
  // deployment's copy. The deployment said where it runs, and nothing more.
  if (example) {
    return {
      kind: 'visitors',
      app: runnable({ app: example, problems: [] }),
      visitors,
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
    visitors,
  };
}

/**
 * Where somebody without an account talks to an address, as ai-agents says
 * it (decided 14 October 2026): written as a spec, on the visitors'
 * runtime (`url` unsaid); with code of its own (`runs_code`), on its
 * deployment's always-on runtime (`always_on_runtime.url`), which runs that code — never the
 * visitors', where its plain agent would answer in its code's place. An
 * answer that does not say, or says code with no runtime, is not run.
 */
export function signedOutRuntime(
  body: Record<string, unknown>,
): { url?: string } | { said: string } {
  if (typeof body.runs_code !== 'boolean') {
    return {
      said: 'Datalayer did not say whether it runs code of its own, so it is not run.',
    };
  }
  if (!body.runs_code) {
    return {};
  }
  const alwaysOn = (body.always_on_runtime ?? {}) as { url?: unknown };
  const url = typeof alwaysOn.url === 'string' ? alwaysOn.url.trim() : '';
  if (!url) {
    return {
      said: 'It runs its own code on an always-on runtime of its own, and none is running now.',
    };
  }
  return { url };
}
