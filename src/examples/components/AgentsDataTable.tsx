/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { IconButton, Avatar, Box } from '@primer/react';
import { PlayIcon, PauseIcon } from '@primer/octicons-react';
import { useAgentsStore } from '../stores/examplesStore';

interface AgentsDataTableProps {
  onToggleStatus?: (agentId: string) => void;
  showAuthor?: boolean;
  showLastEdited?: boolean;
}

/**
 * Agents Data Table Component
 *
 * Displays agents in a table format with status controls.
 */
export const AgentsDataTable: React.FC<AgentsDataTableProps> = ({
  onToggleStatus,
  showAuthor = true,
  showLastEdited = true,
}) => {
  const agents = useAgentsStore(state => state.agents);
  const toggleAgentStatus = useAgentsStore(state => state.toggleAgentStatus);

  const handleToggle = (agentId: string) => {
    toggleAgentStatus(agentId);
    onToggleStatus?.(agentId);
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead
          style={{
            backgroundColor: 'var(--bgColor-muted)',
            borderBottom: '1px solid var(--borderColor-default)',
          }}
        >
          <tr>
            <th
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Agent
            </th>
            {showAuthor && (
              <th
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Author
              </th>
            )}
            {showLastEdited && (
              <th
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Last Edited
              </th>
            )}
            <th
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Status
            </th>
            <th
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr
              key={agent.id}
              style={{
                borderBottom: '1px solid var(--borderColor-default)',
              }}
            >
              <td style={{ padding: '12px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Avatar src={agent.avatarUrl} size={32} />
                  <span style={{ fontWeight: 600 }}>{agent.name}</span>
                </div>
              </td>
              {showAuthor && (
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: 'var(--fgColor-muted)' }}>
                    {agent.author}
                  </span>
                </td>
              )}
              {showLastEdited && (
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: 'var(--fgColor-muted)' }}>
                    {agent.lastEdited}
                  </span>
                </td>
              )}
              <td style={{ padding: '12px 16px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor:
                      agent.status === 'running'
                        ? 'var(--bgColor-success-muted)'
                        : 'var(--bgColor-attention-muted)',
                    color:
                      agent.status === 'running'
                        ? 'var(--fgColor-success)'
                        : 'var(--fgColor-attention)',
                  }}
                >
                  {agent.status === 'running' ? 'Running' : 'Paused'}
                </span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <IconButton
                  icon={agent.status === 'running' ? PauseIcon : PlayIcon}
                  aria-label={
                    agent.status === 'running' ? 'Pause agent' : 'Start agent'
                  }
                  onClick={() => handleToggle(agent.id)}
                  variant="invisible"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
};
