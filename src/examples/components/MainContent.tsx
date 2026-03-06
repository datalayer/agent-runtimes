/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  McpServerManager,
  type McpServerSelection,
} from '../../components/McpServerManager';

export interface MainContentProps {
  /** Whether to show the welcome message */
  showWelcomeMessage?: boolean;
  /** Base URL for MCP API */
  baseUrl?: string;
  /** Agent ID for updating the running agent */
  agentId?: string;
  /** Whether codemode is enabled */
  enableCodemode?: boolean;
  /** Currently selected MCP servers */
  selectedMcpServers?: McpServerSelection[];
  /** Callback when MCP server selection changes */
  onSelectedMcpServersChange?: (servers: McpServerSelection[]) => void;
  /** Callback when MCP servers are added/removed (for codemode regeneration) */
  onMcpServersChange?: () => void;
  /** Whether the agent is configured and running */
  isConfigured?: boolean;
}

/**
 * Main Content Component
 *
 * Displays the main content area with a welcome message.
 * When an agent is running (isConfigured=true), also shows the MCP Server Manager for runtime management.
 */
export const MainContent: React.FC<MainContentProps> = ({
  showWelcomeMessage = true,
  baseUrl,
  agentId,
  enableCodemode,
  selectedMcpServers,
  onSelectedMcpServersChange,
  onMcpServersChange,
  isConfigured,
}) => {
  return (
    <Box sx={{ height: '100%', overflow: 'auto', padding: 3 }}>
      {/* MCP Server Manager - shown when agent is running */}
      {isConfigured && baseUrl && (
        <Box
          sx={{
            mb: 4,
            p: 3,
            bg: 'canvas.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <McpServerManager
            baseUrl={baseUrl}
            agentId={agentId}
            enableCodemode={enableCodemode}
            selectedServers={selectedMcpServers}
            onSelectedServersChange={onSelectedMcpServersChange}
            onServersChange={onMcpServersChange}
            disabled={false}
          />
        </Box>
      )}

      {showWelcomeMessage && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Configure your agent and start a conversation using the chat panel.
          </Text>
        </Box>
      )}
    </Box>
  );
};
