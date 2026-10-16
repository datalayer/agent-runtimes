/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An MCP client in TypeScript, on the official `@modelcontextprotocol/sdk`
 * (PR-51, decided 2026-10-13), and what it reads from a
 * server's answers — the twin of `agent_runtimes.protocols.mcp.reading`.
 *
 * The readings are the plain shape both languages agree on, held to
 * `agent_runtimes/protocols/mcp/fixtures/session.json` by the pytest and the
 * vitest. A tool's missing annotations are read with the specification's
 * defaults (`readOnlyHint` false, `destructiveHint` true, `idempotentHint`
 * false, `openWorldHint` true), so a server that says nothing is never read
 * as harmless; `destructiveHint` means something only when the tool is not
 * read-only, so a read-only tool is never destructive.
 *
 * @module protocols/mcp/client
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

/** A listed tool as a client reads it. */
export interface McpToolReading {
  name: string;
  title: string | null;
  description: string | null;
  /** Its parameters' names, sorted. */
  parameters: string[];
  /** Those it requires, sorted. */
  required: string[];
  /** Whether it says an output schema (answers structured content). */
  structured: boolean;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
}

/** A tool's answer as a client reads it. */
export interface McpCallReading {
  isError: boolean;
  /** Its text parts, joined by a newline. */
  text: string;
  structured: Record<string, unknown> | null;
}

/** A text resource's contents as a client reads them. */
export interface McpResourceReading {
  uri: string;
  mimeType: string | null;
  text: string;
}

/** A prompt's message as a client reads it. */
export interface McpPromptReading {
  role: 'user' | 'assistant';
  text: string;
}

const sorted = (values: Iterable<string>): string[] =>
  [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** A listed tool: its parameters, whether it answers structured, its hints. */
export function toolReading(tool: Tool): McpToolReading {
  const hints = tool.annotations;
  const readOnly = hints?.readOnlyHint === true;
  return {
    name: tool.name,
    title: tool.title ?? null,
    description: tool.description ?? null,
    parameters: sorted(Object.keys(tool.inputSchema.properties ?? {})),
    required: sorted(tool.inputSchema.required ?? []),
    structured: tool.outputSchema !== undefined,
    readOnly,
    destructive: !readOnly && hints?.destructiveHint !== false,
    idempotent: hints?.idempotentHint === true,
    openWorld: hints?.openWorldHint !== false,
  };
}

/** A tool's answer: refused or not, its text parts joined, its structured content. */
export function callReading(result: CallToolResult): McpCallReading {
  return {
    isError: result.isError === true,
    text: result.content
      .flatMap(part => (part.type === 'text' ? [part.text] : []))
      .join('\n'),
    structured: result.structuredContent ?? null,
  };
}

/** A resource's text contents; a binary one is refused, never decoded here. */
export function resourceReading(
  result: ReadResourceResult,
): McpResourceReading[] {
  return result.contents.map(part => {
    if (!('text' in part) || typeof part.text !== 'string') {
      throw new Error(`${part.uri} is not text.`);
    }
    return { uri: part.uri, mimeType: part.mimeType ?? null, text: part.text };
  });
}

/** A prompt's messages as text; a message of another kind is refused. */
export function promptReading(result: GetPromptResult): McpPromptReading[] {
  return result.messages.map(message => {
    if (message.content.type !== 'text') {
      throw new Error(`A ${message.role} message is not text.`);
    }
    return { role: message.role, text: message.content.text };
  });
}

/** Where an `McpClient` connects: a Streamable HTTP endpoint, or any transport. */
export type McpServerAddress =
  | {
      url: string;
      /** Headers sent with every request (a bearer, for one). */
      headers?: Record<string, string>;
    }
  | { transport: Transport };

/**
 * An MCP client: connects, lists and calls tools, reads resources, gets
 * prompts, and answers each as the readings above. The SDK's `Client` does
 * the protocol (the initialize handshake, the version negotiated, a
 * structured answer checked against the tool's output schema).
 */
export class McpClient {
  private constructor(
    private readonly client: Client,
    private readonly agreed: () => string | undefined,
  ) {}

  /** Connected to `server`, said to it as `name` at `version`. */
  static async connect(
    server: McpServerAddress,
    name = 'agent-runtimes',
    version = '1.0.0',
  ): Promise<McpClient> {
    const transport =
      'transport' in server
        ? server.transport
        : new StreamableHTTPClientTransport(new URL(server.url), {
            requestInit: server.headers
              ? { headers: server.headers }
              : undefined,
          });
    // The SDK hands the version agreed at initialize to the transport alone.
    let agreed: string | undefined;
    const setProtocolVersion = transport.setProtocolVersion?.bind(transport);
    transport.setProtocolVersion = (protocolVersion: string) => {
      agreed = protocolVersion;
      setProtocolVersion?.(protocolVersion);
    };
    const client = new Client({ name, version });
    await client.connect(transport);
    return new McpClient(client, () => agreed);
  }

  /** The protocol version agreed with the server. */
  get protocolVersion(): string {
    const version = this.agreed();
    if (!version) {
      throw new Error('The MCP client is not connected.');
    }
    return version;
  }

  /** Every tool the server lists, through its pages. */
  async listTools(): Promise<McpToolReading[]> {
    const tools: McpToolReading[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools.map(toolReading));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallReading> {
    const result = await this.client.callTool({ name, arguments: args });
    if (!Array.isArray(result.content)) {
      throw new Error(`${name} answered in the form before MCP 2024-11-05.`);
    }
    return callReading(result as CallToolResult);
  }

  async readResource(uri: string): Promise<McpResourceReading[]> {
    return resourceReading(await this.client.readResource({ uri }));
  }

  async getPrompt(
    name: string,
    args: Record<string, string>,
  ): Promise<McpPromptReading[]> {
    return promptReading(
      await this.client.getPrompt({ name, arguments: args }),
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
