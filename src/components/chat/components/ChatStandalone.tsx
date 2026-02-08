/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Standalone Chat component.
 * A floating chat window that uses props-based message handling.
 * Perfect for custom integrations where you want full control over inference.
 *
 * This component uses ChatBase for all chat functionality and provides
 * a floating popup wrapper with animation, positioning, and FAB button.
 *
 * @module components/chat/components/ChatStandalone
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton, Text, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { XIcon, CommentDiscussionIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';

import {
  ChatBase,
  type ChatBaseProps,
  type RenderToolResult,
  type ToolCallRenderContext,
  type ToolCallStatus,
  type StreamingMessageOptions,
  type MessageHandler,
} from './base/ChatBase';
import { PoweredByTag, type PoweredByTagProps } from './elements/PoweredByTag';
import { useChatOpen, useChatMessages, useChatStore } from '../store/chatStore';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '../../../hooks/useKeyboardShortcuts';

// Re-export types for consumers
export type {
  ToolCallStatus,
  ToolCallRenderContext,
  RenderToolResult,
  StreamingMessageOptions,
  MessageHandler,
};

/**
 * ChatStandalone props
 */
export interface ChatStandaloneProps {
  /**
   * Handler for sending messages - REQUIRED.
   * This function will be called when the user sends a message.
   * Signature: `(message, messages, options?) => Promise<string | void>`
   * - message: The user's message text
   * - messages: All messages in the conversation (including the new user message)
   * - options: Streaming callbacks (onChunk, onComplete, onError, signal)
   */
  onSendMessage: MessageHandler;

  /** title */
  title?: string;

  /** Description shown in empty state */
  description?: string;

  /** Position of the popup */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Default open state */
  defaultOpen?: boolean;

  /** width */
  width?: number | string;

  /** height */
  height?: number | string;

  /** Show header */
  showHeader?: boolean;

  /** Show the floating button when closed */
  showButton?: boolean;

  /** Show new chat button */
  showNewChatButton?: boolean;

  /** Show clear button */
  showClearButton?: boolean;

  /** Show settings button */
  showSettingsButton?: boolean;

  /** Enable keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;

  /** Toggle shortcut key */
  toggleShortcut?: string;

  /** Show powered by tag */
  showPoweredBy?: boolean;

  /** Powered by tag props */
  poweredByProps?: Partial<PoweredByTagProps>;

  /** Enable click outside to close */
  clickOutsideToClose?: boolean;

  /** Enable escape key to close */
  escapeToClose?: boolean;

  /** Custom class name */
  className?: string;

  /** Input placeholder */
  placeholder?: string;

  /** Callback when settings clicked */
  onSettingsClick?: () => void;

  /** Callback when new chat clicked */
  onNewChat?: () => void;

  /** Callback when popup opens */
  onOpen?: () => void;

  /** Callback when popup closes */
  onClose?: () => void;

  /** Children to render in popup body (custom content) */
  children?: React.ReactNode;

  /** Custom brand icon */
  brandIcon?: React.ReactNode;

  /** Custom button icon when closed */
  buttonIcon?: React.ReactNode;

  /** Button tooltip text */
  buttonTooltip?: string;

  /** Brand color */
  brandColor?: string;

  /** Offset from edge (in pixels) */
  offset?: number;

  /** Animation duration (in ms) */
  animationDuration?: number;

  /** Enable streaming mode */
  enableStreaming?: boolean;

  /** Empty state message */
  emptyStateMessage?: string;

  /**
   * Custom render function for tool results.
   * When provided, tool calls will be rendered inline in the chat.
   */
  renderToolResult?: RenderToolResult;

  /** Additional ChatBase props */
  panelProps?: Partial<ChatBaseProps>;
}

/**
 * Hook to detect mobile viewport
 */
function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

/**
 * ChatStandalone component
 * A floating popup chat that uses ChatBase with custom onSendMessage handler
 */
export function ChatStandalone({
  onSendMessage,
  title = 'Chat',
  description = 'Start a conversation.',
  position = 'bottom-right',
  defaultOpen = false,
  width = 380,
  height = 520,
  showHeader = true,
  showButton = true,
  showNewChatButton = true,
  showClearButton = true,
  showSettingsButton = false,
  enableKeyboardShortcuts = true,
  toggleShortcut = '/',
  showPoweredBy = true,
  poweredByProps,
  clickOutsideToClose = true,
  escapeToClose = true,
  className,
  placeholder = 'Type a message...',
  onSettingsClick,
  onNewChat,
  onOpen,
  onClose,
  children,
  brandIcon,
  buttonIcon,
  buttonTooltip = 'Chat with AI',
  brandColor = '#7c3aed',
  offset = 20,
  animationDuration = 200,
  enableStreaming = true,
  emptyStateMessage = 'Start a conversation',
  renderToolResult,
  panelProps,
}: ChatStandaloneProps) {
  // Use Zustand store for state management
  const isOpen = useChatOpen();
  const messages = useChatMessages();
  const setOpen = useChatStore(state => state.setOpen);
  const clearMessages = useChatStore(state => state.clearMessages);

  const popupRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Focus trigger counter to refocus input after opening
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Initialize open state from defaultOpen
  useEffect(() => {
    setOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle popup with animation
  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    setIsAnimating(true);

    if (newOpen) {
      setOpen(newOpen);
      onOpen?.();
      // Trigger focus on input when opening
      setTimeout(() => setFocusTrigger(prev => prev + 1), animationDuration);
    } else {
      // Delay closing for animation
      setTimeout(() => {
        setOpen(newOpen);
        onClose?.();
        setIsAnimating(false);
      }, animationDuration);
    }

    // Reset animating after duration
    setTimeout(() => setIsAnimating(false), animationDuration);
  }, [isOpen, setOpen, onOpen, onClose, animationDuration]);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    clearMessages();
    onNewChat?.();
  }, [clearMessages, onNewChat]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      clearMessages();
    }
  }, [clearMessages]);

  // Keyboard shortcuts
  useChatKeyboardShortcuts({
    onToggle: enableKeyboardShortcuts ? handleToggle : undefined,
    onNewChat: enableKeyboardShortcuts ? handleNewChat : undefined,
    onClear:
      enableKeyboardShortcuts && messages.length > 0 ? handleClear : undefined,
    enabled: enableKeyboardShortcuts,
  });

  // Escape to close
  useEffect(() => {
    if (!escapeToClose || !isOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleToggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [escapeToClose, isOpen, handleToggle]);

  // Click outside to close
  useEffect(() => {
    if (!clickOutsideToClose || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        handleToggle();
      }
    };

    // Delay adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [clickOutsideToClose, isOpen, handleToggle]);

  // Mobile body scroll lock
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.touchAction = 'none';

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.touchAction = '';
      };
    }
  }, [isMobile, isOpen]);

  // Position styles
  const getPositionStyles = (): React.CSSProperties => {
    const styles: React.CSSProperties = {
      position: 'fixed',
      zIndex: 1000,
    };

    switch (position) {
      case 'bottom-right':
        styles.bottom = offset;
        styles.right = offset;
        break;
      case 'bottom-left':
        styles.bottom = offset;
        styles.left = offset;
        break;
      case 'top-right':
        styles.top = offset;
        styles.right = offset;
        break;
      case 'top-left':
        styles.top = offset;
        styles.left = offset;
        break;
    }

    return styles;
  };

  // Animation transform based on position
  const getAnimationTransform = (open: boolean): string => {
    if (open) return 'scale(1) translateY(0)';

    switch (position) {
      case 'bottom-right':
      case 'bottom-left':
        return 'scale(0.95) translateY(20px)';
      case 'top-right':
      case 'top-left':
        return 'scale(0.95) translateY(-20px)';
      default:
        return 'scale(0.95)';
    }
  };

  // Shortcut hint for toggle
  const shortcutHint = enableKeyboardShortcuts
    ? getShortcutDisplay({
        key: toggleShortcut,
        ctrlOrCmd: true,
        handler: () => {},
      })
    : undefined;

  // Responsive dimensions
  const popupWidth = isMobile ? '100%' : width;
  const popupHeight = isMobile ? '100%' : height;

  // Mobile full-screen styles
  const mobileStyles: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        borderRadius: 0,
      }
    : {};

  // Close button for header
  const closeButton = (
    <Tooltip text={`Close${escapeToClose ? ' (Esc)' : ''}`} direction="s">
      <IconButton
        icon={XIcon}
        aria-label="Close"
        onClick={handleToggle}
        variant="invisible"
        size="small"
      />
    </Tooltip>
  );

  return (
    <>
      {/* Floating button when closed */}
      {showButton && !isOpen && (
        <Box
          sx={{
            ...getPositionStyles(),
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
            <Tooltip
              text={`${buttonTooltip}${shortcutHint ? ` (${shortcutHint})` : ''}`}
              direction={position.includes('right') ? 'w' : 'e'}
            >
              <IconButton
                icon={
                  buttonIcon
                    ? (buttonIcon as React.ElementType)
                    : CommentDiscussionIcon
                }
                aria-label={buttonTooltip}
                onClick={handleToggle}
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
            {messages.length > 0 && (
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
                  {messages.length > 99 ? '99+' : messages.length}
                </Text>
              </Box>
            )}

            {/* Pulse animation when has messages */}
            {messages.length > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: brandColor || 'accent.emphasis',
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
      )}

      {/* Mobile overlay backdrop */}
      {isMobile && isOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bg: 'neutral.muted',
            opacity: 0.5,
            zIndex: 999,
          }}
          onClick={handleToggle}
        />
      )}

      {/* window */}
      {(isOpen || isAnimating) && (
        <Box
          ref={popupRef}
          className={className}
          sx={{
            ...getPositionStyles(),
            width: isMobile
              ? '100%'
              : typeof popupWidth === 'number'
                ? `${popupWidth}px`
                : popupWidth,
            height: isMobile
              ? '100%'
              : typeof popupHeight === 'number'
                ? `${popupHeight}px`
                : popupHeight,
            display: 'flex',
            flexDirection: 'column',
            bg: 'canvas.default',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: isMobile ? 0 : '12px',
            boxShadow: 'shadow.extra-large',
            overflow: 'hidden',
            transform: getAnimationTransform(isOpen),
            opacity: isOpen ? 1 : 0,
            transition: `transform ${animationDuration}ms ease, opacity ${animationDuration}ms ease`,
            zIndex: 1001,
            ...mobileStyles,
          }}
        >
          <ChatBase
            title={title}
            showHeader={showHeader}
            showInput={true}
            showPoweredBy={false}
            useStore={true}
            onSendMessage={onSendMessage}
            enableStreaming={enableStreaming}
            brandIcon={brandIcon || <AiAgentIcon colored size={20} />}
            headerButtons={{
              showNewChat: showNewChatButton,
              showClear: showClearButton && messages.length > 0,
              showSettings: showSettingsButton,
              onNewChat: handleNewChat,
              onClear: handleClear,
              onSettings: onSettingsClick,
            }}
            headerActions={closeButton}
            renderToolResult={renderToolResult}
            description={description}
            placeholder={placeholder}
            emptyState={{
              title: emptyStateMessage,
            }}
            avatarConfig={{
              showAvatars: true,
            }}
            backgroundColor="canvas.subtle"
            focusTrigger={focusTrigger}
            {...panelProps}
          >
            {children}
          </ChatBase>

          {/* Powered by tag */}
          {showPoweredBy && (
            <Box
              sx={{
                p: 2,
                borderTop: '1px solid',
                borderColor: 'border.default',
                bg: 'canvas.subtle',
              }}
            >
              <PoweredByTag
                show={true}
                brandName="Datalayer"
                brandUrl="https://datalayer.ai"
                {...poweredByProps}
              />
            </Box>
          )}
        </Box>
      )}
    </>
  );
}

export default ChatStandalone;
