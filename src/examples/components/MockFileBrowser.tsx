/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Text, SegmentedControl } from '@primer/react';
import { DataTable } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';

interface MockFileBrowserProps {
  codemode?: boolean;
}

/**
 * Mock File Browser Component
 *
 * Displays a code sandbox with data browser and variables sections.
 * In production, this would be replaced with a real Simple UI FileBrowser component.
 */
export const MockFileBrowser: React.FC<MockFileBrowserProps> = ({
  codemode = false,
}) => {
  const [activeTab, setActiveTab] = useState<'sandbox' | 'tools'>('sandbox');

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Tabs */}
      <Box
        sx={{ p: 2, borderBottom: '1px solid', borderColor: 'border.default' }}
      >
        <SegmentedControl aria-label="Left pane navigation">
          <SegmentedControl.Button
            selected={activeTab === 'sandbox'}
            onClick={() => setActiveTab('sandbox')}
          >
            Code
          </SegmentedControl.Button>
          <SegmentedControl.Button
            selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
          >
            Tools
          </SegmentedControl.Button>
        </SegmentedControl>
      </Box>

      {/* Tab Content */}
      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {activeTab === 'sandbox' ? (
          <>
            {/* Data Browser Section */}
            <Box sx={{ mb: 4 }}>
              <Text
                sx={{
                  fontSize: 1,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 2,
                }}
              >
                Data Browser
              </Text>

              {/* Documents */}
              <Text
                sx={{
                  fontSize: 0,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 1,
                  color: 'fg.muted',
                }}
              >
                Documents
              </Text>
              <Box sx={{ fontSize: 0, mb: 2 }}>
                <Box
                  sx={{
                    py: 1,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📁 notebooks/
                </Box>
                <Box
                  sx={{
                    py: 1,
                    pl: 3,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📓 analysis.ipynb
                </Box>
                <Box
                  sx={{
                    py: 1,
                    pl: 3,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📓 demo.ipynb
                </Box>
                <Box
                  sx={{
                    py: 1,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📁 data/
                </Box>
                <Box
                  sx={{
                    py: 1,
                    pl: 3,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📄 dataset.csv
                </Box>
                <Box
                  sx={{
                    py: 1,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📁 models/
                </Box>
                <Box
                  sx={{
                    py: 1,
                    pl: 3,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  📄 agent.py
                </Box>
              </Box>

              {/* Buckets */}
              <Text
                sx={{
                  fontSize: 0,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 1,
                  color: 'fg.muted',
                }}
              >
                Buckets
              </Text>
              <Box sx={{ fontSize: 0 }}>
                <Box
                  sx={{
                    py: 1,
                    cursor: 'pointer',
                    '&:hover': { bg: 'canvas.subtle' },
                  }}
                >
                  🪣 s3://nasa-1
                </Box>
              </Box>
            </Box>

            {/* Variables Section */}
            <Box>
              <Text
                sx={{
                  fontSize: 1,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 2,
                }}
              >
                Variables
              </Text>
              <DataTable
                aria-label="Variables table"
                data={[
                  { id: 1, name: 'df', type: 'pandas dataframe' },
                  { id: 2, name: 'model', type: 'pytorch model' },
                  { id: 3, name: 'predictions', type: 'pandas dataframe' },
                ]}
                columns={[
                  {
                    header: 'Name',
                    field: 'name',
                    rowHeader: true,
                    renderCell: row => (
                      <Text sx={{ fontFamily: 'mono', fontSize: 0 }}>
                        {row.name}
                      </Text>
                    ),
                  },
                  {
                    header: 'Type',
                    field: 'type',
                    renderCell: row => (
                      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                        {row.type}
                      </Text>
                    ),
                  },
                ]}
              />
            </Box>
          </>
        ) : (
          <>
            {/* Tools Section - Conditional based on codemode */}
            <Box sx={{ mb: 4 }}>
              <Text
                sx={{
                  fontSize: 1,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 2,
                }}
              >
                {codemode ? 'Codemode Tools' : 'MCP Tools'}
              </Text>
              <DataTable
                aria-label={
                  codemode ? 'Codemode Tools table' : 'MCP Tools table'
                }
                data={
                  codemode
                    ? [
                        { id: 1, tool: 'list_tool_names' },
                        { id: 2, tool: 'search_tools' },
                        { id: 3, tool: 'get_tool_details' },
                        { id: 4, tool: 'list_servers' },
                        { id: 5, tool: 'execute_code' },
                        { id: 6, tool: 'call_tool (optional)' },
                      ]
                    : [
                        { id: 1, tool: 'search_dataset' },
                        { id: 2, tool: 'load_dataset' },
                        { id: 3, tool: 'clone_repository' },
                        { id: 4, tool: 'commit' },
                      ]
                }
                columns={[
                  {
                    header: 'Tool',
                    field: 'tool',
                    rowHeader: true,
                    renderCell: row => (
                      <Text sx={{ fontFamily: 'mono', fontSize: 0 }}>
                        {row.tool}
                      </Text>
                    ),
                  },
                ]}
              />
            </Box>

            {/* Skills Section */}
            <Box>
              <Text
                sx={{
                  fontSize: 1,
                  fontWeight: 'semibold',
                  display: 'block',
                  mb: 2,
                }}
              >
                Skills
              </Text>
              <DataTable
                aria-label="Skills table"
                data={[
                  { id: 1, skill: 'Explore Dataset' },
                  { id: 2, skill: 'Analyze Dataset' },
                  { id: 3, skill: 'Visualize Dataset' },
                ]}
                columns={[
                  {
                    header: 'Skill',
                    field: 'skill',
                    rowHeader: true,
                    renderCell: row => (
                      <Text sx={{ fontSize: 0 }}>{row.skill}</Text>
                    ),
                  },
                ]}
              />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};
