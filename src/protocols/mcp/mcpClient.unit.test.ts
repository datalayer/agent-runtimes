/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP conformance in TypeScript (AGENT_PROTOCOLS PR-51, EX-09), as
 * `test_protocols_mcp.py`: the fixture's wire answers read through
 * `@modelcontextprotocol/sdk`'s schemas, and the `McpClient` reading a server
 * of the SDK that answers the fixture, in memory — the same readings the
 * Python suite expects from the same file.
 */

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/mcp/fixtures/session.json';
import {
  McpClient,
  callReading,
  promptReading,
  resourceReading,
  toolReading,
} from './client';
import { MCP_SPECIFICATION_VERSION } from './index';

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** A server of the SDK answering the fixture's wire answers, and nothing else. */
function fixtureServer(): Server {
  const server = new Server(fixture.server, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
  });
  server.setRequestHandler(ListToolsRequestSchema, () =>
    ListToolsResultSchema.parse(fixture.tools.wire),
  );
  server.setRequestHandler(CallToolRequestSchema, request => {
    const call = fixture.calls.find(
      c =>
        c.tool === request.params.name &&
        same(c.arguments, request.params.arguments ?? {}),
    );
    if (!call) {
      const refused: CallToolResult = {
        content: [
          {
            type: 'text',
            text: `The fixture has no call of ${request.params.name} with these arguments.`,
          },
        ],
        isError: true,
      };
      return refused;
    }
    return CallToolResultSchema.parse(call.wire);
  });
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: fixture.resources.map(({ uri, name, mimeType }) => ({
      uri,
      name,
      mimeType,
    })),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, request => {
    const resource = fixture.resources.find(r => r.uri === request.params.uri);
    if (!resource) {
      throw new Error(`The fixture has no resource ${request.params.uri}.`);
    }
    return ReadResourceResultSchema.parse(resource.wire);
  });
  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: fixture.prompts.map(({ name, description, arguments: args }) => ({
      name,
      description,
      arguments: args,
    })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, request => {
    const prompt = fixture.prompts.find(
      p =>
        p.name === request.params.name &&
        same(p.get, request.params.arguments ?? {}),
    );
    if (!prompt) {
      throw new Error(`The fixture has no prompt ${request.params.name}.`);
    }
    return GetPromptResultSchema.parse(prompt.wire);
  });
  return server;
}

describe('MCP: the readings both languages agree on', () => {
  it('speaks the version the fixture says', () => {
    expect(LATEST_PROTOCOL_VERSION).toBe(fixture.versions.typescript);
    expect(MCP_SPECIFICATION_VERSION).toBe(fixture.versions.typescript);
  });

  it('reads the tools listed with the specification defaults', () => {
    const listed = ListToolsResultSchema.parse(fixture.tools.wire);
    expect(listed.tools.map(toolReading)).toEqual(fixture.tools.read);
  });

  it('reads each answer as the fixture says', () => {
    for (const call of fixture.calls) {
      expect(callReading(CallToolResultSchema.parse(call.wire))).toEqual(
        call.read,
      );
    }
  });

  it('reads resources and prompts as the fixture says', () => {
    for (const resource of fixture.resources) {
      expect(
        resourceReading(ReadResourceResultSchema.parse(resource.wire)),
      ).toEqual(resource.read);
    }
    for (const prompt of fixture.prompts) {
      expect(promptReading(GetPromptResultSchema.parse(prompt.wire))).toEqual(
        prompt.read,
      );
    }
  });

  it('refuses a binary resource rather than decoding it', () => {
    const blob = ReadResourceResultSchema.parse({
      contents: [{ uri: 'note://logo', mimeType: 'image/png', blob: 'AA==' }],
    });
    expect(() => resourceReading(blob)).toThrow('note://logo is not text.');
  });
});

describe('McpClient: a server of the SDK answering the fixture', () => {
  it('reads it as the fixture says', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = fixtureServer();
    await server.connect(serverSide);
    const client = await McpClient.connect({ transport: clientSide });
    try {
      expect(client.protocolVersion).toBe(fixture.versions.typescript);
      expect(await client.listTools()).toEqual(fixture.tools.read);
      for (const call of fixture.calls) {
        expect(await client.callTool(call.tool, call.arguments)).toEqual(
          call.read,
        );
      }
      for (const resource of fixture.resources) {
        expect(await client.readResource(resource.uri)).toEqual(resource.read);
      }
      for (const prompt of fixture.prompts) {
        expect(await client.getPrompt(prompt.name, prompt.get)).toEqual(
          prompt.read,
        );
      }
      const refused = await client.callTool('add', { a: 1, b: 1 });
      expect(refused.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
