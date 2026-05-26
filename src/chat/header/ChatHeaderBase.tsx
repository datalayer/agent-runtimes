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
import { KernelIndicator, type ExecutionState } from '@datalayer/jupyter-react';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
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
import type { SandboxStatusData } from '../../types/context';
import type { SandboxWsStatus } from '../../types/sandbox';

type RuntimeStatus = SandboxStatusData | SandboxWsStatus;

export function toRuntimeExecutionState(
  runtimeStatus?: RuntimeStatus | null,
): ExecutionState | undefined {
  if (!runtimeStatus) {
    return undefined;
  }

  if ('available' in runtimeStatus && runtimeStatus.available === false) {
    return undefined;
  }

  if (
    runtimeStatus.variant === 'unavailable' ||
    runtimeStatus.variant === 'error'
  ) {
    return undefined;
  }

  if (runtimeStatus.sandbox_running === false) {
    return 'disconnected';
  }

  if (runtimeStatus.is_executing === true) {
    return 'connected-busy';
  }

  if (runtimeStatus.sandbox_running === true) {
    return 'connected-idle';
  }

  return undefined;
}

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
  /** Optional kernel indicator state override from notebook runtime. */
  kernelIndicatorState?: ExecutionState;
  /**
   * Runtime status from agent-runtimes sandbox status stream.
   * Uses the same execution-state model as KernelIndicator.
   */
  runtimeStatus?: RuntimeStatus | null;
  /**
   * Live kernel connection from the notebook runtime. When provided,
   * the chat header renders the same `<KernelIndicator>` as the notebook
   * toolbar — subscribing to the kernel's live signals so the colour and
   * tooltip stay in sync with the notebook indicator.
   */
  kernel?: IKernelConnection | null;
  /** Optional environment name shown in indicator details. */
  kernelEnvironmentName?: string;
  /** Optional CPU info shown in indicator details. */
  kernelCpu?: string;
  /** Optional memory info shown in indicator details. */
  kernelMemory?: string;
  /** Optional GPU info shown in indicator details. */
  kernelGpu?: string;
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
  kernelIndicatorState,
  runtimeStatus,
  kernel,
  kernelEnvironmentName,
  kernelCpu,
  kernelMemory,
  kernelGpu,
  headerButtons,
  messageCount,
  onNewChat,
  onClear,
  chatViewMode,
  onChatViewModeChange,
}: ChatBaseHeaderProps) {
  const effectiveIndicatorState =
    kernelIndicatorState ?? toRuntimeExecutionState(runtimeStatus);

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
          {/* Runtime status indicator: always use shared KernelIndicator. */}
          {kernel ? (
            <KernelIndicator
              kernel={kernel}
              environmentName={kernelEnvironmentName}
              cpu={kernelCpu}
              memory={kernelMemory}
              gpu={kernelGpu}
              position="sw"
              bordered={false}
            />
          ) : (
            <KernelIndicator
              state={effectiveIndicatorState ?? 'undefined'}
              environmentName={kernelEnvironmentName}
              cpu={kernelCpu}
              memory={kernelMemory}
              gpu={kernelGpu}
              position="sw"
              bordered={false}
            />
          )}
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
