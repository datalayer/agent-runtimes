/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP as a Reactor Plugin. It says what it is on `protocols.description` and
 * declares no point yet: MCP's optional capabilities and extensions become
 * `mcp.extension.<name>` points when the MCP client and server read them
 * from contributions (AGENT_PROTOCOLS PR-01). The twin of
 * `agent_runtimes.protocols.mcp`. Its client, on the official
 * `@modelcontextprotocol/sdk`, is `./client` (PR-51).
 *
 * @module protocols/mcp
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { DEFAULT_ORDER, ProtocolDescriptions } from '../core';

export const MCP_PLUGIN = 'agent-runtimes.protocols.mcp';
/** The MCP specification version of the `@modelcontextprotocol/sdk` installed (1.32: `LATEST_PROTOCOL_VERSION`); Python's `mcp` 2.1 speaks 2026-07-28. */
export const MCP_SPECIFICATION_VERSION = '2025-11-25';

export const McpPlugin = definePlugin({
  name: MCP_PLUGIN,
  version: '1.0.0',
  description: 'Model Context Protocol: tools, resources and prompts.',
  contributionPoints: [],
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'mcp',
        name: 'Model Context Protocol',
        layer: 'transport',
        version: MCP_SPECIFICATION_VERSION,
        roles: ['client', 'server'],
        status: 'implemented',
        specification: 'https://modelcontextprotocol.io/specification',
        plugin: MCP_PLUGIN,
        catalogue: 'mcp',
        points: [],
      },
      { id: 'mcp', order: DEFAULT_ORDER },
    ),
  ],
});

export * from './client';
