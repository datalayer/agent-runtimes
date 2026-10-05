/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A member's connections, as the team graph draws them, read from its
 * Appspec: each connection names an MCP server, whose spec gives its name,
 * its mark (`icon`, as `SpecMark` draws it) and, from the server's actions,
 * the names of its tools.
 *
 * @module components/teams/teamConnections
 */

import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { SERVER_ACTIONS } from '../../specs/actions';
import type { AppSpec } from '../../types/agentspecs';
import type { A2ATeamConnection } from './a2aTeamFlow';

/** A server reference without its version: `odoo-accounting:0.0.1` is `odoo-accounting`. */
const idOf = (ref: string): string => {
  const at = ref.lastIndexOf(':');
  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;
};

/**
 * The connections of an application, each with its server's name and mark
 * and its tools. A connection to a server the catalogue does not have is
 * left out: there is nothing to draw it with.
 */
export function teamConnectionsOf(
  app: Pick<AppSpec, 'connections'>,
): A2ATeamConnection[] {
  const connections: A2ATeamConnection[] = [];
  for (const connection of app.connections ?? []) {
    const id = idOf(connection.server);
    const server = MCP_SERVER_LIBRARY[id];
    if (!server || connections.some(known => known.id === id)) {
      continue;
    }
    // A pattern (`odoo_accounting_*`) is not a name a call has.
    const tools = Object.keys(SERVER_ACTIONS[id]?.tools ?? {}).filter(
      name => !/[*?[]/.test(name),
    );
    connections.push({
      id,
      name: server.name,
      // The system it reaches: the first word of its name ("Odoo Accounting").
      label: server.name.split(/\s+/)[0] || server.name,
      ...(server.icon ? { icon: server.icon } : {}),
      ...(server.emoji ? { emoji: server.emoji } : {}),
      via: 'via MCP',
      tools,
      // The gateway names a toolset's tools after it: `odoo_accounting_…`.
      prefix: `${id.replace(/-/g, '_')}_`,
    });
  }
  return connections;
}
