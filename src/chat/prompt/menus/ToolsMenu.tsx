/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the agent may call: builtin tools, MCP servers, and codemode.
 *
 * @module chat/prompt/menus/ToolsMenu
 */

import {
  Text,
  Button,
  ActionMenu,
  ActionList,
  ToggleSwitch,
  Tooltip,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ToolsIcon } from '@primer/octicons-react';

import type { BuiltinTool, MCPServerConfig } from '../../../types';

export function ToolsMenu({
  codemodeEnabled,
  onToggleCodemode,
  mcpServers,
  enabledMcpTools,
  enabledMcpToolCount,
  onToggleMcpTool,
  onToggleAllMcpServerTools,
  approvedMcpTools,
  onToggleMcpToolApproval,
  availableTools,
}: {
  codemodeEnabled: boolean;
  onToggleCodemode?: (enabled: boolean) => void | Promise<void>;
  mcpServers: MCPServerConfig[];
  enabledMcpTools: Map<string, Set<string>>;
  enabledMcpToolCount: number;
  onToggleMcpTool: (serverId: string, toolName: string) => void;
  onToggleAllMcpServerTools: (
    serverId: string,
    toolNames: string[],
    enable: boolean,
  ) => void;
  approvedMcpTools: Map<string, Set<string>>;
  onToggleMcpToolApproval: (serverId: string, toolName: string) => void;
  availableTools: BuiltinTool[];
}) {
  const hasUsableMcpServers = mcpServers.some(server => server.isAvailable);

  /*
   * A count, not a word.
   *
   * Four labelled buttons on one row is most of the width of a chat panel, and
   * the icon already says which menu this is. What the word was carrying — the
   * name, and what is behind it — moves to the tooltip, where it costs nothing
   * until somebody asks.
   */
  const summary = [
    `${availableTools.length} tool${availableTools.length === 1 ? '' : 's'}`,
    enabledMcpToolCount > 0 ? `${enabledMcpToolCount} MCP enabled` : null,
    hasUsableMcpServers ? null : 'no MCP server available',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={`Tools — ${summary}`} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={`Tools — ${summary}`}
            leadingVisual={ToolsIcon}
          >
            <Text sx={{ fontSize: 0 }}>
              {availableTools.length + enabledMcpToolCount}
            </Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <ActionList>
            {/* Codemode toggle — always visible at the top */}
            <ActionList.Group title="Codemode">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 3,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'border.muted',
                  gap: 2,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Text
                    id="toggle-codemode"
                    sx={{ fontWeight: 'semibold', display: 'block' }}
                  >
                    Enable Codemode
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {codemodeEnabled
                      ? 'MCP tools accessible via meta-tools (search_tools, execute_code).'
                      : 'Expose MCP tools directly to the model.'}
                  </Text>
                </Box>
                <ToggleSwitch
                  size="small"
                  checked={codemodeEnabled}
                  disabled={!onToggleCodemode}
                  onClick={() => {
                    if (onToggleCodemode) {
                      void onToggleCodemode(!codemodeEnabled);
                    }
                  }}
                  aria-labelledby="toggle-codemode"
                />
              </Box>
            </ActionList.Group>

            {/*
              The tools the agent actually has.

              Counted on the trigger and never listed, which is the worst way
              round: the button said "7" and the menu it opened showed
              codemode and nothing else. These are not togglable — they are
              what the agent was built with, or what this page handed it — so
              they are stated rather than offered.
            */}
            {availableTools.length > 0 ? (
              <ActionList.Group title="Tools">
                {availableTools.map(tool => (
                  <ActionList.Item key={tool.id} disabled>
                    {tool.name}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            ) : null}

            {/* MCP Server Tools */}
            {mcpServers.length > 0 && hasUsableMcpServers ? (
              mcpServers.map(server => {
                const serverTools = enabledMcpTools.get(server.id);
                const allToolNames = server.tools.map(t => t.name);
                const enabledCount = serverTools?.size ?? 0;
                const allEnabled =
                  enabledCount === allToolNames.length &&
                  allToolNames.length > 0;
                return (
                  <ActionList.Group
                    key={server.id}
                    title={`${server.name}${server.isAvailable ? '' : ' (unavailable)'}`}
                  >
                    {/* Server-level toggle */}
                    {server.isAvailable && server.tools.length > 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          px: 3,
                          py: 2,
                          borderBottom: '1px solid',
                          borderColor: 'border.muted',
                        }}
                      >
                        <Text
                          id={`toggle-all-${server.id}`}
                          sx={{
                            fontSize: 0,
                            fontWeight: 'semibold',
                            color: 'fg.muted',
                          }}
                        >
                          Enable all ({enabledCount}/{allToolNames.length})
                        </Text>
                        <ToggleSwitch
                          size="small"
                          checked={allEnabled}
                          onClick={() =>
                            onToggleAllMcpServerTools(
                              server.id,
                              allToolNames,
                              !allEnabled,
                            )
                          }
                          aria-labelledby={`toggle-all-${server.id}`}
                        />
                      </Box>
                    )}
                    {server.isAvailable && server.tools.length > 0 ? (
                      server.tools.map(tool => {
                        const isEnabled = serverTools?.has(tool.name) ?? false;
                        const serverApproved = approvedMcpTools.get(server.id);
                        // Tools default to NOT approved — user must explicitly
                        // approve each one (matches the Skills approval UX).
                        const isApproved =
                          serverApproved?.has(tool.name) ?? false;
                        return (
                          <Box
                            key={`${server.id}-${tool.name}`}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 3,
                              py: 2,
                              '&:hover': {
                                backgroundColor: 'canvas.subtle',
                              },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Text
                                id={`toggle-tool-${server.id}-${tool.name}`}
                                sx={{ fontWeight: 'semibold' }}
                              >
                                {tool.name}
                              </Text>
                              {tool.description && (
                                <Text
                                  sx={{
                                    display: 'block',
                                    fontSize: 0,
                                    color: 'fg.muted',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {tool.description}
                                </Text>
                              )}
                            </Box>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                              >
                                <Text
                                  sx={{ fontSize: '10px', color: 'fg.muted' }}
                                >
                                  Enabled
                                </Text>
                                <ToggleSwitch
                                  size="small"
                                  checked={isEnabled}
                                  onClick={() =>
                                    onToggleMcpTool(server.id, tool.name)
                                  }
                                  aria-labelledby={`toggle-tool-${server.id}-${tool.name}`}
                                />
                              </Box>
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                              >
                                <Text
                                  sx={{ fontSize: '10px', color: 'fg.muted' }}
                                >
                                  Approved
                                </Text>
                                <ToggleSwitch
                                  size="small"
                                  checked={isApproved}
                                  onClick={() =>
                                    onToggleMcpToolApproval(
                                      server.id,
                                      tool.name,
                                    )
                                  }
                                  aria-labelledby={`toggle-tool-${server.id}-${tool.name}`}
                                />
                              </Box>
                            </Box>
                          </Box>
                        );
                      })
                    ) : server.isAvailable ? (
                      <ActionList.Item disabled>
                        <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                          No tools discovered
                        </Text>
                      </ActionList.Item>
                    ) : (
                      <ActionList.Item disabled>
                        <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                          Server unavailable
                        </Text>
                      </ActionList.Item>
                    )}
                  </ActionList.Group>
                );
              })
            ) : (
              <ActionList.Group title="No MCP Servers">
                <ActionList.Item disabled>
                  <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                    No MCP Servers
                  </Text>
                </ActionList.Item>
              </ActionList.Group>
            )}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
