/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatFloating - A floating chat component.
 *
 * This component provides a floating chat popup that uses ChatBase
 * for all chat functionality (messages, input, protocol support).
 *
 * Supports:
 * 1. AG-UI mode: When `endpoint` is provided
 * 2. Store mode: When `useStore` is true
 * 3. Any protocol supported by ChatBase (AG-UI, A2A, ACP, Vercel AI)
 *
 * @module components/chat/components/ChatFloating
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconButton, Text, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  XIcon,
  CommentDiscussionIcon,
  SidebarExpandIcon,
  SidebarCollapseIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';

import {
  ChatBase,
  type ChatBaseProps,
  type RenderToolResult,
  type ToolCallRenderContext,
  type ToolCallStatus,
  type ProtocolConfig,
  type RespondCallback,
  type Suggestion,
  type RemoteConfig,
  type ModelConfig,
  type BuiltinTool,
  type MCPServerConfig,
  type MCPServerTool,
} from './base/ChatBase';
import type { PoweredByTagProps } from './elements/PoweredByTag';
import { useChatOpen, useChatMessages, useChatStore } from '../store/chatStore';
import {
  useChatKeyboardShortcuts,
  getShortcutDisplay,
} from '../../../hooks/useKeyboardShortcuts';
import type { FrontendToolDefinition } from '../types/tool';

// Re-export types for backward compatibility
export type {
  ToolCallStatus,
  ToolCallRenderContext,
  RenderToolResult,
  RespondCallback,
  Suggestion,
  RemoteConfig,
  ModelConfig,
  BuiltinTool,
  MCPServerConfig,
  MCPServerTool,
};

/**
 * ChatFloating props
 */
export interface ChatFloatingProps {
  /**
   * AG-UI endpoint URL (e.g., http://localhost:8000/api/v1/examples/agentic_chat).
   * When provided with useStore=false, enables AG-UI protocol mode.
   */
  endpoint?: string;

  /**
   * Protocol configuration for other protocols (A2A, ACP, Vercel AI).
   * Takes precedence over endpoint when provided.
   */
  protocol?: ProtocolConfig;

  /**
   * Use Zustand store for state management instead of protocol endpoint.
   * @default false
   */
  useStore?: boolean;

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

  /** Callback when settings clicked */
  onSettingsClick?: () => void;

  /** Callback when new chat clicked */
  onNewChat?: () => void;

  /** Callback when popup opens */
  onOpen?: () => void;

  /** Callback when popup closes */
  onClose?: () => void;

  /** Callback for state updates (for shared state example) */
  onStateUpdate?: (state: unknown) => void;

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

  /**
   * Custom render function for tool results.
   * When provided, tool calls will be rendered inline in the chat
   * using this function instead of being hidden.
   */
  renderToolResult?: RenderToolResult;

  /** Custom tools to register (for tool-based examples) */
  tools?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    handler: (args: unknown) => Promise<unknown>;
  }>;

  /** Initial state (for shared state example) */
  initialState?: Record<string, unknown>;

  /**
   * Suggestions to show in empty state.
   * When clicked, the suggestion message is populated in the input.
   */
  suggestions?: Suggestion[];

  /**
   * Whether to automatically submit the message when a suggestion is clicked.
   * @default true
   */
  submitOnSuggestionClick?: boolean;

  /**
   * Whether to hide assistant messages that follow a rendered tool call UI.
   * @default false
   */
  hideMessagesAfterToolUI?: boolean;

  /**
   * Default view mode.
   * @default 'floating'
   */
  defaultViewMode?: 'floating' | 'panel';

  /**
   * Show backdrop overlay in panel mode.
   * When true, a semi-transparent overlay covers the page behind the panel.
   * @default false
   */
  showPanelBackdrop?: boolean;

  /**
   * Override the list of available models.
   * When provided, this list replaces the models returned by the config endpoint.
   * Use this to restrict the model selector to a specific subset of models.
   */
  availableModels?: ModelConfig[];

  /**
   * Show model selector in footer.
   * @default false
   */
  showModelSelector?: boolean;

  /**
   * Show tools menu in footer.
   * @default false
   */
  showToolsMenu?: boolean;

  /**
   * Show skills menu in footer.
   * @default false
   */
  showSkillsMenu?: boolean;

  /**
   * Show token usage bar between input and selectors.
   * @default true
   */
  showTokenUsage?: boolean;

  /**
   * Runtime ID used to scope and persist conversation history.
   * When provided, history is fetched on mount from the historyEndpoint.
   */
  runtimeId?: string;

  /**
   * Endpoint URL for fetching conversation history.
   * Defaults to `{protocol.endpoint}/history` when runtimeId is set.
   */
  historyEndpoint?: string;

  /**
   * Auth token for the history endpoint.
   */
  historyAuthToken?: string;

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
 * ChatFloating component
 * A floating chat window built on ChatBase
 */
