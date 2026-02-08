/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Standalone Chat Popup component.
 * A floating chat window that uses props-based message handling.
 * Perfect for custom integrations where you want full control over inference.
 *
 * This component uses ChatBase for all chat functionality and provides
 * a floating popup wrapper with animation, positioning, and FAB button.
 *
 * @module components/chat/components/ChatPopupStandalone
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { IconButton, Text, Tooltip, Textarea, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  XIcon,
  CommentDiscussionIcon,
  PaperAirplaneIcon,
  SquareCircleIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';

import {
  ChatBase,
  type ChatBaseProps,
  type RenderToolResult,
  type ToolCallRenderContext,
  type ToolCallStatus,
} from './base/ChatBase';
import { PoweredByTag, type PoweredByTagProps } from './elements/PoweredByTag';
import {
  useChatOpen,
  useChatMessages,
  useChatStore,
  useChatLoading,
  useChatStreaming,
} from '../store/chatStore';
import {
  generateMessageId,
  createUserMessage,
  createAssistantMessage,
} from '../types/message';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '../../../hooks/useKeyboardShortcuts';

// Re-export types for backward compatibility
export type { ToolCallStatus, ToolCallRenderContext, RenderToolResult };

/**
 * Simple message handler type for standalone usage
 */
export type MessageHandler = (
  message: string,
  options?: {
    onChunk?: (chunk: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
  },
) => Promise<string>;

/**
 * ChatPopupStandalone props
 */
export interface ChatPopupStandaloneProps {
  /**
   * Handler for sending messages - REQUIRED.
   * This function will be called when the user sends a message.
   */
  onSendMessage: MessageHandler;

  /** Popup title */
  title?: string;

  /** Description shown in empty state */
  description?: string;

  /** Position of the popup */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Default open state */
  defaultOpen?: boolean;

  /** Popup width */
  width?: number | string;

  /** Popup height */
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
 * ChatPopupStandalone component
 * A floating popup chat that uses ChatBase with custom onSendMessage handler
 */
export function ChatPopupStandalone({
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
}: ChatPopupStandaloneProps) {
  // Use Zustand store for state management
  const isOpen = useChatOpen();
  const messages = useChatMessages();
  const isLoading = useChatLoading();
  const { isStreaming } = useChatStreaming();
  const setOpen = useChatStore(state => state.setOpen);
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const clearMessages = useChatStore(state => state.clearMessages);
  const setLoading = useChatStore(state => state.setLoading);
  const startStreaming = useChatStore(state => state.startStreaming);
  const appendToStream = useChatStore(state => state.appendToStream);
  const stopStreaming = useChatStore(state => state.stopStreaming);

  const popupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [inputValue, setInputValue] = useState('');

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
      // Focus input when opening
      setTimeout(() => textareaRef.current?.focus(), animationDuration);
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

  // Handle stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    stopStreaming();
    setLoading(false);
  }, [stopStreaming, setLoading]);

  // Handle send message with streaming support
  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    setInputValue('');

    // Add user message
    const userMessage = createUserMessage(content);
    addMessage(userMessage);

    // Create assistant message placeholder
    const assistantMessageId = generateMessageId();
    const assistantMessage = createAssistantMessage('');
    assistantMessage.id = assistantMessageId;
    addMessage(assistantMessage);

    setLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      if (enableStreaming) {
        startStreaming(assistantMessageId);

        await onSendMessage(content, {
          onChunk: chunk => {
            appendToStream(assistantMessageId, chunk);
          },
          onComplete: fullResponse => {
            updateMessage(assistantMessageId, { content: fullResponse });
            stopStreaming();
            setLoading(false);
          },
          onError: error => {
            updateMessage(assistantMessageId, {
              content: `Error: ${error.message}`,
            });
            stopStreaming();
            setLoading(false);
          },
          signal: abortControllerRef.current.signal,
        });
      } else {
        const response = await onSendMessage(content, {
          signal: abortControllerRef.current.signal,
        });
        updateMessage(assistantMessageId, { content: response });
        setLoading(false);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        updateMessage(assistantMessageId, {
          content: `Error: ${(error as Error).message}`,
        });
      }
      stopStreaming();
      setLoading(false);
    }
  }, [
    inputValue,
    isLoading,
    onSendMessage,
    enableStreaming,
    addMessage,
    updateMessage,
    setLoading,
    startStreaming,
    appendToStream,
    stopStreaming,
  ]);

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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

      {/* Popup window */}
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
            showInput={false}
            showPoweredBy={false}
            useStore={true}
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
            emptyState={{
              title: emptyStateMessage,
            }}
            avatarConfig={{
              showAvatars: true,
            }}
            backgroundColor="canvas.subtle"
            {...panelProps}
          >
            {children}
          </ChatBase>

          {/* Custom input area with streaming support */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              p: 3,
              borderTop: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.default',
            }}
          >
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              sx={{
                flex: 1,
                resize: 'none',
                minHeight: '40px',
                maxHeight: '120px',
              }}
              rows={1}
            />
            {isLoading || isStreaming ? (
              <Button onClick={handleStop} variant="danger">
                <SquareCircleIcon />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                variant="primary"
                disabled={!inputValue.trim()}
              >
                <PaperAirplaneIcon />
              </Button>
            )}
          </Box>

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

export default ChatPopupStandalone;
