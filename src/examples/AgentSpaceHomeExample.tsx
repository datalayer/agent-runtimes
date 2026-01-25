/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import {
  PageHeader,
  Button,
  TextInput,
  ActionMenu,
  ActionList,
  Box,
  Avatar,
  SegmentedControl,
} from '@primer/react';
import {
  PlusIcon,
  SearchIcon,
  KebabHorizontalIcon,
  TriangleDownIcon,
  CircleIcon,
  PauseIcon,
} from '@primer/octicons-react';
import { DatalayerThemeProvider } from '@datalayer/core';
import { useAgentsStore } from './stores/examplesStore';
import { AgentsDataTable } from './components/AgentsDataTable';
import { Rating } from './components/Rating';

/**
 * Agent Tile Component
 */
interface AgentTileProps {
  type: 'create' | 'agent';
  title?: string;
  description?: string;
  author?: string;
  lastEdited?: string;
  screenshot?: string;
  status?: 'running' | 'paused';
  avatarUrl?: string;
  stars?: number;
  notifications?: number;
  onClick?: () => void;
}

const AgentTile: React.FC<AgentTileProps> = ({
  type,
  title,
  description,
  author,
  lastEdited,
  screenshot,
  status,
  avatarUrl,
  stars = 0,
  notifications = 0,
  onClick,
}) => {
  if (type === 'create') {
    return (
      <Box
        onClick={onClick}
        style={{
          width: '300px',
          height: '200px',
          border: '2px dashed var(--borderColor-default)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
          background: 'var(--bgColor-default)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor =
            'var(--borderColor-accent-emphasis)';
          e.currentTarget.style.background = 'var(--bgColor-muted)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--borderColor-default)';
          e.currentTarget.style.background = 'var(--bgColor-default)';
        }}
      >
        <Box style={{ color: 'var(--fgColor-muted)' }}>
          <PlusIcon size={48} />
        </Box>
        <Box
          style={{
            marginTop: '12px',
            fontSize: '14px',
            color: 'var(--fgColor-muted)',
            fontWeight: 600,
          }}
        >
          Create new agent space
        </Box>
      </Box>
    );
  }

  return (
    <Box
      onClick={onClick}
      style={{
        width: '300px',
        border: '1px solid var(--borderColor-default)',
        borderRadius: '8px',
        overflow: 'visible',
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: 'var(--bgColor-default)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Notification Badge - iPhone Style */}
      {notifications > 0 && (
        <Box
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            minWidth: '24px',
            height: '24px',
            padding: '0 6px',
            borderRadius: '12px',
            background: '#ef4444',
            color: 'white',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            border: '2px solid var(--bgColor-default)',
            zIndex: 10,
          }}
        >
          {notifications}
        </Box>
      )}
      {/* Screenshot */}
      <Box
        style={{
          width: '100%',
          height: '150px',
          background: screenshot
            ? `url(${screenshot}) center/cover`
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px',
          fontWeight: 600,
          position: 'relative',
        }}
      >
        {!screenshot && title}
        {status && (
          <Box
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.9)',
              fontSize: '12px',
              fontWeight: 600,
              color:
                status === 'running'
                  ? 'var(--fgColor-success)'
                  : 'var(--fgColor-attention)',
            }}
          >
            {status === 'running' ? (
              <>
                <CircleIcon size={12} fill="var(--fgColor-success)" />
                <span>Running</span>
              </>
            ) : (
              <>
                <PauseIcon size={12} />
                <span>Paused</span>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Details */}
      <Box style={{ padding: '12px' }}>
        <Box
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--fgColor-default)',
            marginBottom: '8px',
          }}
        >
          {title}
        </Box>
        {description && (
          <Box
            style={{
              fontSize: '13px',
              color: 'var(--fgColor-muted)',
              marginBottom: '8px',
              lineHeight: '1.4',
            }}
          >
            {description}
          </Box>
        )}
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {avatarUrl && <Avatar src={avatarUrl} size={40} />}
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <Box
              style={{
                fontSize: '12px',
                color: 'var(--fgColor-muted)',
              }}
            >
              by {author}
            </Box>
            <Box
              style={{
                fontSize: '12px',
                color: 'var(--fgColor-muted)',
              }}
            >
              Edited {lastEdited}
            </Box>
            {stars > 0 && (
              <Box style={{ marginTop: '4px' }}>
                <Rating value={stars} size={12} />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Agent Runtimes Example Component
 *
 * Displays a page with agent tiles using Primer PageHeader component.
 */
const AgentSpaceHomeExample: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [lastEditedFilter, setLastEditedFilter] = useState('Last edited');
  const [visibilityFilter, setVisibilityFilter] = useState('Any visibility');
  const [statusFilter, setStatusFilter] = useState('Any status');
  const [analystFilter, setAnalystFilter] = useState('All analysts');
  const [viewMode, setViewMode] = useState<'tiles' | 'table'>('tiles');

  // Get agents from store
  const agents = useAgentsStore(state => state.agents);

  const handleCreateAgent = () => {
    // Handle create new agent
  };

  const handleAgentClick = (agentName: string) => {
    // Handle agent click
    void agentName;
  };

  return (
    <DatalayerThemeProvider>
      <Box
        style={{
          minHeight: '100vh',
          background: 'var(--bgColor-default)',
          padding: '24px',
        }}
      >
        {/* PageHeader */}
        <PageHeader
          role="banner"
          aria-label="Agent Spaces"
          sx={{ borderBottom: 'none' }}
        >
          <PageHeader.TitleArea>
            <PageHeader.Title>Agent Spaces</PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Actions>
            <ActionMenu>
              <ActionMenu.Anchor>
                <Button
                  variant="invisible"
                  leadingVisual={KebabHorizontalIcon}
                  aria-label="More options"
                />
              </ActionMenu.Anchor>
              <ActionMenu.Overlay>
                <ActionList>
                  <ActionList.Item
                    onSelect={() => {
                      // Handle add folder
                    }}
                  >
                    Add folder
                  </ActionList.Item>
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          </PageHeader.Actions>
        </PageHeader>

        {/* Main Content */}
        <Box style={{ padding: '24px' }}>
          {/* Search, Filters, and View Toggle */}
          <Box
            style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '24px',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center',
                flex: 1,
              }}
            >
              {/* Search Input */}
              <Box style={{ flex: '1 1 300px', minWidth: '200px' }}>
                <TextInput
                  leadingVisual={SearchIcon}
                  placeholder="Search agent spaces..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  sx={{ width: '100%' }}
                />
              </Box>

              {/* Filters */}
              <ActionMenu>
                <ActionMenu.Button trailingAction={TriangleDownIcon}>
                  {lastEditedFilter}
                </ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList selectionVariant="single">
                    <ActionList.Item
                      selected={lastEditedFilter === 'Last edited'}
                      onSelect={() => setLastEditedFilter('Last edited')}
                    >
                      Last edited
                    </ActionList.Item>
                    <ActionList.Item
                      selected={lastEditedFilter === 'Created date'}
                      onSelect={() => setLastEditedFilter('Created date')}
                    >
                      Created date
                    </ActionList.Item>
                    <ActionList.Item
                      selected={lastEditedFilter === 'Name'}
                      onSelect={() => setLastEditedFilter('Name')}
                    >
                      Name
                    </ActionList.Item>
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>

              <ActionMenu>
                <ActionMenu.Button trailingAction={TriangleDownIcon}>
                  {visibilityFilter}
                </ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList selectionVariant="single">
                    <ActionList.Item
                      selected={visibilityFilter === 'Any visibility'}
                      onSelect={() => setVisibilityFilter('Any visibility')}
                    >
                      Any visibility
                    </ActionList.Item>
                    <ActionList.Item
                      selected={visibilityFilter === 'Public'}
                      onSelect={() => setVisibilityFilter('Public')}
                    >
                      Public
                    </ActionList.Item>
                    <ActionList.Item
                      selected={visibilityFilter === 'Private'}
                      onSelect={() => setVisibilityFilter('Private')}
                    >
                      Private
                    </ActionList.Item>
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>

              <ActionMenu>
                <ActionMenu.Button trailingAction={TriangleDownIcon}>
                  {statusFilter}
                </ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList selectionVariant="single">
                    <ActionList.Item
                      selected={statusFilter === 'Any status'}
                      onSelect={() => setStatusFilter('Any status')}
                    >
                      Any status
                    </ActionList.Item>
                    <ActionList.Item
                      selected={statusFilter === 'Active'}
                      onSelect={() => setStatusFilter('Active')}
                    >
                      Active
                    </ActionList.Item>
                    <ActionList.Item
                      selected={statusFilter === 'Draft'}
                      onSelect={() => setStatusFilter('Draft')}
                    >
                      Draft
                    </ActionList.Item>
                    <ActionList.Item
                      selected={statusFilter === 'Archived'}
                      onSelect={() => setStatusFilter('Archived')}
                    >
                      Archived
                    </ActionList.Item>
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>

              <ActionMenu>
                <ActionMenu.Button trailingAction={TriangleDownIcon}>
                  {analystFilter}
                </ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList selectionVariant="single">
                    <ActionList.Item
                      selected={analystFilter === 'All analysts'}
                      onSelect={() => setAnalystFilter('All analysts')}
                    >
                      All analysts
                    </ActionList.Item>
                    <ActionList.Item
                      selected={analystFilter === 'Eric Charles'}
                      onSelect={() => setAnalystFilter('Eric Charles')}
                    >
                      Eric Charles
                    </ActionList.Item>
                    <ActionList.Item
                      selected={analystFilter === 'Other users'}
                      onSelect={() => setAnalystFilter('Other users')}
                    >
                      Other users
                    </ActionList.Item>
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>
            </Box>

            {/* View Mode Toggle */}
            <SegmentedControl
              aria-label="View mode"
              onChange={index => setViewMode(index === 0 ? 'tiles' : 'table')}
            >
              <SegmentedControl.Button selected={viewMode === 'tiles'}>
                Tiles
              </SegmentedControl.Button>
              <SegmentedControl.Button selected={viewMode === 'table'}>
                Table
              </SegmentedControl.Button>
            </SegmentedControl>
          </Box>

          {/* Agent Tiles Grid */}
          {viewMode === 'tiles' && (
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '24px',
                marginBottom: '48px',
              }}
            >
              {/* Create New Agent Tile */}
              <AgentTile type="create" onClick={handleCreateAgent} />

              {/* Dynamic Agent Tiles from Store */}
              {agents.map(agent => (
                <AgentTile
                  key={agent.id}
                  type="agent"
                  title={agent.name}
                  description={agent.description}
                  author={agent.author}
                  lastEdited={agent.lastEdited}
                  screenshot={agent.screenshot}
                  status={agent.status}
                  avatarUrl={agent.avatarUrl}
                  stars={agent.stars}
                  notifications={agent.notifications}
                  onClick={() => handleAgentClick(agent.name)}
                />
              ))}
            </Box>
          )}

          {/* Agents Table View */}
          {viewMode === 'table' && (
            <Box>
              <AgentsDataTable />
            </Box>
          )}
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentSpaceHomeExample;
