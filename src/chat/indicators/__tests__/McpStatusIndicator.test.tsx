/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A failed MCP server is said in the sentence the runtime gives (8 November
 * 2026): "tavily could not start: the runtime cannot reach
 * registry.npmjs.org.", not its raw error.
 */

// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { computeAccessibleDescription } from 'dom-accessibility-api';
import { afterEach, describe, expect, it } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import { McpStatusIndicator } from '../McpStatusIndicator';
import type { McpToolsetsStatusResponse } from '../../../types/mcp';

afterEach(cleanup);

const REASON =
  'tavily could not start: the runtime cannot reach registry.npmjs.org.';

function status(
  servers: McpToolsetsStatusResponse['servers'],
): McpToolsetsStatusResponse {
  return {
    initialized: true,
    ready_count: 0,
    failed_count: 0,
    ready_servers: [],
    failed_servers: {},
    servers,
  };
}

function draw(data: McpToolsetsStatusResponse) {
  render(
    <ThemeProvider>
      <BaseStyles>
        <McpStatusIndicator data={data} />
      </BaseStyles>
    </ThemeProvider>,
  );
}

describe('McpStatusIndicator', () => {
  it('says a failed server by its reason', () => {
    draw(
      status([
        {
          id: 'tavily',
          status: 'failed',
          error: "MCP server 'tavily' failed to start: Connection closed",
          reason: REASON,
        },
      ]),
    );
    const button = screen.getByRole('button', { name: 'MCP server error' });
    const description = computeAccessibleDescription(button);
    expect(description).toContain(REASON);
    expect(description).not.toContain('Connection closed');
  });

  it('says a server starting while the agent answers', () => {
    draw(status([{ id: 'tavily', status: 'starting' }]));
    const button = screen.getByRole('button', {
      name: 'MCP servers starting…',
    });
    expect(computeAccessibleDescription(button)).toContain('tavily: starting');
  });
});
