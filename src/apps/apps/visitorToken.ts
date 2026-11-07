/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A visitor's token, for a conversation without an account on the visitors'
 * runtime (R-30).
 *
 * ai-inference mints it (`POST /anonymous/token`) naming the visitor — the id
 * this tab keeps for them, so that a new token is the same visitor, whose
 * session, turns and rate it does not reset — and the one application it is
 * for: an example's id, or `at:<slug>` for an application at its address.
 * It lives minutes, so it is minted again before it runs out: what limits a
 * visitor is on the servers (turns a day, a session's minutes, a rate and a
 * ceiling for the day), not the life of a key.
 *
 * A token may also name the catalogue Battle it is played for (B4-01): its
 * model calls then count against that play's own budget at ai-inference,
 * instead of the visitor's rate, and the runtime that plays a member of the
 * Battle's scene reads the Battle from it (`fetchBattleToken`, and
 * `DatalayerVisitors.battle` for the members).
 *
 * @module apps/apps/visitorToken
 */

import { useEffect, useState } from 'react';

import { tokenLifetimeMs } from '../../runtimes/browser/anonymousToken';

/** Where a conversation without an account runs: the visitors' runtime, and what it is for. */
export type DatalayerVisitors = {
  /** The visitors' runtime, as the chat addresses it. */
  url: string;
  /** The application the visitor's token is for: an example's id, or `at:<slug>`. */
  app: string;
  /** ai-inference, which mints the visitor's token. */
  inferenceUrl: string;
  /** The catalogue Battle the token is played for, when it is (B4-01). */
  battle?: string;
};

/** The id this tab keeps for its visitor. */
const VISITOR_KEY = 'datalayer-loop-visitor';

/** Minted again this long before the token runs out. */
const MARGIN_MS = 30_000;

/** A visitor's id: what ai-inference accepts (8 to 64 letters, digits or dashes). */
export function isVisitorId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

/** The id this tab keeps for its visitor, or `''` until ai-inference made one. */
export function keptVisitorId(): string {
  try {
    const kept = window.sessionStorage.getItem(VISITOR_KEY);
    return isVisitorId(kept) ? kept : '';
  } catch {
    return '';
  }
}

function keepVisitorId(visitor: string): void {
  try {
    window.sessionStorage.setItem(VISITOR_KEY, visitor);
  } catch {
    // A tab that keeps nothing is a new visitor at each token.
  }
}

/** A visitor's token, and when it is to be minted again. */
export type VisitorToken = {
  token: string;
  visitor: string;
  /** Epoch milliseconds: the token's own lifetime from now. */
  renewAt: number;
};

/** The body ai-inference is asked with: the application, the visitor once there is one, the Battle when it is played for one. */
export function visitorTokenRequest(
  app: string,
  visitor: string,
  battle = '',
): { app?: string; visitor?: string; battle?: string } {
  return {
    ...(app ? { app } : {}),
    ...(isVisitorId(visitor) ? { visitor } : {}),
    ...(battle ? { battle } : {}),
  };
}

/** What ai-inference answers a mint with. */
type MintedVisitorToken = {
  token: string;
  visitor?: string;
  expires_in?: number;
};

/** Ask ai-inference for a token; throws with its sentence. The visitor it names is kept for the next one. */
async function mintVisitorToken(
  inferenceUrl: string,
  request: ReturnType<typeof visitorTokenRequest>,
  fetcher: typeof fetch,
): Promise<MintedVisitorToken> {
  const base = inferenceUrl.replace(/\/+$/, '');
  const response = await fetcher(
    `${base}/api/ai-inference/v1/anonymous/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    token?: string;
    visitor?: string;
    expires_in?: number;
    detail?: string;
  };
  if (!response.ok || !body.token) {
    throw new Error(
      body.detail ||
        `A visitor's token was refused by ${base} (HTTP ${response.status}).`,
    );
  }
  if (isVisitorId(body.visitor)) {
    keepVisitorId(body.visitor);
  }
  return {
    token: body.token,
    visitor: body.visitor,
    expires_in: body.expires_in,
  };
}

/** Mint a visitor's token for an application — played for a Battle when `battle` names one; throws with ai-inference's sentence. */
export async function fetchVisitorToken(
  inferenceUrl: string,
  app: string,
  visitor = keptVisitorId(),
  fetcher: typeof fetch = fetch,
  battle = '',
): Promise<VisitorToken> {
  const body = await mintVisitorToken(
    inferenceUrl,
    visitorTokenRequest(app, visitor, battle),
    fetcher,
  );
  const lifetimeMs = Math.max(60_000, (body.expires_in ?? 300) * 1000);
  return {
    token: body.token,
    visitor: body.visitor ?? visitor,
    renewAt: Date.now() + lifetimeMs - MARGIN_MS,
  };
}

