/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP servers: the catalogue carries what each spec says of itself — where
 * to read about it and get its key, its tags, its env, and what its tools do
 * (the user, 7 November 2026).
 */

import { describe, expect, it } from 'vitest';
import { MCP_SERVER_LIBRARY } from '../mcpServers';
import { ENVVAR_CATALOG } from '../envvars';

describe('the MCP server catalogue', () => {
  it('says where to read about each server and how it is set up', () => {
    for (const server of Object.values(MCP_SERVER_LIBRARY)) {
      expect([server.id, typeof server.setup]).toEqual([server.id, 'string']);
      expect([server.id, (server.tags ?? []).length > 0]).toEqual([
        server.id,
        true,
      ]);
    }
    const earthdata = MCP_SERVER_LIBRARY.earthdata;
    expect(earthdata.documentationUrl).toBe(
      'https://github.com/datalayer/earthdata-mcp-server',
    );
    expect(earthdata.signupUrl).toBe(
      'https://urs.earthdata.nasa.gov/users/new',
    );
    expect(earthdata.apiKeyUrl).toBe('https://datalayer.ai/settings/api-keys');
    expect(earthdata.sandboxEnvVars).toEqual([
      'EARTHDATA_USERNAME:0.0.1',
      'EARTHDATA_PASSWORD:0.0.1',
    ]);
    expect(earthdata.headers).toEqual({
      Authorization: 'Bearer ${DATALAYER_API_KEY}',
    });
  });

  it('gives LinkedIn the person’s session from Settings when there, never required (the user, 15 November 2026)', () => {
    const linkedin = MCP_SERVER_LIBRARY.linkedin;
    expect(linkedin.requiredEnvVars).toEqual([]);
    expect(linkedin.optionalEnvVars).toEqual(['LINKEDIN_LI_AT:0.0.1']);
    expect(linkedin.setup).toContain('Settings › LinkedIn');
    const cookie = ENVVAR_CATALOG.LINKEDIN_LI_AT;
    expect(cookie.name).toBe('LinkedIn session cookie (li_at)');
    expect(cookie.description).toContain('`li_at`');
    expect(cookie.description).toContain('Application › Storage › Cookies');
    expect(cookie.registrationUrl).toBe('https://www.linkedin.com');
  });

  it('carries what each tool does to the world, and the day it was checked', () => {
    const tavily = MCP_SERVER_LIBRARY.tavily;
    expect(tavily.actions?.checked).toBe('2026-11-25');
    expect(tavily.actions?.tools).toMatchObject({
      tavily_search: 'read',
      tavily_crawl: 'read',
    });
    // Tavily's hosted server: the key in a header, never in an address or an environment.
    expect(tavily.url).toBe('https://mcp.tavily.com/mcp/');
    expect(tavily.headers).toEqual({
      Authorization: 'Bearer ${TAVILY_API_KEY}',
    });
    expect(tavily.env ?? {}).toEqual({});
    // A server not read off yet says so: no tool classed, unknown is the most restricted.
    expect(MCP_SERVER_LIBRARY.github.actions?.tools).toEqual({});
    expect(MCP_SERVER_LIBRARY.github.actions?.checked).toBeUndefined();
  });
});
