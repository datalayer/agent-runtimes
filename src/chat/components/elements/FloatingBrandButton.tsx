/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Floating brand button component for Chat.
 * A hoverable button that opens the chat sidebar.
 *
 * @module components/chat/components/elements/FloatingBrandButton
 */

import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Text } from '@primer/react';
import { CommentDiscussionIcon, XIcon } from '@primer/octicons-react';

/**
 * FloatingBrandButton props
 */
export interface FloatingBrandButtonProps {
  /** Whether the chat is open */
  isOpen: boolean;

  /** Callback to toggle chat open/closed */
  onToggle: () => void;

  /** Position of the button */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Custom icon when closed */
  icon?: React.ReactNode;

  /** Tooltip text */
  tooltip?: string;

  /** Show unread badge */
  unreadCount?: number;

  /** Custom class name */
  className?: string;

  /** Brand color */
  brandColor?: string;
}

/**
 * Floating brand button component
 * A circular button that floats in a corner to open/close the chat
 */
export function FloatingBrandButton({
  isOpen,
  onToggle,
  position = 'bottom-right',
  icon,
  tooltip = 'Chat with AI',
  unreadCount = 0,
  className,
  brandColor,
}: FloatingBrandButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 20, right: 20 },
    'bottom-left': { bottom: 20, left: 20 },
    'top-right': { top: 20, right: 20 },
    'top-left': { top: 20, left: 20 },
  };

  const posStyle = positionStyles[position];

  return (
    <Box
      className={className}
      sx={{
        position: 'fixed',
        zIndex: 1000,
        ...posStyle,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'inline-flex',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Tooltip text={tooltip} direction="w">
          <IconButton
            icon={
              isOpen
                ? XIcon
                : (icon as React.ElementType) || CommentDiscussionIcon
            }
            aria-label={isOpen ? 'Close chat' : 'Open chat'}
            onClick={onToggle}
            size="large"
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bg: brandColor || 'accent.emphasis',
              color: 'fg.onEmphasis',
              boxShadow: 'shadow.large',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              '&:hover': {
                bg: brandColor || 'accent.emphasis',
                boxShadow: 'shadow.extra-large',
              },
            }}
          />
        </Tooltip>

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              px: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bg: 'danger.emphasis',
              color: 'fg.onEmphasis',
              borderRadius: '50%',
              fontSize: 0,
              fontWeight: 'bold',
            }}
          >
            <Text sx={{ fontSize: 0 }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </Box>
        )}

        {/* Pulse animation when has unread */}
        {unreadCount > 0 && !isOpen && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: '50%',
              border: '2px solid',
              borderColor: 'accent.emphasis',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': {
                  transform: 'scale(1)',
                  opacity: 1,
                },
                '100%': {
                  transform: 'scale(1.5)',
                  opacity: 0,
                },
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
}

export default FloatingBrandButton;
