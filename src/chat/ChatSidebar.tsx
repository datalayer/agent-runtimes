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
 * @module chat/ChatSidebar
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  SidebarCollapseIcon,
  SidebarExpandIcon,
  XIcon,
} from '@primer/octicons-react';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '@datalayer/core/lib/hooks';
import { ChatBase } from './base/ChatBase';
import type { ChatCommonProps } from '../types';
import {
  useChatStore,
  useChatOpen,
  useChatMessages,
} from '../stores/chatStore';

/**
 * ChatSidebar props — extends ChatCommonProps with sidebar-specific configuration.
 */
export interface ChatSidebarProps extends ChatCommonProps {
  /** Sidebar title */
  title?: string;
  /** Initial open state */
  defaultOpen?: boolean;

  /** Sidebar position */
  position?: 'left' | 'right';

  /** Sidebar width when open */
  width?: number | string;

  /** Enable keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;

  /** Keyboard shortcut to toggle (default: 'k') */
  toggleShortcut?: string;

  /** Enable click outside to close */
  clickOutsideToClose?: boolean;

  /** Enable escape key to close */
  escapeToClose?: boolean;
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
  protocol: protocolProp,
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
  className,
  onSettingsClick,
  onNewChat,
  onOpen,
  onClose,
  children,
  brandIcon,
  onSendMessage,
  enableStreaming = true,
  onToolCallStart,
  onToolCallComplete,
  placeholder = 'Ask a question...',
  description,
  pendingPrompt,
  showToolApprovalBanner,
  pendingApprovals,
  onApproveApproval,
  onRejectApproval,
  panelProps,
}: ChatSidebarProps) {
  const isOpen = useChatOpen();
  const messages = useChatMessages();
  const setOpen = useChatStore(state => state.setOpen);
  const clearMessages = useChatStore(state => state.clearMessages);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [desktopViewportHeight, setDesktopViewportHeight] = useState<
    number | null
  >(null);

  // Compute available desktop height from the element's top position so the
  // sidebar always fits within the visible viewport.
  useEffect(() => {
    if (isMobile) {
      setDesktopViewportHeight(null);
      return;
    }

    const updateHeight = () => {
      const el = sidebarRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight =
        window.visualViewport?.height || window.innerHeight || 0;
      const bottomPadding = 4; // keep a small breathing space from viewport edge
      const available = Math.max(
        220,
        Math.floor(viewportHeight - rect.top - bottomPadding),
      );
      setDesktopViewportHeight(prev =>
        prev !== null && Math.abs(prev - available) < 2 ? prev : available,
      );
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('scroll', updateHeight, true);

    const observer = new ResizeObserver(() => updateHeight());
    if (sidebarRef.current) {
      observer.observe(sidebarRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('scroll', updateHeight, true);
      observer.disconnect();
    };
  }, [isMobile]);

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
    const collapsedLauncher = (
      <Box
        ref={sidebarRef}
        className={className}
        sx={{
          position: 'fixed',
          top: 12,
          ...(position === 'right'
            ? { right: 'env(safe-area-inset-right)' }
            : { left: 'env(safe-area-inset-left)' }),
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            icon={
              position === 'right' ? SidebarExpandIcon : SidebarCollapseIcon
            }
            aria-label="Open chat"
            description={
              shortcutHint ? `Open chat (${shortcutHint})` : 'Open chat'
            }
            onClick={handleToggle}
            variant="default"
            size="small"
            sx={{
              bg: 'canvas.default',
              border: '1px solid',
              borderColor: 'border.default',
              boxShadow: 'shadow.small',
            }}
          />

          {messages.length > 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 16,
                height: 16,
                px: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bg: 'accent.emphasis',
                color: 'fg.onEmphasis',
                borderRadius: '50%',
                fontSize: '10px',
                fontWeight: 'bold',
                boxShadow: 'shadow.small',
              }}
            >
              {messages.length > 99 ? '99+' : messages.length}
            </Box>
          )}
        </Box>
      </Box>
    );

    // Render the collapsed launcher in a body portal so it stays pinned to the
    // viewport edge even when ancestors use transforms/positioning contexts.
    if (typeof document !== 'undefined' && document.body) {
      return createPortal(collapsedLauncher, document.body);
    }

    return collapsedLauncher;
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
          alignSelf: 'stretch',
          width: isMobile
            ? '100%'
            : typeof width === 'number'
              ? `${width}px`
              : width,
          height: isMobile
            ? '100%'
            : desktopViewportHeight
              ? `${desktopViewportHeight}px`
              : 'calc(100dvh - 8px)',
          minHeight: 0,
          maxHeight: isMobile
            ? '100%'
            : desktopViewportHeight
              ? `${desktopViewportHeight}px`
              : 'calc(100dvh - 8px)',
          marginBlock: isMobile ? 0 : '4px',
          flex: isMobile ? '1 1 auto' : '0 0 auto',
          bg: 'canvas.default',
          borderLeft: !isMobile && position === 'right' ? '1px solid' : 'none',
          borderRight: !isMobile && position === 'left' ? '1px solid' : 'none',
          borderColor: 'border.default',
          overflow: 'hidden',
          ...mobileStyles,
        }}
      >
        <ChatBase
          title={title}
          showHeader={showHeader}
          brandIcon={brandIcon}
          protocol={protocolProp}
          headerButtons={{
            showNewChat: showNewChatButton,
            showClear: showClearButton && messages.length > 0,
            showSettings: showSettingsButton && !!onSettingsClick,
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
          onToolCallStart={onToolCallStart}
          onToolCallComplete={onToolCallComplete}
          pendingPrompt={pendingPrompt}
          showToolApprovalBanner={showToolApprovalBanner}
          pendingApprovals={pendingApprovals}
          onApproveApproval={onApproveApproval}
          onRejectApproval={onRejectApproval}
          {...panelProps}
        >
          {children}
        </ChatBase>
      </Box>
    </>
  );
}

export default ChatSidebar;
