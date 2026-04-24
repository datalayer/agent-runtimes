/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatHeader — Header bar for the ChatBase component.
 *
 * Renders title, brand icon, sandbox status indicator, action buttons
 * (new chat, clear, settings), view-mode segmented toggle, and custom
 * header actions / content.
 *
 * @module chat/header/ChatHeaderBase
 */

import { type ReactNode } from 'react';
import { Heading, IconButton, Text, Truncate } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  PlusIcon,
  TrashIcon,
  GearIcon,
  CommentDiscussionIcon,
  DeviceMobileIcon,
  SidebarExpandIcon,
  InfoIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';

import type { ChatViewMode, HeaderButtonsConfig } from '../../types/chat';
import type { SandboxWsStatus } from '../../types/sandbox';
import { SandboxStatusIndicator } from '../indicators/SandboxStatusIndicator';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatBaseHeaderProps {
  title?: string;
  subtitle?: string;
  brandIcon?: ReactNode;
  headerContent?: ReactNode;
  headerActions?: ReactNode;
  showInformation?: boolean;
  onInformationClick?: () => void;
  padding: number;
  /** API base URL passed to SandboxStatusIndicator */
  sandboxApiBase?: string;
  /** Auth token passed to SandboxStatusIndicator */
  sandboxAuthToken?: string;
  /** Agent ID passed to SandboxStatusIndicator for agent-scoped status */
  sandboxAgentId?: string;
  /** Optional sandbox status override for immediate indicator updates */
  sandboxStatusData?: SandboxWsStatus | null;
  /** Header button configuration */
  headerButtons?: HeaderButtonsConfig;
  /** Current count of messages (used to conditionally show clear button) */
  messageCount: number;
  /** Callback when new chat is triggered */
  onNewChat: () => void;
  /** Callback when clear is triggered */
  onClear: () => void;
  /** Current chat view mode */
  chatViewMode?: ChatViewMode;
  /** Callback when view mode changes */
  onChatViewModeChange?: (mode: ChatViewMode) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatBaseHeader({
  title,
  subtitle,
  brandIcon,
  headerContent,
  headerActions,
  showInformation,
  onInformationClick,
  padding,
  sandboxApiBase,
  sandboxAuthToken,
  sandboxAgentId,
  sandboxStatusData,
  headerButtons,
  messageCount,
  onNewChat,
  onClear,
  chatViewMode,
  onChatViewModeChange,
}: ChatBaseHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid',
        borderColor: 'border.default',
      }}
    >
      {/* Title row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: padding,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          {brandIcon || <AiAgentIcon colored size={20} />}
          {(title || subtitle) && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              {title && (
                <Heading
                  as="h3"
                  sx={{
                    fontSize: 2,
                    fontWeight: 'semibold',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Truncate title={title} maxWidth="28ch">
                    {title}
                  </Truncate>
                </Heading>
              )}
              {subtitle && (
                <Text
                  sx={{
                    fontSize: 0,
                    color: 'fg.muted',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Truncate title={subtitle} maxWidth="40ch">
                    {subtitle}
                  </Truncate>
                </Text>
              )}
            </Box>
          )}
          {/* Inline header content (e.g., protocol label) */}
          {headerContent}
          {showInformation && (
            <IconButton
              icon={InfoIcon}
              aria-label="Information"
              variant="invisible"
              size="small"
              onClick={onInformationClick}
            />
          )}
        </Box>

        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
        >
          {/* Sandbox execution status indicator */}
          <SandboxStatusIndicator
            apiBase={sandboxApiBase}
            authToken={sandboxAuthToken}
            agentId={sandboxAgentId}
            statusOverride={sandboxStatusData}
          />
          {/* Header buttons */}
          {headerButtons?.showNewChat && (
            <IconButton
              icon={PlusIcon}
              aria-label="New chat"
              variant="invisible"
              size="small"
              onClick={onNewChat}
            />
          )}
          {headerButtons?.showClear && messageCount > 0 && (
            <IconButton
              icon={TrashIcon}
              aria-label="Clear messages"
              variant="invisible"
              size="small"
              onClick={onClear}
            />
          )}
          {headerButtons?.showSettings && (
            <IconButton
              icon={GearIcon}
              aria-label="Settings"
              variant="invisible"
              size="small"
              onClick={headerButtons.onSettings}
            />
          )}
          {/* View mode segmented toggle */}
          {chatViewMode && onChatViewModeChange && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                bg: 'neutral.muted',
                borderRadius: '6px',
                p: '2px',
                gap: '1px',
              }}
            >
              {(
                [
                  {
                    mode: 'floating' as const,
                    icon: CommentDiscussionIcon,
                    label: 'Full-height popup',
                  },
                  {
                    mode: 'floating-small' as const,
                    icon: DeviceMobileIcon,
                    label: 'Floating popup',
                  },
                  {
                    mode: 'sidebar' as const,
                    icon: SidebarExpandIcon,
                    label: 'Sidebar panel',
                  },
                ] as const
              ).map(({ mode, icon: ModeIcon, label }) => (
                <Box
                  key={mode}
                  as="button"
                  aria-label={label}
                  title={label}
                  onClick={() => onChatViewModeChange(mode)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 24,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    bg:
                      chatViewMode === mode ? 'canvas.default' : 'transparent',
                    boxShadow: chatViewMode === mode ? 'shadow.small' : 'none',
                    color: chatViewMode === mode ? 'fg.default' : 'fg.muted',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      color: 'fg.default',
                      bg:
                        chatViewMode === mode
                          ? 'canvas.default'
                          : 'neutral.subtle',
                    },
                  }}
                >
                  <ModeIcon size={14} />
                </Box>
              ))}
            </Box>
          )}
          {/* Custom header actions */}
          {headerActions}
        </Box>
      </Box>
    </Box>
  );
}
