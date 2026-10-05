/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whose mark a tool call carries.
 *
 * A call names a tool, and the tool belongs to something the catalogue marks:
 * an MCP server (by the tools the server says it serves), a skill (the skill
 * tools carry the skill's name in their arguments), a frontend tool set (by
 * the names in its `toolset`) or a runtime tool (by its `runtime.method`, the
 * name the runtime registers it under). A tool none of them claims has no mark.
 *
 * @module chat/marks/toolMarks
 */

import { MCP_SERVER_LIBRARY } from '../../specs/mcpServers';
import { SKILLS_CATALOG } from '../../specs/skills';
import { FRONTEND_TOOL_CATALOG } from '../../specs/frontendTools';
import { BACKEND_TOOL_CATALOG } from '../../specs/backendTools';

/** The two marks of a catalogue entry. */
export interface Marks {
  /** `<package>:<name>` */
  icon?: string;
  emoji?: string;
}

/** What a tool call is, by who it belongs to. */
export type ToolKind = 'mcp' | 'skill' | 'frontend' | 'runtime';

export interface ToolMarks extends Marks {
  kind: ToolKind;
  /** The catalogue entry (or the MCP server) it belongs to. */
  ownerId: string;
}

/** An MCP server as the chat knows it: what it serves, and its marks if it says them. */
export interface MarkedMcpServer {
  id: string;
  tools: { name: string }[];
  icon?: string;
  emoji?: string;
}

/** The tools the skills area runs a skill through. */
export const SKILL_TOOLS = new Set([
  'run_skill_script',
  'load_skill',
  'read_skill_resource',
]);

function marksOf(entry: Marks | undefined): Marks {
  return { icon: entry?.icon, emoji: entry?.emoji };
}

/** The skill a skill tool call names, without its version. */
export function skillIdOfCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string | null {
  if (!SKILL_TOOLS.has(toolName)) {
    return null;
  }
  const raw = args?.skill_name ?? args?.skill ?? args?.name;
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  return raw.split(':', 1)[0] || raw;
}

let frontendIndex: Map<string, { id: string } & Marks> | null = null;
let runtimeIndex: Map<string, { id: string } & Marks> | null = null;

/** Each frontend tool's name, to the first set of the catalogue that has it. */
function frontendTools(): Map<string, { id: string } & Marks> {
  if (!frontendIndex) {
    frontendIndex = new Map();
    for (const spec of Object.values(FRONTEND_TOOL_CATALOG)) {
      for (const name of spec.toolset ?? []) {
        if (!frontendIndex.has(name)) {
          frontendIndex.set(name, { id: spec.id, ...marksOf(spec) });
        }
      }
    }
  }
  return frontendIndex;
}

/** Each runtime tool's registered name (`runtime.method`), to its spec. */
function runtimeTools(): Map<string, { id: string } & Marks> {
  if (!runtimeIndex) {
    runtimeIndex = new Map();
    for (const spec of Object.values(BACKEND_TOOL_CATALOG)) {
      const method = spec.runtime?.method;
      if (method && !runtimeIndex.has(method)) {
        runtimeIndex.set(method, { id: spec.id, ...marksOf(spec) });
      }
    }
  }
  return runtimeIndex;
}

/** An MCP server's marks: its own when it says them, the catalogue's by its id otherwise. */
export function marksOfMcpServer(server: {
  id: string;
  icon?: string;
  emoji?: string;
}): Marks {
  if (server.icon || server.emoji) {
    return marksOf(server);
  }
  return marksOf(MCP_SERVER_LIBRARY[server.id]);
}

/** A skill's marks, from the catalogue, by its id with or without a version. */
export function marksOfSkill(skillId: string): Marks {
  return marksOf(SKILLS_CATALOG[skillId.split(':', 1)[0] || skillId]);
}

/** A frontend tool's marks, by its name. */
export function marksOfFrontendTool(toolName: string): Marks {
  return marksOf(frontendTools().get(toolName));
}

/** A runtime tool's marks, by the name it is registered under. */
export function marksOfRuntimeTool(toolName: string): Marks {
  return marksOf(runtimeTools().get(toolName));
}

/**
 * Who a call belongs to, and its marks; `null` when nobody the catalogue
 * marks claims it.
 */
export function marksOfToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
  mcpServers: readonly MarkedMcpServer[] = [],
): ToolMarks | null {
  const skillId = skillIdOfCall(toolName, args);
  if (skillId) {
    return { kind: 'skill', ownerId: skillId, ...marksOfSkill(skillId) };
  }
  const server = mcpServers.find(candidate =>
    candidate.tools.some(tool => tool.name === toolName),
  );
  if (server) {
    return { kind: 'mcp', ownerId: server.id, ...marksOfMcpServer(server) };
  }
  const frontend = frontendTools().get(toolName);
  if (frontend) {
    return { kind: 'frontend', ownerId: frontend.id, ...marksOf(frontend) };
  }
  const runtime = runtimeTools().get(toolName);
  if (runtime) {
    return { kind: 'runtime', ownerId: runtime.id, ...marksOf(runtime) };
  }
  return null;
}
