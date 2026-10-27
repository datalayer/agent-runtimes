/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Protocol Catalog.
 *
 * The agent protocols Datalayer targets (PS-01).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ProtocolSpec } from '../types/agentspecs';

export const A2A_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'a2a',
  version: '0.0.1',
  name: 'Agent2Agent',
  description:
    "How agents talk to agents: teams and scenes talk over it, an application's route serves it, and its Agent Card advertises its extensions.",
  publisher: 'Google, now the Linux Foundation',
  layer: 'transport',
  specUrl: 'https://a2a-protocol.org',
  specVersion: '1.0',
  status: 'shipped',
  connects: 'Other agents, each at its address with its Agent Card',
  packages: {
    python: ['fasta2a', 'a2a-sdk'],
    typescript: ['@a2a-js/sdk'],
  },
  protocolTools: [],
  appspecBlock: 'a2a',
};

export const A2UI_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'a2ui',
  version: '0.0.1',
  name: 'A2UI',
  description:
    "How an agent's answer becomes an interface: components the host renders from a declarative surface.",
  publisher: 'Google',
  layer: 'ui',
  specUrl: 'https://a2ui.org',
  specVersion: '0.9',
  status: 'shipped',
  connects: 'The person, through components an answer draws',
  packages: {
    python: ['agent-runtimes'],
    typescript: ['@a2ui/react', '@a2ui/web_core'],
  },
  protocolTools: [],
};

export const ACP_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'acp',
  version: '0.0.1',
  name: 'Agentic Commerce Protocol',
  description:
    'Checkout sessions at a seller, completed with a payment the model never sees. In applications at test merchants only, with no real payment token (decided 2026-10-13): each purchase asked of the person first, made at most once.',
  publisher: 'OpenAI, Stripe',
  layer: 'commerce',
  specUrl:
    'https://github.com/agentic-commerce-protocol/agentic-commerce-protocol',
  specVersion: '2026-04-17',
  status: 'shipped',
  connects: 'Sellers, to check out with a delegated payment',
  packages: {
    python: ['agent-runtimes'],
    typescript: ['@datalayer/agent-runtimes'],
  },
  protocolTools: ['agentic-commerce'],
};

export const AG_UI_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'ag-ui',
  version: '0.0.1',
  name: 'AG-UI',
  description:
    'How an agent streams its run to a page: messages, tool calls and state as events.',
  publisher: 'CopilotKit',
  layer: 'ui',
  specUrl: 'https://docs.ag-ui.com',
  specVersion: '0.0.57 (@ag-ui/core)',
  status: 'shipped',
  connects: 'The page a person talks to the agent on',
  packages: {
    python: ['ag-ui-protocol'],
    typescript: ['@ag-ui/client', '@ag-ui/core'],
  },
  protocolTools: [],
};

export const MCP_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'mcp',
  version: '0.0.1',
  name: 'Model Context Protocol',
  description:
    'How an agent calls tools and reads resources: clients and servers in both languages, and the MCP gateway every connection goes through.',
  publisher: 'Anthropic',
  layer: 'transport',
  specUrl: 'https://modelcontextprotocol.io/specification',
  specVersion: '2026-07-28 (Python), 2025-11-25 (TypeScript)',
  status: 'shipped',
  connects: 'Tools, resources and prompts served by MCP servers',
  packages: {
    python: ['mcp'],
    typescript: ['@modelcontextprotocol/sdk', '@mcp-ui/client'],
  },
  protocolTools: [],
};

export const PACT_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'pact',
  version: '0.0.1',
  name: 'Personal Agent Consent & Trust',
  description:
    "A personal agent asking a business's agent over A2A, first as itself, then for a person who delegated some of their permissions.",
  publisher: 'Decagon, Instinct',
  layer: 'consent',
  specUrl: 'https://openpactprotocol.org',
  specVersion: '1.0',
  status: 'shipped',
  connects: "Businesses' agents, asked for a person with their delegation",
  packages: {
    python: ['agent-runtimes'],
    typescript: ['@datalayer/agent-runtimes'],
  },
  protocolTools: ['pact'],
  appspecBlock: 'pact',
};

