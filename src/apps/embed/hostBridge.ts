/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The host page and an embedded application, talking (LOOP D-10).
 *
 * In: the values the page passes — `user`, `page`, or names of its own —
 * read by the application's agent with the tool `host_context`, only those
 * its Appspec names (`deployment.embedded.host.context`).
 *
 * Out: what the application does, as events — `message` when it has said
 * something, `action` when it called a function of the page,
 * `window-message` when its code told the page something outside the
 * conversation (LOOP P-25, `session.send_window_message`) — beside the
 * `decision` and `token-expired` the element raises already.
 *
 * Window messages, in (P-25): the page posts one with
 * `element.postWindowMessage(data)`; its code's `@app.window` reads it, on
 * the host's own server (`server`), and what it answers comes back as
 * `window-message` events.
 *
 * Who its user is (LOOP D-21): what the page says as `user` is a claim.
 * An application whose Appspec says `deployment.embedded.host.user: signed`
 * takes only a token the host's **server** signed with the deployment's
 * secret (HS256: `sub`, `name`, `exp` at most an hour away), which the page
 * hands over as `userToken` (the element's `user-token`). It goes with every
 * run as `forwardedProps.loop.user_token` (`hostUserRunProps`); the runtime
 * verifies it where the session opens, refuses the session without it, and
 * answers `host_context`'s `user` with the user it names. The secret never
 * reaches the page.
 *
 * Offered: the functions of the page its Appspec names
 * (`deployment.embedded.host.functions`), each called by its agent as the
 * tool `host_<name>`. Every one of these tools is decided in the page by
 * the rule that names it (`behaviourFor`), before the page is called: one no
 * rule names, or *leave it to me*, is refused; *ask me first* and *do it if
 * I asked* ask the person on the page (`ask`, else the browser's `confirm`),
 * and a call they do not allow is refused; *do it* is done.
 *
 * Pure: the tools call the page, and ask, through what they are given.
 *
 * @module apps/embed/hostBridge
 */

import type { AppBehaviour, AppSpec } from '../../types/agentspecs';
import type { FrontendToolDefinition } from '../../types/tools';
import type { RunPropsContribution } from '../core';
import { behaviourFor } from '../apps/rules';
import {
  HOST_CONTEXT_TOOL,
  HOST_NAME,
  hostTool,
  hostToolsOf,
  signedUser,
} from '../apps/hostTools';

export { HOST_CONTEXT_TOOL, HOST_NAME, hostTool, hostToolsOf, signedUser };

/** What the application tells the page it sits in. */
export type HostEvent =
  | {
      type: 'message';
      /** What it said, as written. */
      detail: { id: string; text: string };
    }
  | {
      type: 'action';
      /** A function of the page it called, with what came back or why not. */
      detail: {
        function: string;
        arguments: Record<string, unknown>;
        result?: unknown;
        error?: string;
      };
    }
  | {
      type: 'window-message';
      /** What its code told the page (LOOP P-25): anything JSON writes. */
      detail: { data: unknown };
    };

/** Posts a window message to the application's session (LOOP P-25). */
export type WindowPost = (data: unknown) => Promise<void>;

/** A function of the page, as the page gives it. */
export type HostFunction = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

/** What the page gives an embedded application (LOOP D-10). */
export type AppEmbedHost = {
  /** What the page passes now: its visitor (`user`), itself (`page`), values of its own. */
  context?: () => Record<string, unknown>;
  /**
   * The token the host's server signed naming its user (LOOP D-21), read as
   * each run is sent: what an application that says `user: signed` opens its
   * session with. Never the deployment's secret.
   */
  userToken?: () => string | undefined;
  /** The page's functions, by the names the Appspec gives them. */
  functions?: Record<string, HostFunction>;
  /** Told what the application does: `message`, `action`. */
  onEvent?: (event: HostEvent) => void;
  /**
   * Asks the person on the page whether a call its rule says to ask first
   * may be made; the browser's `confirm` when the page gives none.
   */
  ask?: (question: HostQuestion) => boolean | Promise<boolean>;
  /**
   * Handed how a window message is posted to the application's session once
   * the embed can (LOOP P-25) — on the host's own server, its conversation
   * started — and `null` when it no longer can.
   */
  onWindowPort?: (post: WindowPost | null) => void;
};

/** What the person is asked before a call of the page is made. */
export type HostQuestion = {
  /** The function, as the Appspec names it. */
  function: string;
  arguments: Record<string, unknown>;
  /** The question, in a sentence. */
  sentence: string;
};

/** The sentence a call is refused with when no rule names its tool. */
export const hostRefused = (tool: string): string =>
  `No rule of this application names ${tool}: it is left to the person, and the page was not called.`;

/** The sentence a call is refused with when the person did not allow it. */
export const hostNotAllowed = (tool: string): string =>
  `The person did not allow ${tool}: the page was not called.`;

/** Asks with the browser's `confirm`, where there is one; refuses where not. */
const confirmOnPage = (question: HostQuestion): boolean =>
  typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm(question.sentence)
    : false;

/** The words of the rule that names the tool, for the question. */
const actionOf = (
  app: Pick<AppSpec, 'rules'>,
  tool: string,
): string | undefined =>
  app.rules.find(rule => rule.appliesTo.includes(tool))?.action;

/**
 * The frontend tools its agent is given for the page: `host_context` when
 * the Appspec names values, and `host_<name>` for each function it names.
 * `host` is read at each call, so that what the page passes is the newest.
 */
export function hostFrontendTools(
  app: Pick<AppSpec, 'connections' | 'rules' | 'deployment'>,
  host: () => AppEmbedHost,
): FrontendToolDefinition[] {
  const bridge = app.deployment.embedded?.host;
  if (!bridge) {
    return [];
  }
  const behaviour = (tool: string): AppBehaviour => behaviourFor(app, tool);
  const ruled = (tool: string): boolean => behaviour(tool) !== 'leave_to_me';
  const tools: FrontendToolDefinition[] = [];
  if (bridge.context.length > 0) {
    tools.push({
      name: HOST_CONTEXT_TOOL,
      description: `What the page you are embedded in says of its visitor and of itself: ${bridge.context.join(', ')}. Read it before answering what depends on them.`,
      parameters: { type: 'object', properties: {} },
      location: 'frontend',
      handler: async () => {
        if (!ruled(HOST_CONTEXT_TOOL)) {
          return { error: hostRefused(HOST_CONTEXT_TOOL) };
        }
        const passed = host().context?.() ?? {};
        const values: Record<string, unknown> = {};
        const unsaid: string[] = [];
        for (const name of bridge.context) {
          if (passed[name] === undefined) {
            unsaid.push(name);
          } else {
            values[name] = passed[name];
          }
        }
        return { values, ...(unsaid.length > 0 ? { unsaid } : {}) };
      },
    });
  }
  for (const fn of bridge.functions) {
    const tool = hostTool(fn.name);
    tools.push({
      name: tool,
      description: fn.description,
      parameters: fn.parameters,
      location: 'frontend',
      handler: async (args: Record<string, unknown>) => {
        const said = (detail: { result?: unknown; error?: string }) => {
          host().onEvent?.({
            type: 'action',
            detail: { function: fn.name, arguments: args, ...detail },
          });
          return detail;
        };
        if (!ruled(tool)) {
          return said({ error: hostRefused(tool) });
        }
        if (behaviour(tool) !== 'do_it') {
          const action = actionOf(app, tool) ?? fn.description;
          const ask = host().ask ?? confirmOnPage;
          const allowed = await ask({
            function: fn.name,
            arguments: args,
            sentence: `${action}? (${fn.name} with ${JSON.stringify(args)})`,
          });
          if (!allowed) {
            return said({ error: hostNotAllowed(tool) });
          }
        }
        const call = host().functions?.[fn.name];
        if (!call) {
          return said({
            error: `The page offers no function ${fn.name}: it was not called.`,
          });
        }
        try {
          return said({ result: await call(args) });
        } catch (error) {
          return said({
            error: `The page's ${fn.name} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      },
    });
  }
  return tools;
}

/**
 * What goes with every run for the host's user (LOOP D-21): the token the
 * host's server signed, as `forwardedProps.loop.user_token`, for an
 * application that says `user: signed` — read at each run, so that the
 * newest is sent; nothing when the page gives none, and the runtime refuses
 * the session in a sentence. `undefined` for an application that takes what
 * the page says.
 */
export function hostUserRunProps(
  app: Pick<AppSpec, 'deployment'>,
  host: () => AppEmbedHost,
): RunPropsContribution | undefined {
  if (!signedUser(app.deployment.embedded?.host)) {
    return undefined;
  }
  return {
    id: 'host-user',
    props: () => {
      const token = host().userToken?.()?.trim();
      return token ? { loop: { user_token: token } } : {};
    },
  };
}

/** A user token ai-agents signed, and when it ends (seconds since the epoch). */
export type SignedUserToken = { token: string; exp: number };

/**
 * Asks ai-agents to sign the person signed in to Datalayer as a deployment's
 * user (LOOP D-21; STUDIO A-18 to A-20), with their own token: what a
 * surface that has no host server holding the deployment's secret — the
 * VS Code extension, Jupyter AI Agents, Datalayer Desktop — sends as
 * `forwardedProps.loop.user_token` with the runs of an application that
 * says `user: signed`. HS256 with the deployment's secret, `sub` the
 * person's uid, `name` theirs, fifteen minutes; refused (`403`) for an
 * application's principal or a narrowed token, and for a person the
 * deployment does not let in. Those surfaces share no code, so they copy
 * it.
 *
 * @param aiAgentsUrl - The ai-agents service's base URL.
 * @param deploymentUid - The deployment talked to.
 * @param token - The person's Datalayer token.
 * @param fetcher - What asks; `fetch` unless given.
 *
 * @returns The user token and when it ends.
 *
 * @throws With ai-agents' sentence when it refuses.
 */
export async function fetchUserToken(
  aiAgentsUrl: string,
  deploymentUid: string,
  token: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<SignedUserToken> {
  const url = `${aiAgentsUrl.replace(/\/+$/, '')}/api/ai-agents/v1/apps/deployments/${encodeURIComponent(deploymentUid)}/user-token`;
  const response = await fetcher(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  let body: Record<string, unknown> = {};
  try {
    const read = await response.json();
    body =
      read && typeof read === 'object' ? (read as Record<string, unknown>) : {};
  } catch {
    // The status says it.
  }
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : '';
    throw new Error(
      detail || `ai-agents refused to sign you (${response.status}).`,
    );
  }
  const signed = typeof body.user_token === 'string' ? body.user_token : '';
  const exp = Number(body.exp);
  if (!signed || !Number.isFinite(exp)) {
    throw new Error('ai-agents answered no user token.');
  }
  return { token: signed, exp };
}
