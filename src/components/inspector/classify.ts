/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where a tool call comes from, for its span (`datalayer.tool.kind`), by
 * what the catalogue says of its name. Apart from the spans themselves,
 * which a page can record without loading the catalogues.
 *
 * @module components/inspector/classify
 */

import {
  marksOfToolCall,
  type MarkedMcpServer,
} from '../../chat/marks/toolMarks';
import type { AgentToolKind, ToolClass } from './agentSpans';

/** The tools codemode exposes in place of the MCP tools it reaches. */
export const CODEMODE_TOOLS: ReadonlySet<string> = new Set([
  'list_servers',
  'list_tool_names',
  'search_tools',
  'get_tool_details',
  'execute_code',
]);

/**
 * Where a tool call comes from, by who claims its name: a frontend tool
 * (one of `frontendTools`), a skill, one of `mcpServers`, a frontend tool of
 * the catalogue, a runtime tool, codemode's; otherwise `fallback` — a tool
 * the runtime runs.
 */
export function classifyToolCall(
  name: string,
  args?: Record<string, unknown>,
  options: {
    mcpServers?: readonly MarkedMcpServer[];
    frontendTools?: readonly string[];
    fallback?: AgentToolKind;
  } = {},
): ToolClass {
  const marks = marksOfToolCall(name, args, options.mcpServers);
  const kind: AgentToolKind = options.frontendTools?.includes(name)
    ? 'frontend'
    : marks?.kind
      ? marks.kind
      : CODEMODE_TOOLS.has(name)
        ? 'codemode'
        : (options.fallback ?? 'runtime');
  return {
    kind,
    ...(marks?.icon ? { icon: marks.icon } : {}),
    ...(marks?.emoji ? { emoji: marks.emoji } : {}),
  };
}