export const PAP_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'pap',
  version: '0.0.1',
  name: 'Personal Agent Protocol',
  description:
    "A person's agent working with a company for them — signed out, then signed in at the company, its changes confirmed by the person — and an application being a company personal agents reach.",
  publisher: 'Sierra, Meta',
  layer: 'consent',
  specUrl: 'https://personalagentprotocol.org',
  specVersion: 'draft 0.3',
  status: 'shipped',
  connects: "Companies, as a person's agent there, or being one",
  packages: {
    python: ['personal-agent-protocol'],
    typescript: ['@datalayer/personal-agent-protocol'],
  },
  protocolTools: ['pap'],
  appspecBlock: 'pap',
};

export const TAP_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'tap',
  version: '0.0.1',
  name: 'Trusted Agent Protocol',
  description:
    "An agent-recognition profile over Web Bot Auth for merchants: a signature tagged agent-browser-auth to browse or agent-payer-auth to pay. Still a draft profile, built from Visa's public Merchant Specifications (2026-10-13) until Visa confirms it. In applications at test merchants only (decided 2026-10-14): the MCP gateway signs each UCP or ACP purchase with agent-payer-auth under the application's own key, and the test merchants verify it; browsing stays Web Bot Auth.",
  publisher: 'Visa',
  layer: 'identity',
  specUrl:
    'https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications',
  specVersion: 'draft (Merchant Specifications, read 2026-10-13)',
  status: 'shipped',
  connects: 'Merchants that recognise an agent by its signature',
  packages: {
    python: ['agent-runtimes'],
    typescript: ['@datalayer/agent-runtimes', 'http-message-sig'],
  },
  protocolTools: [],
};

export const UCP_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'ucp',
  version: '0.0.1',
  name: 'Universal Commerce Protocol',
  description:
    'Shopping at a merchant: catalogue, checkout and orders, every purchase an exact proposal the person approves. In applications at test merchants only, with no real payment (decided 2026-10-13): each purchase asked of the person first, made at most once.',
  publisher: 'Google, with Shopify and retailers',
  layer: 'commerce',
  specUrl: 'https://github.com/Universal-Commerce-Protocol/ucp',
  specVersion: '2026-08-25',
  status: 'shipped',
  connects: 'Merchants, to search, check out and follow orders',
  packages: {
    python: ['ucp-sdk', 'agent-runtimes'],
    typescript: ['@ucp-js/sdk', '@datalayer/agent-runtimes'],
  },
  protocolTools: ['ucp'],
};

export const WEB_BOT_AUTH_PROTOCOL_0_0_1: ProtocolSpec = {
  id: 'web-bot-auth',
  version: '0.0.1',
  name: 'Web Bot Auth',
  description:
    'Signed outbound requests (RFC 9421) and the key directory a website checks them against. In applications, every request to a company, business or merchant is signed, and a signed fetch reads pages at the sites an application names, GET only (decided 2026-10-13).',
  publisher: 'Cloudflare (IETF draft)',
  layer: 'identity',
  specUrl:
    'https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/',
  specVersion: 'draft-ietf-webbotauth-httpsig-protocol-00',
  status: 'shipped',
  connects:
    "Websites, which can tell the application's requests from someone pretending",
  packages: {
    python: ['agent-runtimes'],
    typescript: ['@datalayer/agent-runtimes', 'web-bot-auth'],
  },
  protocolTools: ['signed-fetch'],
  appspecBlock: 'signed_fetch',
};

export const PROTOCOL_CATALOGUE: Record<string, ProtocolSpec> = {
  a2a: A2A_PROTOCOL_0_0_1,
  a2ui: A2UI_PROTOCOL_0_0_1,
  acp: ACP_PROTOCOL_0_0_1,
  'ag-ui': AG_UI_PROTOCOL_0_0_1,
  mcp: MCP_PROTOCOL_0_0_1,
  pact: PACT_PROTOCOL_0_0_1,
  pap: PAP_PROTOCOL_0_0_1,
  tap: TAP_PROTOCOL_0_0_1,
  ucp: UCP_PROTOCOL_0_0_1,
  'web-bot-auth': WEB_BOT_AUTH_PROTOCOL_0_0_1,
};

/** A protocol by id. */
export function getProtocol(protocolId: string): ProtocolSpec | undefined {
  return PROTOCOL_CATALOGUE[protocolId];
}

/** Every protocol of the catalogue. */
export function listProtocolSpecs(): ProtocolSpec[] {
  return Object.values(PROTOCOL_CATALOGUE);
}
