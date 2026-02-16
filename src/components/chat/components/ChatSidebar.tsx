/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat sidebar component.
 * Provides a collapsible sidebar with chat interface.
 * Features: keyboard shortcuts, mobile responsive, powered by tag.
 * Built on top of ChatBase for core chat functionality.
 *
 * @module components/chat/components/ChatSidebar
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  SidebarCollapseIcon,
  SidebarExpandIcon,
  XIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import {
  ChatBase,
  type ChatBaseProps,
  type MessageHandler,
} from './base/ChatBase';
import type { PoweredByTagProps } from './elements/PoweredByTag';

// Re-export MessageHandler for consumers
export type { MessageHandler };
import { useChatStore, useChatOpen, useChatMessages } from '../store/chatStore';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '../../../hooks/useKeyboardShortcuts';

/**
 * ChatSidebar props
 */
export interface ChatSidebarProps {
  /** Sidebar title */
  title?: string;

  /** Initial open state */
  defaultOpen?: boolean;

  /** Sidebar position */
  position?: 'left' | 'right';

  /** Sidebar width when open */
  width?: number | string;

  /** Show header */
  showHeader?: boolean;

  /** Show new chat button */
  showNewChatButton?: boolean;

  /** Show clear button */
  showClearButton?: boolean;

  /** Show settings button */
  showSettingsButton?: boolean;

  /** Enable keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;

  /** Keyboard shortcut to toggle (default: 'k') */
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

  /** Callback when settings clicked */
  onSettingsClick?: () => void;

  /** Callback when new chat clicked */
  onNewChat?: () => void;

  /** Callback when sidebar opens */
  onOpen?: () => void;

  /** Callback when sidebar closes */
  onClose?: () => void;

  /** Children to render in sidebar body (custom content) */
  children?: React.ReactNode;

  /** Custom brand icon */
  brandIcon?: React.ReactNode;

  /**
   * Handler for sending messages.
   * When provided, this is used instead of protocol mode.
   * Signature: `(message, messages, options?) => Promise<string | void>`
   */
  onSendMessage?: MessageHandler;

  /** Enable streaming mode (default: true) */
  enableStreaming?: boolean;

  /** Input placeholder */
  placeholder?: string;

  /** Description shown in empty state */
  description?: string;

