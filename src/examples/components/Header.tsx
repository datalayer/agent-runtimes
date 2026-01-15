/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState, useRef } from 'react';
import {
  Text,
  Button,
  PageLayout,
  ToggleSwitch,
  AvatarStack,
  Avatar,
  Spinner,
  TextInput,
  FormControl,
  AnchoredOverlay,
  IconButton,
} from '@primer/react';
import {
  ZapIcon,
  ListUnorderedIcon,
  InfoIcon,
  PlayIcon,
  PauseIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import ReactECharts from 'echarts-for-react';
import { SessionTabs } from './SessionTabs';
import { HeaderControls } from './HeaderControls';

// Mock session data
const MOCK_SESSIONS = [
  { id: 'session-1', name: 'Session 1', active: true },
  { id: 'session-2', name: 'Session 2', active: false },
  { id: 'session-3', name: 'Session 3', active: false },
];

// Mock context data for treemap
const MOCK_CONTEXT_DATA = {
  name: 'Context',
  children: [
    {
      name: 'Files',
      value: 450000,
      children: [
        { name: 'app.py', value: 125000 },
        { name: 'models.py', value: 98000 },
        { name: 'routes.py', value: 112000 },
        { name: 'utils.py', value: 115000 },
      ],
    },
    {
      name: 'Messages',
      value: 380000,
      children: [
        { name: 'User messages', value: 180000 },
        { name: 'Assistant responses', value: 200000 },
      ],
    },
    {
      name: 'Tools',
      value: 220000,
      children: [
        { name: 'Code execution', value: 95000 },
        { name: 'File operations', value: 75000 },
        { name: 'Search', value: 50000 },
      ],
    },
    {
      name: 'Memory',
      value: 473552,
      children: [
        { name: 'Short term', value: 150000 },
        { name: 'Long term', value: 323552 },
      ],
    },
    {
      name: 'Free space',
      value: 996448,
    },
  ],
};

// Optimized context data with more free space
const OPTIMIZED_CONTEXT_DATA = {
  name: 'Context',
  children: [
    {
      name: 'Files',
      value: 280000,
      children: [
        { name: 'app.py', value: 85000 },
        { name: 'models.py', value: 65000 },
        { name: 'routes.py', value: 70000 },
        { name: 'utils.py', value: 60000 },
      ],
    },
    {
      name: 'Messages',
      value: 250000,
      children: [
        { name: 'User messages', value: 120000 },
        { name: 'Assistant responses', value: 130000 },
      ],
    },
    {
      name: 'Tools',
      value: 150000,
      children: [
        { name: 'Code execution', value: 65000 },
        { name: 'File operations', value: 50000 },
        { name: 'Search', value: 35000 },
      ],
    },
    {
      name: 'Memory',
      value: 320000,
      children: [
        { name: 'Short term', value: 100000 },
        { name: 'Long term', value: 220000 },
      ],
    },
    {
      name: 'Free space',
      value: 1520000,
    },
  ],
};

interface HeaderProps {
  activeSession: string;
  agentName?: string;
  agentDescription?: string;
  agentStatus?: 'running' | 'paused';
  richEditor: boolean;
  durable: boolean;
  showContextTree: boolean;
  isNewAgent?: boolean;
  isConfigured?: boolean;
  onSessionChange: (sessionId: string) => void;
  onRichEditorChange: (value: boolean) => void;
  onDurableChange: (value: boolean) => void;
  onToggleContextTree: () => void;
  onToggleStatus?: () => void;
}

/**
 * Header Component
 *
 * Main header for the agent runtime interface with session tabs,
 * toggle switches, controls, and optional context treemap.
 */
export const Header: React.FC<HeaderProps> = ({
  activeSession,
  agentName,
  agentDescription,
  agentStatus,
  richEditor,
  durable,
  showContextTree,
  isNewAgent = false,
  isConfigured = false,
  onSessionChange,
  onRichEditorChange,
  onDurableChange,
  onToggleContextTree,
  onToggleStatus,
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [contextData, setContextData] = useState(MOCK_CONTEXT_DATA);
  const [totalTokens, setTotalTokens] = useState('1.52M');
  const [showDetails, setShowDetails] = useState(false);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [openOverlay, setOpenOverlay] = useState<
    'richEditor' | 'durable' | null
  >(null);

  const richEditorRef = useRef<HTMLButtonElement>(null);
  const durableRef = useRef<HTMLButtonElement>(null);

  const handleOptimize = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setContextData(OPTIMIZED_CONTEXT_DATA);
      setTotalTokens('1.00M');
      setIsOptimizing(false);
    }, 2000);
  };

  return (
    <PageLayout.Header divider="none">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          py: 2,
        }}
      >
        {/* Box 1: Session Tabs - only shown when agent is selected */}
        {agentName && (
          <SessionTabs
            sessions={MOCK_SESSIONS}
            activeSession={activeSession}
            agentName={agentName}
            agentDescription={agentDescription}
            onSessionChange={onSessionChange}
            onAddSession={() => {
              /* Add session */
            }}
          />
        )}

        {/* Box 2: Switches */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            marginLeft: 'auto',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ToggleSwitch
              size="small"
              checked={richEditor}
              onClick={() => onRichEditorChange(!richEditor)}
              aria-labelledby="rich-editor-label"
              disabled={isNewAgent || !isConfigured}
            />
            <Text id="rich-editor-label" sx={{ fontSize: 0 }}>
              Rich Editor
            </Text>
            <IconButton
              ref={richEditorRef}
              icon={InfoIcon}
              size="small"
              variant="invisible"
              aria-label="Rich Editor info"
              onClick={() =>
                setOpenOverlay(
                  openOverlay === 'richEditor' ? null : 'richEditor',
                )
              }
            />
            <AnchoredOverlay
              open={openOverlay === 'richEditor'}
              onOpen={() => setOpenOverlay('richEditor')}
              onClose={() => setOpenOverlay(null)}
              renderAnchor={() => <span />}
              anchorRef={richEditorRef}
            >
              <Box
                sx={{
                  p: 3,
                  maxWidth: '300px',
                  bg: 'canvas.overlay',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  boxShadow: 'shadow.large',
                }}
              >
                <Text
                  sx={{
                    fontSize: 0,
                    display: 'block',
                    mb: 1,
                    fontWeight: 'bold',
                  }}
                >
                  Rich Editor
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Enable rich text editing with formatting options, markdown
                  support, and visual enhancements for a better editing
                  experience.
                </Text>
              </Box>
            </AnchoredOverlay>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ToggleSwitch
              size="small"
              checked={durable}
              onClick={() => onDurableChange(!durable)}
              aria-labelledby="durable-label"
              disabled={isNewAgent || !isConfigured}
            />
            <Text id="durable-label" sx={{ fontSize: 0 }}>
              Durable
            </Text>
            <IconButton
              ref={durableRef}
              icon={InfoIcon}
              size="small"
              variant="invisible"
              aria-label="Durable info"
              onClick={() =>
                setOpenOverlay(openOverlay === 'durable' ? null : 'durable')
              }
            />
            <AnchoredOverlay
              open={openOverlay === 'durable'}
              onOpen={() => setOpenOverlay('durable')}
              onClose={() => setOpenOverlay(null)}
              renderAnchor={() => <span />}
              anchorRef={durableRef}
            >
              <Box
                sx={{
                  p: 3,
                  maxWidth: '300px',
                  bg: 'canvas.overlay',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  boxShadow: 'shadow.large',
                }}
              >
                <Text
                  sx={{
                    fontSize: 0,
                    display: 'block',
                    mb: 1,
                    fontWeight: 'bold',
                  }}
                >
                  Durable
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Persist agent state and conversation history across sessions.
                  Your work is automatically saved and restored when you return.
                </Text>
              </Box>
            </AnchoredOverlay>
          </Box>
        </Box>

        {/* Box 3: Action Buttons - only shown when agent is selected */}
        {agentName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Pause/Play button based on agent status */}
            {agentStatus && onToggleStatus && (
              <IconButton
                aria-label={
                  agentStatus === 'running' ? 'Pause agent' : 'Play agent'
                }
                icon={agentStatus === 'running' ? PauseIcon : PlayIcon}
                onClick={onToggleStatus}
                variant="invisible"
                size="small"
                sx={{
                  color:
                    agentStatus === 'running' ? 'attention.fg' : 'success.fg',
                }}
              />
            )}
            <HeaderControls onToggleContextTree={onToggleContextTree} />
          </Box>
        )}

        {/* Box 4: Avatar Stack - only shown when agent is selected */}
        {agentName && (
          <Box
            onClick={() => setShowAvatarView(!showAvatarView)}
            sx={{ cursor: 'pointer' }}
          >
            <AvatarStack size={24} disableExpand>
              <Avatar
                alt="Primer logo"
                src="https://avatars.githubusercontent.com/primer"
              />
              <Avatar
                alt="GitHub logo"
                src="https://avatars.githubusercontent.com/github"
              />
              <Avatar
                alt="Atom logo"
                src="https://avatars.githubusercontent.com/atom"
              />
              <Avatar
                alt="GitHub Desktop logo"
                src="https://avatars.githubusercontent.com/desktop"
              />
            </AvatarStack>
          </Box>
        )}
      </Box>

      {/* Context Treemap (full width below header) - only shown when agent is selected */}
      {agentName && showContextTree && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.subtle',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Text
              sx={{
                fontSize: 1,
                fontWeight: 'bold',
              }}
            >
              Context Distribution ({totalTokens} tokens)
            </Text>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                size="small"
                onClick={() => setShowDetails(!showDetails)}
                leadingVisual={ListUnorderedIcon}
              >
                Details
              </Button>
              <Button
                size="small"
                onClick={handleOptimize}
                disabled={isOptimizing}
                leadingVisual={isOptimizing ? Spinner : ZapIcon}
              >
                Optimize
              </Button>
            </Box>
          </Box>
          <ReactECharts
            option={{
              series: [
                {
                  type: 'treemap',
                  data: contextData.children,
                  roam: false,
                  breadcrumb: {
                    show: false,
                  },
                  label: {
                    show: true,
                    formatter: '{b}',
                  },
                  itemStyle: {
                    borderColor: '#fff',
                    borderWidth: 2,
                  },
                  levels: [
                    {
                      itemStyle: {
                        borderColor: '#777',
                        borderWidth: 0,
                        gapWidth: 1,
                      },
                    },
                    {
                      itemStyle: {
                        borderColor: '#555',
                        borderWidth: 5,
                        gapWidth: 1,
                      },
                      colorSaturation: [0.35, 0.5],
                    },
                    {
                      colorSaturation: [0.35, 0.5],
                    },
                  ],
                },
              ],
            }}
            style={{ height: '300px' }}
          />
          {showDetails && (
            <Box
              sx={{
                mt: 3,
                p: 2,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.default',
                fontFamily: 'mono',
                fontSize: 0,
              }}
            >
              <Text sx={{ fontWeight: 'bold', display: 'block', mb: 2 }}>
                Context Breakdown:
              </Text>
              {contextData.children.map(
                (category: {
                  name: string;
                  value: number;
                  children?: { name: string; value: number }[];
                }) => (
                  <Box key={category.name} sx={{ mb: 2 }}>
                    <Text sx={{ fontWeight: 'bold' }}>
                      {category.name}: {(category.value / 1000).toFixed(0)}K
                      tokens
                    </Text>
                    {category.children && (
                      <Box sx={{ ml: 3, mt: 1 }}>
                        {category.children.map(
                          (item: { name: string; value: number }) => (
                            <Text key={item.name} sx={{ display: 'block' }}>
                              • {item.name}: {(item.value / 1000).toFixed(0)}K
                              tokens
                            </Text>
                          ),
                        )}
                      </Box>
                    )}
                  </Box>
                ),
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Avatar Sharing View - only shown when agent is selected */}
      {agentName && showAvatarView && (
        <Box
          sx={{
            mt: 2,
            p: 3,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            bg: 'canvas.subtle',
          }}
        >
          <Text
            sx={{
              fontSize: 1,
              fontWeight: 'bold',
              display: 'block',
              mb: 3,
            }}
          >
            Share and Collaborate
          </Text>

          {/* Current collaborators */}
          <Box sx={{ mb: 3 }}>
            <Text
              sx={{
                fontSize: 0,
                fontWeight: 'semibold',
                display: 'block',
                mb: 2,
              }}
            >
              Current Members
            </Text>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  size={32}
                  alt="Primer logo"
                  src="https://avatars.githubusercontent.com/primer"
                />
                <Box sx={{ flex: 1 }}>
                  <Text
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      display: 'block',
                    }}
                  >
                    Primer
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    primer@github.com
                  </Text>
                </Box>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Admin</Text>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  size={32}
                  alt="GitHub logo"
                  src="https://avatars.githubusercontent.com/github"
                />
                <Box sx={{ flex: 1 }}>
                  <Text
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      display: 'block',
                    }}
                  >
                    GitHub
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    support@github.com
                  </Text>
                </Box>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Read-Write</Text>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  size={32}
                  alt="Atom logo"
                  src="https://avatars.githubusercontent.com/atom"
                />
                <Box sx={{ flex: 1 }}>
                  <Text
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      display: 'block',
                    }}
                  >
                    Atom
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    atom@github.com
                  </Text>
                </Box>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Read-Only</Text>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  size={32}
                  alt="GitHub Desktop logo"
                  src="https://avatars.githubusercontent.com/desktop"
                />
                <Box sx={{ flex: 1 }}>
                  <Text
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      display: 'block',
                    }}
                  >
                    GitHub Desktop
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    desktop@github.com
                  </Text>
                </Box>
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Read-Write</Text>
              </Box>
            </Box>
          </Box>

          {/* Add people form */}
          <Box sx={{ mb: 3 }}>
            <FormControl>
              <FormControl.Label>Add people</FormControl.Label>
              <TextInput
                placeholder="Enter email address"
                sx={{ width: '100%' }}
              />
            </FormControl>
          </Box>

          {/* Message input */}
          <Box sx={{ mb: 3 }}>
            <FormControl>
              <FormControl.Label>Message</FormControl.Label>
              <TextInput
                placeholder="Optional message for invitees"
                sx={{ width: '100%' }}
              />
            </FormControl>
          </Box>

          {/* General Access */}
          <Box>
            <Text
              sx={{
                fontSize: 0,
                fontWeight: 'semibold',
                display: 'block',
                mb: 2,
              }}
            >
              General Access
            </Text>
            <Box
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.default',
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text sx={{ fontSize: 0 }}>foo</Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Read-Only</Text>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text sx={{ fontSize: 0 }}>bar</Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    Read-Write
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </PageLayout.Header>
  );
};