export function ChatFloating({
  endpoint,
  protocol: protocolProp,
  useStore: useStoreMode = true,
  title = 'Chat',
  description = 'Start a conversation with the AI agent.',
  position = 'bottom-right',
  defaultOpen = false,
  width = 400,
  height = 550,
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
  onSettingsClick,
  onNewChat,
  onOpen,
  onClose,
  onStateUpdate,
  children,
  brandIcon,
  buttonIcon,
  buttonTooltip = 'Chat with AI',
  brandColor = '#7c3aed',
  offset = 20,
  animationDuration = 200,
  renderToolResult,
  tools: _tools,
  initialState: _initialState,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  defaultViewMode = 'floating',
  showPanelBackdrop = false,
  availableModels,
  showModelSelector = false,
  showToolsMenu = false,
  showSkillsMenu = false,
  showTokenUsage = true,
  runtimeId,
  historyEndpoint,
  historyAuthToken,
  panelProps,
}: ChatFloatingProps) {
  // Store-based state
  const storeIsOpen = useChatOpen();
  const storeMessages = useChatMessages();
  const setStoreOpen = useChatStore(state => state.setOpen);
  const clearStoreMessages = useChatStore(state => state.clearMessages);

  // Local state for non-store mode
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);

  // Derived state
  const isOpen = useStoreMode ? storeIsOpen : localIsOpen;
  const setIsOpen = useStoreMode ? setStoreOpen : setLocalIsOpen;
  const messages = storeMessages;

  const popupRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [viewMode, setViewMode] = useState<'floating' | 'panel'>(
    defaultViewMode,
  );
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Build protocol config from endpoint if not provided directly
  // Memoize to avoid creating new object on every render (which would trigger useEffect re-runs)
  const protocol: ProtocolConfig | undefined = useMemo(() => {
    if (protocolProp) return protocolProp;

    if (!endpoint) return undefined;

    // Extract base URL from endpoint - everything before /api/v1/
    // e.g., https://prod1.datalayer.run/agent-runtimes/pool1/rt123/api/v1/ag-ui/default/
    //     -> https://prod1.datalayer.run/agent-runtimes/pool1/rt123
    const baseUrl =
      endpoint.match(/^(.*?)\/api\/v1\//)?.[1] ||
      endpoint.match(/^(https?:\/\/[^/]+)/)?.[1] ||
      '';

    // Extract agentId from endpoint path (e.g., .../ag-ui/default/ -> default)
    const agentIdMatch = endpoint.match(/\/ag-ui\/([^/]+)/);
    const extractedAgentId = agentIdMatch ? agentIdMatch[1] : undefined;

    return {
      type: 'ag-ui' as const,
      endpoint,
      agentId: extractedAgentId,
      // Enable config query for model/tools/skills selector or token usage
      enableConfigQuery:
        showModelSelector || showToolsMenu || showSkillsMenu || showTokenUsage,
      // Config endpoint is at /api/v1/configure (global, not per-agent)
      configEndpoint:
        showModelSelector || showToolsMenu || showSkillsMenu || showTokenUsage
          ? `${baseUrl}/api/v1/configure`
          : undefined,
    };
  }, [
    protocolProp,
    endpoint,
    showModelSelector,
    showToolsMenu,
    showSkillsMenu,
    showTokenUsage,
  ]);

  // Clear messages when endpoint/protocol changes (e.g., switching examples)
  useEffect(() => {
    clearStoreMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, protocolProp]);

  // Initialize open state from defaultOpen
  useEffect(() => {
    setIsOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle popup with animation
  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    setIsAnimating(true);

    if (newOpen) {
      setIsOpen(newOpen);
      onOpen?.();
    } else {
      // Delay closing for animation
      setTimeout(() => {
        setIsOpen(newOpen);
        onClose?.();
        setIsAnimating(false);
      }, animationDuration);
    }

    // Reset animating after duration
    setTimeout(() => setIsAnimating(false), animationDuration);
  }, [isOpen, setIsOpen, onOpen, onClose, animationDuration]);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    if (useStoreMode) {
      clearStoreMessages();
    }
    onNewChat?.();
  }, [useStoreMode, clearStoreMessages, onNewChat]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      if (useStoreMode) {
        clearStoreMessages();
      }
    }
  }, [useStoreMode, clearStoreMessages]);

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

  // Toggle view mode handler
  const handleToggleViewMode = useCallback(() => {
    setViewMode(prev => (prev === 'floating' ? 'panel' : 'floating'));
    setFocusTrigger(prev => prev + 1);
  }, []);

  // View mode toggle button
  const viewModeToggle = !isMobile && (
    <Tooltip
      text={viewMode === 'floating' ? 'Expand to panel' : 'Collapse to popup'}
      direction="s"
    >
      <IconButton
        icon={viewMode === 'floating' ? SidebarExpandIcon : SidebarCollapseIcon}
        aria-label={
          viewMode === 'floating' ? 'Expand to panel' : 'Collapse to popup'
        }
        onClick={handleToggleViewMode}
        variant="invisible"
        size="small"
      />
    </Tooltip>
  );

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
                  top: 0,
                  right: 0,
                  minWidth: 18,
                  height: 18,
                  px: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bg: 'danger.emphasis',
                  color: 'fg.onEmphasis',
                  borderRadius: '50%',
                  fontSize: 0,
                  fontWeight: 'bold',
                  pointerEvents: 'none',
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
                  pointerEvents: 'none',
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

      {/* Panel mode backdrop overlay - only shown when showPanelBackdrop is true */}
      {showPanelBackdrop && viewMode === 'panel' && isOpen && !isMobile && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bg: 'neutral.muted',
            opacity: 0.3,
            zIndex: 1000,
          }}
          onClick={handleToggle}
        />
      )}

      {/* window - always rendered to preserve state, hidden when closed */}
      <Box
        ref={popupRef}
        className={className}
        sx={{
          position: 'fixed',
          ...(viewMode === 'floating' && !isMobile ? getPositionStyles() : {}),
          ...(viewMode === 'panel' && !isMobile
            ? {
                top: 0,
                right: 0,
                bottom: 0,
                left: 'auto',
              }
            : {}),
          width:
            viewMode === 'panel' && !isMobile
              ? '420px'
              : isMobile
                ? '100%'
                : typeof popupWidth === 'number'
                  ? `${popupWidth}px`
                  : popupWidth,
          height:
            viewMode === 'panel' && !isMobile
              ? 'auto'
              : isMobile
                ? '100%'
                : typeof popupHeight === 'number'
                  ? `${popupHeight}px`
                  : popupHeight,
          display: 'flex',
          flexDirection: 'column',
          bg: 'canvas.default',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: viewMode === 'panel' || isMobile ? 0 : '12px',
          boxShadow:
            viewMode === 'panel' ? 'shadow.large' : 'shadow.extra-large',
          overflow: 'hidden',
          transform:
            viewMode === 'panel'
              ? isOpen
                ? 'translateX(0)'
                : 'translateX(100%)'
              : getAnimationTransform(isOpen),
          opacity: viewMode === 'panel' ? 1 : isOpen ? 1 : 0,
          transition: `transform ${animationDuration}ms ease, opacity ${animationDuration}ms ease`,
          zIndex: 1001,
          // Hide from accessibility and pointer events when closed
          visibility: isOpen || isAnimating ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          ...mobileStyles,
        }}
      >
        <ChatBase
          title={title}
          showHeader={showHeader}
          useStore={useStoreMode}
          protocol={protocol}
          autoFocus={isOpen}
          focusTrigger={focusTrigger}
          brandIcon={brandIcon || <AiAgentIcon colored size={20} />}
          headerButtons={{
            showNewChat: showNewChatButton,
            showClear: showClearButton && messages.length > 0,
            showSettings: showSettingsButton,
            onNewChat: handleNewChat,
            onClear: handleClear,
            onSettings: onSettingsClick,
          }}
          headerActions={
            <>
              {viewModeToggle}
              {closeButton}
            </>
          }
          showPoweredBy={showPoweredBy}
          poweredByProps={{
            brandName: 'Datalayer',
            brandUrl: 'https://datalayer.ai',
            ...poweredByProps,
          }}
          renderToolResult={renderToolResult}
          description={description}
          onStateUpdate={onStateUpdate}
          onNewChat={onNewChat}
          suggestions={suggestions}
          submitOnSuggestionClick={submitOnSuggestionClick}
          hideMessagesAfterToolUI={hideMessagesAfterToolUI}
          avatarConfig={{
            showAvatars: true,
          }}
          placeholder="Type a message..."
          backgroundColor="canvas.subtle"
          frontendTools={_tools as FrontendToolDefinition[] | undefined}
          showModelSelector={showModelSelector}
          availableModels={availableModels}
          showToolsMenu={showToolsMenu}
          showSkillsMenu={showSkillsMenu}
          showTokenUsage={showTokenUsage}
          runtimeId={runtimeId}
          historyEndpoint={historyEndpoint}
          historyAuthToken={historyAuthToken}
          {...panelProps}
        >
          {children}
        </ChatBase>
      </Box>
    </>
  );
}

export default ChatFloating;