  /**
   * A prompt to append and send after the conversation history is loaded.
   * The message is shown in the chat and sent to the agent exactly once.
   */
  pendingPrompt?: string;

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
 * Chat Sidebar component
 */
export function ChatSidebar({
  title = 'Chat',
  defaultOpen = true,
  position = 'right',
  width = 400,
  showHeader = true,
  showNewChatButton = true,
  showClearButton = true,
  showSettingsButton = false,
  enableKeyboardShortcuts = true,
  toggleShortcut = 'k',
  showPoweredBy = true,
  poweredByProps,
  clickOutsideToClose = true,
  escapeToClose = true,
  className,
  onSettingsClick,
  onNewChat,
  onOpen,
  onClose,
  children,
  brandIcon,
  onSendMessage,
  enableStreaming = true,
  placeholder = 'Ask a question...',
  description,
  pendingPrompt,
  panelProps,
}: ChatSidebarProps) {
  const isOpen = useChatOpen();
  const messages = useChatMessages();
  const setOpen = useChatStore(state => state.setOpen);
  const clearMessages = useChatStore(state => state.clearMessages);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Initialize open state from defaultOpen
  useEffect(() => {
    setOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle sidebar
  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    setOpen(newOpen);
    if (newOpen) {
      onOpen?.();
    } else {
      onClose?.();
    }
  }, [isOpen, setOpen, onOpen, onClose]);

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

  // Focus input
  const handleFocusInput = useCallback(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useChatKeyboardShortcuts({
    onToggle: enableKeyboardShortcuts ? handleToggle : undefined,
    onNewChat: enableKeyboardShortcuts ? handleNewChat : undefined,
    onClear:
      enableKeyboardShortcuts && messages.length > 0 ? handleClear : undefined,
    onFocusInput:
      enableKeyboardShortcuts && isOpen ? handleFocusInput : undefined,
    enabled: enableKeyboardShortcuts,
  });

  // Click outside to close
  useEffect(() => {
    if (!clickOutsideToClose || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        onClose?.();
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
  }, [clickOutsideToClose, isOpen, setOpen, onClose]);

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

  // Shortcut hint for toggle
  const shortcutHint = enableKeyboardShortcuts
    ? getShortcutDisplay({
        key: toggleShortcut,
        ctrlOrCmd: true,
        handler: () => {},
      })
    : undefined;

  // Collapse toggle button for header
  const collapseButton = (
    <IconButton
      icon={
        isMobile
          ? XIcon
          : position === 'right'
            ? SidebarCollapseIcon
            : SidebarExpandIcon
      }
      aria-label={`Close sidebar${shortcutHint ? ` (${shortcutHint})` : ''}`}
      onClick={handleToggle}
      variant="invisible"
      size="small"
    />
  );

  // Collapsed state
  if (!isOpen) {
    return (
      <Box
        ref={sidebarRef}
        className={className}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 2,
          bg: 'canvas.subtle',
          borderLeft: position === 'right' ? '1px solid' : 'none',
          borderRight: position === 'left' ? '1px solid' : 'none',
          borderColor: 'border.default',
          width: 48,
        }}
      >
        <IconButton
          icon={position === 'right' ? SidebarExpandIcon : SidebarCollapseIcon}
          aria-label={`Open chat${shortcutHint ? ` (${shortcutHint})` : ''}`}
          onClick={handleToggle}
          variant="invisible"
        />

        <Box sx={{ mt: 2 }}>
          {brandIcon || <AiAgentIcon colored size={24} />}
        </Box>

        {messages.length > 0 && (
          <Box
            sx={{
              mt: 2,
              px: 2,
              py: 1,
              bg: 'accent.emphasis',
              color: 'fg.onEmphasis',
              borderRadius: '50%',
              fontSize: 0,
              fontWeight: 'bold',
            }}
          >
            {messages.length}
          </Box>
        )}

        {/* Keyboard shortcut hint */}
        {shortcutHint && (
          <Box
            sx={{
              mt: 'auto',
              mb: 1,
              px: 1,
              py: '2px',
              bg: 'neutral.muted',
              color: 'fg.muted',
              borderRadius: 1,
              fontSize: 0,
            }}
          >
            <Text sx={{ fontSize: '10px', fontFamily: 'mono' }}>
              {shortcutHint}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Mobile full-screen overlay
  const mobileStyles = isMobile
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        zIndex: 1000,
      }
    : {};

  // Expanded state using ChatBase
  return (
    <>
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

      <Box
        ref={sidebarRef}
        className={className}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: isMobile
            ? '100%'
            : typeof width === 'number'
              ? `${width}px`
              : width,
          height: '100%',
          bg: 'canvas.default',
          borderLeft: !isMobile && position === 'right' ? '1px solid' : 'none',
          borderRight: !isMobile && position === 'left' ? '1px solid' : 'none',
          borderColor: 'border.default',
          ...mobileStyles,
        }}
      >
        <ChatBase
          title={title}
          showHeader={showHeader}
          brandIcon={brandIcon}
          headerButtons={{
            showNewChat: showNewChatButton,
            showClear: showClearButton && messages.length > 0,
            showSettings: showSettingsButton,
            onNewChat: handleNewChat,
            onClear: handleClear,
            onSettings: onSettingsClick,
          }}
          headerActions={collapseButton}
          showPoweredBy={showPoweredBy}
          poweredByProps={{
            brandName: 'Datalayer',
            brandUrl: 'https://datalayer.ai',
            ...poweredByProps,
          }}
          avatarConfig={{
            showAvatars: true,
          }}
          placeholder={placeholder}
          description={description}
          onSendMessage={onSendMessage}
          enableStreaming={enableStreaming}
          pendingPrompt={pendingPrompt}
          {...panelProps}
        >
          {children}
        </ChatBase>
      </Box>
    </>
  );
}

export default ChatSidebar;
