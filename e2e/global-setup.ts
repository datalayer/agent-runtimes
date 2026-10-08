/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the suite can reach, probed once before any browser opens (STUDIO
 * D-15): the landing, the embed bundle it serves, the visitors' runtime and
 * each address. The answers go to the workers through the environment, so
 * that a mount nothing serves skips at collection, with a sentence, and
 * opens no browser.
 *
 * @module e2e/global-setup
 */

import { HOST_PAGE_PORT } from './playwright.config';

/** What the workers read: `E2E_PROBE_<name>` is a sentence when not reachable, `''` when it is. */
export const PROBES = {
  landing: 'E2E_PROBE_LANDING',
  bundle: 'E2E_PROBE_BUNDLE',
  hostPage: 'E2E_PROBE_HOST_PAGE',
  visitors: 'E2E_PROBE_VISITORS',
  address: 'E2E_PROBE_ADDRESS',
  refused: 'E2E_PROBE_REFUSED',
} as const;

export const landingUrl = (): string =>
  (process.env.E2E_LANDING_URL || 'http://localhost:3063').replace(/\/+$/, '');
export const apiUrl = (): string =>
  (process.env.E2E_DATALAYER_API || 'https://r1.datalayer.run').replace(
    /\/+$/,
    '',
  );
export const exampleId = (): string =>
  process.env.E2E_EXAMPLE || 'web-research';
export const address = (): string => process.env.E2E_ADDRESS || '';
export const refusedAddress = (): string =>
  process.env.E2E_REFUSED_ADDRESS || 'demo-accounting';
export const hostPageUrl = (): string =>
  process.env.E2E_HOST_PAGE || `http://127.0.0.1:${HOST_PAGE_PORT}/index.html`;

async function reach(
  url: string,
  init: RequestInit = {},
): Promise<
  { status: number; body: Record<string, unknown> } | { error: string }
> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    let body: Record<string, unknown> = {};
    try {
      const read = (await response.json()) as unknown;
      body =
        read && typeof read === 'object'
          ? (read as Record<string, unknown>)
          : {};
    } catch {
      // Not JSON: the status says it.
    }
    return { status: response.status, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Whether somebody signed out may talk to the application at `slug`, or why not. */
async function opens(
  slug: string,
): Promise<{ opens: boolean; reason: string }> {
  const read = await reach(
    `${apiUrl()}/api/ai-agents/v1/apps/deployments/at/${encodeURIComponent(slug)}`,
  );
  if ('error' in read) {
    return {
      opens: false,
      reason: `ai-agents at ${apiUrl()} is not reachable (${read.error}).`,
    };
  }
  if (read.status !== 200) {
    return {
      opens: false,
      reason: String(
        read.body.detail ?? `ai-agents answered ${read.status} for ${slug}.`,
      ),
    };
  }
  const session = (read.body.session ?? {}) as {
    opens?: boolean;
    reason?: string;
  };
  return {
    opens: Boolean(session.opens),
    reason: String(session.reason ?? ''),
  };
}

export default async function globalSetup(): Promise<void> {
  const set = (name: string, sentence: string) => {
    process.env[name] = sentence;
  };

  const landing = await reach(`${landingUrl()}/`);
  set(
    PROBES.landing,
    'error' in landing
      ? `The landing's dev server at ${landingUrl()} is not running (${landing.error}).`
      : landing.status >= 500
        ? `The landing at ${landingUrl()} answered ${landing.status}.`
        : '',
  );

  // The element needs the rebuilt bundle: the loader and the module beside
  // it. The dev server's fallback (public/embed) serves the loader alone.
  const loader = await reach(`${landingUrl()}/embed/datalayer-app.js`);
  const module = await reach(`${landingUrl()}/embed/datalayer-app-main.js`);
  set(
    PROBES.bundle,
    'error' in loader || loader.status !== 200
      ? `${landingUrl()}/embed/datalayer-app.js is not served.`
      : 'error' in module || module.status !== 200
        ? `${landingUrl()}/embed/ serves no datalayer-app-main.js: the landing needs the rebuilt dist-embed from an agent-runtimes release (its dev server falls back to public/embed).`
        : '',
  );

  const host = await reach(hostPageUrl());
  set(
    PROBES.hostPage,
    'error' in host || host.status !== 200
      ? `The host page at ${hostPageUrl()} is not served.`
      : '',
  );

  // The visitors' runtime answers a visitor's token only: anything it says
  // but a network error, or nothing at this path, means it is there.
  const runtime = await reach(
    `${apiUrl()}/api/loop-visitors/api/v1/apps/agents/${encodeURIComponent(exampleId())}/ag-ui/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  set(
    PROBES.visitors,
    'error' in runtime
      ? `The visitors' runtime at ${apiUrl()} is not reachable (${runtime.error}).`
      : runtime.status === 404
        ? `The visitors' runtime at ${apiUrl()}/api/loop-visitors is not deployed, or keeps no ${exampleId()}.`
        : '',
  );

  if (address()) {
    const open = await opens(address());
    set(
      PROBES.address,
      open.opens ? '' : `${address()} is not open to a visitor: ${open.reason}`,
    );
  } else {
    set(
      PROBES.address,
      'No address open to visitors is named (E2E_ADDRESS): the hosted mount answers nobody signed out.',
    );
  }

  const refused = await opens(refusedAddress());
  set(
    PROBES.refused,
    refused.opens
      ? `${refusedAddress()} opens to visitors, so no refusal is shown there: name one that refuses (E2E_REFUSED_ADDRESS).`
      : refused.reason.startsWith('ai-agents')
        ? refused.reason
        : '',
  );
}
