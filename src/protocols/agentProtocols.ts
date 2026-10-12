/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `agent-protocols` Reactor Extension: the protocol plugins, delivered
 * together. An Extension only groups plugins for delivery; it has no
 * lifecycle and contributes nothing (AGENT_PROTOCOLS §3.1).
 *
 * @module protocols/agentProtocols
 */

import {
  buildReactorFromPlugins,
  defineExtension,
  type PlatformInput,
  type ReactorPlatform,
} from '@datalayer/reactor';
import { A2APlugin } from './a2a';
import { AgenticCommercePlugin } from './agentic-commerce';
import { ProtocolsCorePlugin } from './core';
import { McpPlugin } from './mcp';
import { PactPlugin } from './pact';
import { UcpPlugin } from './ucp';
import { WebBotAuthPlugin } from './web-bot-auth';

export const AGENT_PROTOCOLS_EXTENSION = 'agent-protocols';

export const AgentProtocolsExtension = defineExtension({
  name: AGENT_PROTOCOLS_EXTENSION,
  version: '1.0.0',
  displayName: 'Agent protocols',
  description:
    'MCP, A2A, Web Bot Auth, UCP, the Agentic Commerce Protocol and PACT, each a plugin; their extensions its contribution points.',
  plugins: [
    ProtocolsCorePlugin,
    McpPlugin,
    A2APlugin,
    WebBotAuthPlugin,
    UcpPlugin,
    AgenticCommercePlugin,
    PactPlugin,
  ],
});

/**
 * A started Reactor with the `agent-protocols` Extension, then the host's
 * plugins: their lower-order contributions replace the protocols' defaults.
 */
export function buildProtocolsReactor(
  plugins: PlatformInput[] = [],
): ReactorPlatform {
  const reactor = buildReactorFromPlugins([
    AgentProtocolsExtension,
    ...plugins,
  ]);
  reactor.start();
  return reactor;
}
