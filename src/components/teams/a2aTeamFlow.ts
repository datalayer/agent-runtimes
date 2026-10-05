/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which way a team's A2A link carries a message, read from what happens to
 * a request (`A2APeerEvent`).
 *
 * The member that is asked is the peer; the one that asks is the entry (the
 * team's `entry`, who talks to the person). While a request is out — asked,
 * then worked on — the link carries it from the entry to the peer:
 * `asking`. When the peer answers, the answer comes back the other way for a
 * moment: `answering`. Otherwise, and when a request fails, it is `still`.
 *
 * Pure, so that a test reads it and a page drives it the same way.
 *
 * @module components/teams/a2aTeamFlow
 */

import type { A2APeerEvent } from '../../runtimes/browser/a2aPeer';

/** Which way the link carries a message, if it carries one. */
export type A2ATeamFlow = 'still' | 'asking' | 'answering';

/** How long an answer is shown travelling back, in milliseconds. */
export const ANSWER_SHOWN_MS = 1800;

/**
 * The flow after an event: where the link goes now, and for how long it
 * stays that way before it is `still` again (`holdMs`, only for an answer:
 * the request's flow lasts as long as the request).
 */
export function flowAfter(event: A2APeerEvent): {
  flow: A2ATeamFlow;
  holdMs?: number;
} {
  switch (event.phase) {
    case 'asked':
    case 'working':
      return { flow: 'asking' };
    case 'answered':
      return { flow: 'answering', holdMs: ANSWER_SHOWN_MS };
    default:
      return { flow: 'still' };
  }
}

/** The member a message leaves, and the one it reaches, for a flow. */
export function flowEnds(
  flow: A2ATeamFlow,
  entry: string,
  peer: string,
): { from: string; to: string } | undefined {
  if (flow === 'asking') {
    return { from: entry, to: peer };
  }
  if (flow === 'answering') {
    return { from: peer, to: entry };
  }
  return undefined;
}

/**
 * A member's connection, as the graph draws it: an MCP server it reaches,
 * with its mark, and the tools that are its (`teamConnectionsOf` reads them
 * from the member's Appspec and the server's spec).
 */
export type A2ATeamConnection = {
  /** The MCP server's id: `odoo-accounting`. */
  id: string;
  /** The server's name: `Odoo Accounting`. */
  name: string;
  /** What the node says: the system it reaches, `Odoo`. */
  label: string;
  /** Its mark, `<package>:<name>`, as `SpecMark` draws it. */
  icon?: string;
  emoji?: string;
  /** How it is reached, in small words under the label: `via MCP`. */
  via?: string;
  /** Its tools, by name: `odoo_accounting_list_invoices`. */
  tools: string[];
  /** What its tools' names begin with when its spec lists none: `odoo_accounting_`. */
  prefix?: string;
};

/** A tool call a member's connection is answering now. */
export type A2ATeamCall = {
  /** The member that calls. */
  member: string;
  /** The connection called. */
  connection: string;
  /** The tool, as the runtime names it. */
  tool: string;
  /** The call's id, when the runtime gives one. */
  id?: string;
  /** When it started, in milliseconds. */
  started: number;
  /** Ended, but shown until it has been shown {@link CALL_SHOWN_MS}. */
  ended?: boolean;
};

/** The least time a call is shown, in milliseconds: a quick one still reads. */
export const CALL_SHOWN_MS = 900;

/**
 * The connection a tool is of: one whose tools name it (a toolset's prefix
 * before the name is allowed, as a host may add one), else one whose
 * prefix it begins with.
 */
export function connectionOfTool(
  tool: string,
  connections: A2ATeamConnection[],
): A2ATeamConnection | undefined {
  return (
    connections.find(connection =>
      connection.tools.some(
        name =>
          tool === name ||
          tool.endsWith(`_${name}`) ||
          tool.endsWith(`.${name}`),
      ),
    ) ??
    connections.find(
      connection => connection.prefix && tool.includes(connection.prefix),
    )
  );
}

/** A tool's name in a few words, without its connection's prefix: `list invoices`. */
export function toolWords(
  tool: string,
  connection?: A2ATeamConnection,
): string {
  let name = tool;
  const prefix = connection?.prefix;
  if (prefix && name.includes(prefix)) {
    name = name.slice(name.indexOf(prefix) + prefix.length);
  }
  return name.replace(/[_-]+/g, ' ').trim() || tool;
}

/**
 * A tool's own name, without its connection's prefix: `list_invoices` for
 * `odoo_accounting_list_invoices` — as a balloon says it (LOOP T-23).
 */
export function toolOwnName(
  tool: string,
  connections: A2ATeamConnection[],
): string {
  const prefix = connectionOfTool(tool, connections)?.prefix;
  if (prefix && tool.includes(prefix)) {
    return tool.slice(tool.indexOf(prefix) + prefix.length) || tool;
  }
  return tool;
}

/**
 * The calls running after an event of the peer's (`member`): a call it
 * starts to one of its connections is added; its end marks it ended, and
 * drops it once it has been shown long enough (else `holdMs` says when to
 * look again, with {@link pruneCalls}). A new request, an answer or a
 * failure ends them all.
 */
export function callsAfter(
  calls: A2ATeamCall[],
  event: A2APeerEvent,
  member: string,
  connections: A2ATeamConnection[],
  now: number,
): { calls: A2ATeamCall[]; holdMs?: number } {
  if (event.phase !== 'working') {
    return { calls: [] };
  }
  const step = event.tool;
  if (!step) {
    return { calls };
  }
  const connection = connectionOfTool(step.name, connections);
  if (!connection) {
    return { calls };
  }
  if (!step.ended) {
    return {
      calls: [
        ...calls,
        {
          member,
          connection: connection.id,
          tool: step.name,
          ...(step.id ? { id: step.id } : {}),
          started: now,
        },
      ],
    };
  }
  const index = calls.findIndex(
    call =>
      !call.ended &&
      call.connection === connection.id &&
      (step.id && call.id ? call.id === step.id : call.tool === step.name),
  );
  if (index < 0) {
    return { calls };
  }
  const call = calls[index];
  const left = call.started + CALL_SHOWN_MS - now;
  if (left <= 0) {
    return { calls: calls.filter((_, at) => at !== index) };
  }
  return {
    calls: calls.map((c, at) => (at === index ? { ...c, ended: true } : c)),
    holdMs: left,
  };
}

/** The calls without those ended and shown long enough. */
export function pruneCalls(calls: A2ATeamCall[], now: number): A2ATeamCall[] {
  const kept = calls.filter(
    call => !call.ended || call.started + CALL_SHOWN_MS > now,
  );
  return kept.length === calls.length ? calls : kept;
}
