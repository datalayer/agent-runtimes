/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reactor tool bundles, as tools the browser loop can call.
 *
 * A `ReactorToolSpec` names a plugin's commands and its backend. Both become
 * `FrontendToolDefinition`s here — the same shape the notebook tools have, so
 * a host adds them to an agent the same way — but they execute differently:
 *
 * - a **command** tool runs `reactor.executeCommand(command, args)` on the
 *   reactor the host is mounted in, which is exactly what the keystroke does;
 * - a **backend** tool makes the HTTP call the spec describes, from the page.
 *   On a server harness the same call is made by the Python side instead, see
 *   `agent_runtimes.services.reactor_tools`; a browser loop has no server, so
 *   it is embedded here.
 *
 * @module tools/adapters/reactor
 */

import { useMemo } from 'react';
import type { ReactorPlatform } from '@datalayer/reactor';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import type {
  FrontendToolDefinition,
  ReactorBackendToolSpec,
  ReactorCommandToolSpec,
  ReactorToolSpec,
} from '../../../types';

const NO_ARGUMENTS = { type: 'object', properties: {} } as const;

export type ReactorToolsOptions = {
  /** The reactor to execute commands on; `useReactorTools` finds the mounted one. */
  reactor?: ReactorPlatform | null;
  /** Where the backend is; the spec's `baseUrl`, then the page's origin, otherwise. */
  backendUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
};

/** Where a bundle's backend is reached from the page. */
export function resolveReactorBackendUrl(
  spec: ReactorToolSpec,
  override?: string,
): string {
  const base =
    override ??
    spec.backend?.baseUrl ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
}

/**
 * The request a backend tool makes for a set of arguments.
 *
 * Properties named in the path — `/decks/{id}` — are substituted; the rest
 * are query parameters for GET and DELETE and the JSON body otherwise. Kept
 * separate from the fetch so it can be checked without a network.
 */
export function buildReactorBackendRequest(
  tool: ReactorBackendToolSpec,
  baseUrl: string,
  args: Record<string, unknown>,
): { url: string; init: RequestInit } {
  const remaining: Record<string, unknown> = { ...args };
  const path = tool.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = remaining[name];
    delete remaining[name];
    return value === undefined || value === null
      ? ''
      : encodeURIComponent(String(value)).replace(/%2F/g, '/');
  });
  const method = tool.method.toUpperCase();
  const init: RequestInit = { method, headers: { accept: 'application/json' } };
  let url = `${baseUrl}${path}`;
  if (method === 'GET' || method === 'DELETE') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(remaining)) {
      if (value !== undefined && value !== null) {
        query.set(
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        );
      }
    }
    const search = query.toString();
    if (search) {
      url += `?${search}`;
    }
  } else {
    init.headers = { ...init.headers, 'content-type': 'application/json' };
    init.body = JSON.stringify(remaining);
  }
  return { url, init };
}

/** The bundle's commands, executed on a reactor. */
export function reactorCommandTools(
  spec: ReactorToolSpec,
  reactor: ReactorPlatform | null | undefined,
): FrontendToolDefinition[] {
  return spec.frontend.map((entry: ReactorCommandToolSpec) => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters ?? NO_ARGUMENTS,
    location: 'frontend' as const,
    handler: async (args: Record<string, unknown>) => {
      if (!reactor) {
        throw new Error(
          `${entry.name}: the ${spec.plugin ?? spec.id} plugin is not mounted on this page.`,
        );
      }
      const argument = Object.keys(args ?? {}).length > 0 ? args : undefined;
      await reactor.executeCommand(entry.command, argument);
      return { ok: true, command: entry.command, argument };
    },
  }));
}

/** The bundle's backend, called from the page. */
export function reactorBackendTools(
  spec: ReactorToolSpec,
  options: Pick<ReactorToolsOptions, 'backendUrl' | 'fetch'> = {},
): FrontendToolDefinition[] {
  const backend = spec.backend;
  if (!backend) {
    return [];
  }
  const baseUrl = resolveReactorBackendUrl(spec, options.backendUrl);
  const doFetch =
    options.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  return backend.tools.map((tool: ReactorBackendToolSpec) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ?? NO_ARGUMENTS,
    location: 'frontend' as const,
    handler: async (args: Record<string, unknown>) => {
      if (!doFetch) {
        throw new Error(
          `${tool.name}: no fetch available to reach ${baseUrl}.`,
        );
      }
      const { url, init } = buildReactorBackendRequest(
        tool,
        baseUrl,
        args ?? {},
      );
      const response = await doFetch(url, init);
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `${tool.name}: ${tool.method} ${url} answered ${response.status}${detail ? ` — ${detail}` : ''}`,
        );
      }
      if (response.status === 204) {
        return { ok: true };
      }
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : { ok: true };
      } catch {
        return text;
      }
    },
  }));
}

/** Every tool of every bundle: commands first, then the backend. */
export function reactorToolDefinitions(
  specs: ReactorToolSpec[],
  options: ReactorToolsOptions = {},
): FrontendToolDefinition[] {
  return specs
    .filter(spec => spec.enabled !== false)
    .flatMap(spec => [
      ...reactorCommandTools(spec, options.reactor),
      ...reactorBackendTools(spec, options),
    ]);
}

/**
 * The tools of an agent's `reactorTools`, bound to the reactor mounted on
 * this page.
 *
 * Tolerant of there being none: the command tools then fail with a message
 * naming the plugin, which is a better answer to the model than a missing
 * tool, and the backend tools work regardless.
 */
export function useReactorTools(
  specs: ReactorToolSpec[] | undefined,
  options: Omit<ReactorToolsOptions, 'reactor'> = {},
): FrontendToolDefinition[] {
  const reactor = useOptionalReactorPlatform();
  const { backendUrl, fetch: fetchImpl } = options;
  return useMemo(
    () =>
      specs && specs.length > 0
        ? reactorToolDefinitions(specs, {
            reactor,
            backendUrl,
            fetch: fetchImpl,
          })
        : [],
    [specs, reactor, backendUrl, fetchImpl],
  );
}
