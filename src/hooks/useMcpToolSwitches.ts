/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's MCP tool switches, for a chat that draws its own
 * composer (the user, 19 November 2026: the toggles back in the MCP
 * overlay): which tools of each server are on and approved, as the
 * runtime's status says, with what was just switched held until its next
 * status, and the switches, sent over the runtime's monitoring stream as
 * `ChatBase` sends them (`mcp_server_tools_set`, `mcp_server_tool_approve`).
 *
 * A switch is offered only while that stream is open (`switchesLocked`
 * says why otherwise): a send that finds it closed is an error.
 *
 * @module hooks/useMcpToolSwitches
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { agentRuntimeStore } from '../stores';
import {
  enabledToolsOf,
  parseApprovedMcpToolsByServer,
  parseEnabledMcpToolsByServer,
} from '../chat/prompt/menus/equipmentRows';
import type { MCPServerConfig } from '../types/chat';
import type { McpToolsetsStatusResponse } from '../types/mcp';

const EMPTY: Map<string, Set<string>> = new Map();

function send(payload: Record<string, unknown>, agentId: string): void {
  if (!agentRuntimeStore.getState().sendRawMessage(payload, agentId)) {
    throw new Error(
      `The runtime's monitoring stream is closed: ${String(payload.type)} was not sent.`,
    );
  }
}

/** The tools a server lists: its config's, else its live status's. */
function toolNamesOf(
  serverId: string,
  servers: MCPServerConfig[],
  status: McpToolsetsStatusResponse | null | undefined,
): string[] {
  const configured = servers.find(each => each.id === serverId);
  if (configured && configured.tools.length > 0) {
    return configured.tools.map(tool => tool.name);
  }
  return (status?.servers.find(each => each.id === serverId)?.tools ?? []).map(
    tool => tool.name,
  );
}

export function useMcpToolSwitches({
  agentId,
  status,
  servers,
}: {
  agentId: string;
  status: McpToolsetsStatusResponse | null | undefined;
  servers: MCPServerConfig[];
}) {
  const reported = useMemo(
    () => ({
      enabled: parseEnabledMcpToolsByServer(status) ?? EMPTY,
      approved: parseApprovedMcpToolsByServer(status) ?? EMPTY,
    }),
    [status],
  );
  // What was switched here, until the runtime's next status says it.
  const [switched, setSwitched] = useState<{
    enabled: Map<string, Set<string>>;
    approved: Map<string, Set<string>>;
  }>({ enabled: new Map(), approved: new Map() });
  useEffect(() => {
    setSwitched({ enabled: new Map(), approved: new Map() });
  }, [reported, agentId]);
  const enabledMcpTools = useMemo(
    () => new Map([...reported.enabled, ...switched.enabled]),
    [reported, switched],
  );
  const approvedMcpTools = useMemo(
    () => new Map([...reported.approved, ...switched.approved]),
    [reported, switched],
  );

  const setTools = useCallback(
    (serverId: string, tools: Set<string>) => {
      send(
        {
          type: 'mcp_server_tools_set',
          serverId,
          enabledToolNames: Array.from(tools),
        },
        agentId,
      );
      setSwitched(prev => ({
        ...prev,
        enabled: new Map(prev.enabled).set(serverId, tools),
      }));
    },
    [agentId],
  );

  const onToggleMcpTool = useCallback(
    (serverId: string, toolName: string) => {
      const tools = new Set(
        enabledToolsOf(
          enabledMcpTools,
          serverId,
          toolNamesOf(serverId, servers, status),
        ),
      );
      if (tools.has(toolName)) {
        tools.delete(toolName);
      } else {
        tools.add(toolName);
      }
      setTools(serverId, tools);
    },
    [enabledMcpTools, servers, status, setTools],
  );

  const onToggleAllMcpServerTools = useCallback(
    (serverId: string, toolNames: string[], enable: boolean) =>
      setTools(serverId, enable ? new Set(toolNames) : new Set()),
    [setTools],
  );

  const onToggleMcpToolApproval = useCallback(
    (serverId: string, toolName: string) => {
      const approved = new Set(approvedMcpTools.get(serverId) ?? []);
      const approve = !approved.has(toolName);
      send(
        {
          type: 'mcp_server_tool_approve',
          serverId,
          toolName,
          approved: approve,
        },
        agentId,
      );
      if (approve) {
        approved.add(toolName);
      } else {
        approved.delete(toolName);
      }
      setSwitched(prev => ({
        ...prev,
        approved: new Map(prev.approved).set(serverId, approved),
      }));
    },
    [approvedMcpTools, agentId],
  );

  return {
    enabledMcpTools,
    approvedMcpTools,
    onToggleMcpTool,
    onToggleAllMcpServerTools,
    onToggleMcpToolApproval,
  };
}
