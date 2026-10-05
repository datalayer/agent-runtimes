/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where a tool call comes from, for the Agent Inspector, by what the
 * catalogue says of its name. Apart from the record itself, which a page can
 * keep without loading the catalogues.
 *
 * @module components/inspector/classify
 */

import {
  marksOfToolCall,
  type MarkedMcpServer,
} from '../../chat/marks/toolMarks';
import type { AgentInspectorSource, ToolClass } from './agentInspector';

/**
 * Where a tool call comes from, by who claims its name: a skill, one of
 * `mcpServers`, a frontend tool (the catalogue's, or one of `frontendTools`),
 * a runtime tool; otherwise `fallback` — a tool the runtime runs.
 */
export function classifyToolCall(
  name: string,
  args?: Record<string, unknown>,
  options: {
    mcpServers?: readonly MarkedMcpServer[];
    frontendTools?: readonly string[];
    fallback?: AgentInspectorSource;
  } = {},
): ToolClass {
  if (options.frontendTools?.includes(name)) {
    const marks = marksOfToolCall(name, args, options.mcpServers);
    return {
      source: 'frontend-tool',
      ...(marks?.icon ? { icon: marks.icon } : {}),
      ...(marks?.emoji ? { emoji: marks.emoji } : {}),
    };
  }
  const marks = marksOfToolCall(name, args, options.mcpServers);
  const source: AgentInspectorSource =
    marks?.kind === 'skill'
      ? 'skill'
      : marks?.kind === 'mcp'
        ? 'mcp'
        : marks?.kind === 'frontend'
          ? 'frontend-tool'
          : marks?.kind === 'runtime'
            ? 'backend-tool'
            : (options.fallback ?? 'backend-tool');
  return {
    source,
    ...(marks?.icon ? { icon: marks.icon } : {}),
    ...(marks?.emoji ? { emoji: marks.emoji } : {}),
  };
}
