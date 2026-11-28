/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/**
 * The Personal Agent Protocol's tools in the chat, called Poppy (the user, 27
 * November 2026): named "Poppy <action> · <company>" with their ids kept, and
 * what the company answered drawn under the row without opening it.
 */
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ToolCallDisplay,
  poppyBodyOf,
  poppyToolOf,
} from '../tools/ToolCallDisplay';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PRODUCTS = {
  status: 200,
  body: {
    count: 1,
    products: [
      {
        id: 'chopping-board',
        title: 'Chopping Board',
        category: 'kitchen',
        price: 12.99,
        currency: 'USD',
        rating: 3.7,
        stock: 14,
      },
    ],
  },
};

function draw(props: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ToolCallDisplay toolCallId="call-1" args={{}} {...(props as any)} />,
    );
  });
  return host;
}

describe('Poppy tools', () => {
  it('reads a company’s tool and a visitor’s, ids kept', () => {
    expect(
      poppyToolOf('pap_online_shop_agent_datalayer_ai_pap_propose'),
    ).toEqual({
      company: 'online_shop_agent_datalayer_ai',
      action: 'propose',
    });
    expect(poppyToolOf('pap_read')).toEqual({ company: '', action: 'read' });
    expect(poppyToolOf('list_invoices')).toBeNull();
  });

  it('is named Poppy in the chat, its action then its company', () => {
    const host = draw({
      toolName: 'pap_online_shop_agent_datalayer_ai_pap_propose',
      status: 'inProgress',
    });
    expect(host.textContent).toContain(
      'Poppy Propose · Online Shop Agent Datalayer Ai',
    );
    expect(host.textContent).not.toMatch(/\bPap\b/);
  });

  it('draws the products a company answered, the row closed', () => {
    const host = draw({
      toolName: 'pap_online_shop_agent_datalayer_ai_pap_propose',
      status: 'complete',
      result: PRODUCTS,
    });
    const drawn = host.querySelector('[data-poppy-result]');
    expect(drawn?.textContent).toContain('Chopping Board');
    // From a JSON string too.
    expect(poppyBodyOf(JSON.stringify(PRODUCTS))?.count).toBe(1);
  });

  it('draws no cards for another tool, and a Poppy answer with no products or lines as its fields', () => {
    expect(
      draw({
        toolName: 'list_invoices',
        status: 'complete',
        result: PRODUCTS,
      }).querySelector('[data-poppy-result]'),
    ).toBeNull();
    const plain = draw({
      toolName: 'pap_read',
      status: 'complete',
      result: { status: 200, body: { ok: true } },
    });
    // Drawn as any tool's answer since 28 November 2026: its body's fields.
    expect(
      plain.querySelector('[data-poppy-result] [data-tool-result-fields]')
        ?.textContent,
    ).toContain('ok');
  });
});
