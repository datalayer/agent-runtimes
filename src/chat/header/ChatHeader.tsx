/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat header component with connection status indicator.
 *
 * @module chat/header/ChatHeader
 */

import { Text, IconButton, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  KernelIndicator,
  KERNEL_STATE_VISUALS,
  type ExecutionState,
} from '@datalayer/jupyter-react';
import {
  SyncIcon,
  SignOutIcon,
  SidebarCollapseIcon,
} from '@primer/octicons-react';
import { ConnectionState } from '../../types';

/**
 * ChatHeader props
 */
export interface ChatHeaderProps {
  /** Title to display */
  title?: string;
  /** Description to display below title */
  description?: string;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Marks the runtime as actively executing for busy-state animation. */
  runtimeBusy?: boolean;
  /** Callback when reconnect is clicked */
  onReconnect?: () => void;
  /** Callback when disconnect is clicked */
  onDisconnect?: () => void;
  /** Callback when logout is clicked */
  onLogout?: () => void;
  /** Callback when collapse panel is clicked */
  onCollapsePanel?: () => void;
}

/**
 * Chat header component with connection status indicator.
 *
 * Features:
 * - Visual connection state indicator (connected, connecting, disconnected, error)
 * - Reconnect button when disconnected or error
 * - Disconnect button when connected
 * - Optional logout button
 *
 * @example
 * ```tsx
 * <ChatHeader
 *   connectionState="connected"
 *   onReconnect={() => reconnect()}
 *   onDisconnect={() => disconnect()}
 * />
 * ```
 */
export function ChatHeader({
  title,
  description,
  connectionState,
  runtimeBusy = false,
  onReconnect,
  onDisconnect,
  onLogout,
  onCollapsePanel,
}: ChatHeaderProps) {
  const indicatorState: ExecutionState =
    connectionState === 'connected'
      ? runtimeBusy
        ? 'connected-busy'
        : 'connected-idle'
      : connectionState === 'connecting'
        ? 'connecting'
        : connectionState === 'error'
          ? 'connected-dead'
          : 'disconnected';

  const statusColor = KERNEL_STATE_VISUALS[indicatorState].color;

  const labels: Record<ConnectionState, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Connection Error',
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        p: 3,
        borderBottom: '1px solid',
        borderColor: 'border.default',
        backgroundColor: 'canvas.subtle',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Connection indicator */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 0,
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <KernelIndicator state={indicatorState} />
          </Box>
          <Text sx={{ color: statusColor }}>{labels[connectionState]}</Text>
          {(connectionState === 'disconnected' ||
            connectionState === 'error') &&
            onReconnect && (
              <IconButton
                icon={SyncIcon}
                aria-label="Reconnect"
                size="small"
                variant="invisible"
                onClick={onReconnect}
              />
            )}
        </Box>

        {/* Disconnect button */}
        {onDisconnect && connectionState === 'connected' && (
          <Button variant="invisible" size="small" onClick={onDisconnect}>
            Disconnect
          </Button>
        )}

        {/* Logout button */}
        {onLogout && (
          <IconButton
            icon={SignOutIcon}
            aria-label="Logout"
            size="small"
            variant="invisible"
            onClick={onLogout}
          />
        )}

        {/* Collapse panel button */}
        {onCollapsePanel && (
          <IconButton
            icon={SidebarCollapseIcon}
            aria-label="Collapse panel"
            size="small"
            variant="invisible"
            onClick={onCollapsePanel}
          />
        )}
      </Box>
    </Box>
  );
}

export default ChatHeader;