/** A Battle's token for the page's players: its own budget at ai-inference, for one play. */
export type BattleToken = {
  token: string;
  visitor: string;
  /** Epoch milliseconds: the token's own lifetime from now. */
  expiresAt: number;
  /** How long it was signed for, as the token declares. */
  lifetimeMs: number;
};

/**
 * Mint the token one play of a catalogue Battle is played with, by the
 * visitor this tab keeps (B4-01): the players in the page call their models
 * with it, its calls counted against the play's budget. Never renewed: a play
 * is minutes, and the next play mints its own.
 */
export async function fetchBattleToken(
  inferenceUrl: string,
  battle: string,
  visitor = keptVisitorId(),
  fetcher: typeof fetch = fetch,
): Promise<BattleToken> {
  if (!battle) {
    throw new Error('A Battle token is minted for a Battle.');
  }
  const body = await mintVisitorToken(
    inferenceUrl,
    visitorTokenRequest('', visitor, battle),
    fetcher,
  );
  const lifetimeMs = tokenLifetimeMs(body.token, body.expires_in);
  return {
    token: body.token,
    visitor: body.visitor ?? visitor,
    expiresAt: Date.now() + lifetimeMs,
    lifetimeMs,
  };
}

/**
 * The visitor's token for an application while `visitors` is set: minted at
 * once and again before it runs out. `error` says why none could be had.
 */
export function useVisitorToken(visitors: DatalayerVisitors | undefined): {
  token?: string;
  error?: string;
} {
  const [state, setState] = useState<{ token?: string; error?: string }>({});
  const app = visitors?.app;
  const inferenceUrl = visitors?.inferenceUrl;
  const battle = visitors?.battle ?? '';
  useEffect(() => {
    if (!app || !inferenceUrl) {
      setState({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mint = () => {
      fetchVisitorToken(inferenceUrl, app, keptVisitorId(), fetch, battle)
        .then(minted => {
          if (cancelled) {
            return;
          }
          setState({ token: minted.token });
          timer = setTimeout(
            mint,
            Math.max(5_000, minted.renewAt - Date.now()),
          );
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    };
    mint();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [app, inferenceUrl, battle]);
  return state;
}

/** What a token for an application at its address names: `at:<slug>`. */
const AT_PREFIX = 'at:';

/** The slug of an address, as ai-agents allows it. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

/**
 * The agent of the visitors' runtime a visitor's token reaches, as the
 * runtime names it (`agent_of` in `agent_runtimes.apps.visitors`): an
 * example's by its id, an application at its address by `at-<slug>`. The
 * chat speaks to that agent and to no other: the token reaches no other.
 *
 * @throws When `app` is an address with no valid slug.
 */
export function visitorAgentOf(app: string): string {
  if (!app.startsWith(AT_PREFIX)) {
    return app;
  }
  const slug = app.slice(AT_PREFIX.length);
  if (!SLUG.test(slug)) {
    throw new Error(`“${app}” is no application’s address.`);
  }
  return `at-${slug}`;
}

/** The agent the visitors' runtime holds for a visitor, and the application it runs. */
export type VisitorAgent = { agent: string; appId: string };

/**
 * Ask the visitors' runtime for the agent a visitor's token names, made
 * there if it is not (`POST /api/v1/apps/visitors/agent`, D-15): an
 * application at its address has its agent made as it is first opened, so
 * that the runtime holds the application before the page follows it.
 * Throws with the runtime's sentence when it refuses.
 */
export async function fetchVisitorAgent(
  runtimeUrl: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<VisitorAgent> {
  const base = runtimeUrl.replace(/\/+$/, '');
  const response = await fetcher(`${base}/api/v1/apps/visitors/agent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    agent?: string;
    app_id?: string;
    detail?: string;
  };
  if (!response.ok || !body.agent || !body.app_id) {
    throw new Error(
      body.detail ||
        `The visitors’ runtime at ${base} did not make the application’s agent (HTTP ${response.status}).`,
    );
  }
  return { agent: body.agent, appId: body.app_id };
}

/**
 * The application's agent made on the visitors' runtime for this visitor,
 * and checked to be the one the page runs: the agent the token reaches
 * (`visitorAgentOf`) running the application of `appId`. Throws with the
 * sentence a visitor is told otherwise.
 */
export async function ensureVisitorAgent(
  visitors: DatalayerVisitors,
  appId: string,
  fetcher: typeof fetch = fetch,
): Promise<VisitorAgent> {
  const minted = await fetchVisitorToken(
    visitors.inferenceUrl,
    visitors.app,
    keptVisitorId(),
    fetcher,
  );
  const held = await fetchVisitorAgent(visitors.url, minted.token, fetcher);
  const expected = visitorAgentOf(visitors.app);
  if (held.agent !== expected || held.appId !== appId) {
    throw new Error(
      `The visitors’ runtime holds ${held.appId} as ${held.agent} for “${visitors.app}”, not ${appId} as ${expected}: reload the page.`,
    );
  }
  return held;
}
