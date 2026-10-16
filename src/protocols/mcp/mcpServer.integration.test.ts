/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The TypeScript MCP client at the Python server (PR-51):
 * `examples/protocols/mcp/fixture_server.py`, a server of the `mcp` SDK
 * answering the conformance fixture, at `MCP_FIXTURE_SERVER` over Streamable
 * HTTP — the readings the fixture says, and the version both SDKs agree on
 * (Python's speaks 2026-07-28, TypeScript's 2025-11-25).
 *
 * `agent_runtimes/tests/test_protocols_mcp_two_languages.py` serves it and
 * runs this file; without `MCP_FIXTURE_SERVER` there is no server and it
 * does not run.
 */

import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/mcp/fixtures/session.json';
import { McpClient } from './client';

const SERVER = process.env.MCP_FIXTURE_SERVER ?? '';

describe.skipIf(!SERVER)(
  'MCP: the TypeScript client at the Python server',
  () => {
    it('reads it as the fixture says', async () => {
      const client = await McpClient.connect({ url: SERVER });
      try {
        expect(client.protocolVersion).toBe(fixture.versions.between);
        expect(await client.listTools()).toEqual(fixture.tools.read);
        for (const call of fixture.calls) {
          expect(await client.callTool(call.tool, call.arguments)).toEqual(
            call.read,
          );
        }
        for (const resource of fixture.resources) {
          expect(await client.readResource(resource.uri)).toEqual(
            resource.read,
          );
        }
        for (const prompt of fixture.prompts) {
          expect(await client.getPrompt(prompt.name, prompt.get)).toEqual(
            prompt.read,
          );
        }
      } finally {
        await client.close();
      }
    });
  },
);
