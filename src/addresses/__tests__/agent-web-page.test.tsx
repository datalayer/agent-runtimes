/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's page at its address (`{name}.web.<domain>`): what it is, its
 * operations, its agent and its four addresses, in its own theme.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_VIEW_ID,
  AgentWebPage,
  readAgentView,
  roleOf,
  visibilityOf,
  type AgentView,
} from '../AgentWebPage';

afterEach(() => {
  cleanup();
});

const VIEW: AgentView = {
  id: 'shop',
  name: 'Shop',
  description: 'Sells lamps.',
  emoji: '🛍️',
  kind: 'chat',
  role: 'company',
  acts_for: '',
  agent: {
    id: 'worker-shopper',
    name: 'Shopper',
    description: 'Finds things.',
    model: 'bedrock:us.anthropic.claude-sonnet-4-6',
    mcp_servers: ['tavily'],
    skills: ['crawl'],
    tools: [{ name: 'lookup_order', description: 'Finds an order.' }],
  },
  operations: [
    {
      operation_id: 'quote',
      method: 'POST',
      path: '/quote',
      summary: 'The total of a basket',
      description: '',
      inputs: {
        type: 'object',
        properties: { items: { type: 'array' } },
        required: ['items'],
      },
      output: { type: 'object', properties: { total: { type: 'number' } } },
      pap: { action: 'orders.quote', scope: 'orders:read' },
    },
  ],
  declares_openapi: true,
  protocols: ['pap', 'a2a'],
  visibility: 'private',
  addresses: {
    agent: {
      host: 'shop.agent.datalayer.ai',
      url: 'https://shop.agent.datalayer.ai',
    },
    mcp: {
      host: 'shop.mcp.datalayer.ai',
      url: 'https://shop.mcp.datalayer.ai/mcp',
    },
    api: {
      host: 'shop.api.datalayer.ai',
      url: 'https://shop.api.datalayer.ai',
    },
    web: {
      host: 'shop.web.datalayer.ai',
      url: 'https://shop.web.datalayer.ai',
    },
  },
  interface: { accent: 'violet', theme: { variant: 'loop', mode: 'light' } },
};

describe('an agent at its address', () => {
  it('shows what it is, its four addresses, its operations and its agent', () => {
    const { getByText, getAllByText } = render(<AgentWebPage view={VIEW} />);
    expect(getByText('Shop')).toBeTruthy();
    expect(getByText('A company’s agent')).toBeTruthy();
    expect(getByText('https://shop.mcp.datalayer.ai/mcp')).toBeTruthy();
    expect(getByText('https://shop.api.datalayer.ai')).toBeTruthy();
    expect(getAllByText('Copy')).toHaveLength(4);
    expect(getByText('The total of a basket')).toBeTruthy();
    expect(getByText('The person approves · orders:read')).toBeTruthy();
    expect(getByText('items')).toBeTruthy();
    expect(getByText('total')).toBeTruthy();
    expect(getByText('tavily')).toBeTruthy();
    expect(getByText('lookup_order')).toBeTruthy();
    expect(getByText(visibilityOf('private'))).toBeTruthy();
  });

  it('says whose a person’s own agent is, and asks anything of one that declares no operations', () => {
    const view: AgentView = {
      ...VIEW,
      role: 'personal',
      acts_for: 'eric',
      declares_openapi: false,
      addresses: null,
    };
    const { getByText, queryByText } = render(<AgentWebPage view={view} />);
    expect(getByText('eric’s own agent')).toBeTruthy();
    expect(getByText(/ask it anything/)).toBeTruthy();
    expect(queryByText('Where it is')).toBeNull();
    expect(roleOf({ role: 'app', acts_for: '' })).toBe('An application');
  });

  it('reads the view its web server wrote into the page', () => {
    const tag = document.createElement('script');
    tag.id = AGENT_VIEW_ID;
    tag.type = 'application/json';
    tag.textContent = JSON.stringify(VIEW);
    document.head.appendChild(tag);
    expect(readAgentView().name).toBe('Shop');
    tag.remove();
    expect(() => readAgentView()).toThrow(/agent's web server/);
  });
});
