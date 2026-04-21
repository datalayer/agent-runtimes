/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Main ChatBase component.
 * Provides a full chat interface with messages and input.
 * This is the base component used by all other chat container components.
 *
 * Supports multiple modes:
 * 1. Store mode: Uses Zustand store for state management (default)
 * 2. Protocol mode: Connects to backend via AG-UI, A2A, Vercel AI, or ACP protocols
 * 3. Custom mode: Uses onSendMessage prop for custom message handling
 *
 * @module chat/base/ChatBase
 */

import { useContext } from 'react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, Spinner } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { AlertIcon, PersonIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { QueryClientProvider, QueryClientContext } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import type { ChatMessage } from '../../types/messages';
import {
  generateMessageId,
  createUserMessage,
  createAssistantMessage,
} from '../../types/messages';
import type { ProtocolConfig, ProtocolEvent } from '../../types/protocol';
import type { BaseProtocolAdapter } from '../../protocols';
import type {
  ChatBaseProps,
  AvatarConfig,
  DisplayItem,
  ToolCallMessage,
  Suggestion,
} from '../../types/chat';
import {
  internalQueryClient,
  isToolCallMessage,
  convertHistoryToDisplayItems,
  createProtocolAdapter,
  getApiBaseFromConfig,
  sanitizeAssistantContent,
} from '../../utils';
import {
  useConfig,
  useSkills,
  useSkillActions,
  useContextSnapshot,
  useSandbox,
} from '../../hooks';
import { useAgentRuntimeWebSocket } from '../../hooks/useAgentRuntimes';
import {
  agentRuntimeStore,
  useAgentRuntimeWsState,
} from '../../stores/agentRuntimeStore';
import { ChatBaseHeader } from '../header/ChatHeaderBase';
import { ChatEmptyState } from '../display/EmptyState';
import { PoweredByTag } from '../display/PoweredByTag';
import {
  ChatMessageList,
  type ToolApprovalConfig,
} from '../messages/ChatMessageList';
import { InputToolbar } from '../prompt/InputFooter';
import {
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../tools';

// Tracks pending prompts already auto-sent for a given conversation scope.
// This prevents layout-driven unmount/remount cycles from re-sending prompts.
const sentPendingPromptKeys = new Set<string>();

function isToolCallOnlyPrompt(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /tool\s*call\s*only/.test(normalized) ||
    /use\s+(?:a\s+)?tool\s+call\s+only/.test(normalized)
  );
}

function formatToolResultFallback(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (
    typeof result === 'number' ||
    typeof result === 'boolean' ||
    result === null
  ) {
    return String(result);
  }
  try {
    const serialized = JSON.stringify(result, null, 2);
    return serialized.length > 2000
      ? `${serialized.slice(0, 2000)}\n...`
      : serialized;
  } catch {
    return 'Tool completed successfully.';
  }
}

function extractChatMessagesFromFullContext(
  fullContext: Record<string, unknown> | null,
): ChatMessage[] {
  if (!fullContext) {
    return [];
  }

  const rawMessages = Array.isArray(fullContext.messages)
    ? (fullContext.messages as Array<Record<string, unknown>>)
    : [];

  return rawMessages
    .map((msg, index) => {
      const role = String(msg.role || '').toLowerCase();
      if (
        role !== 'user' &&
        role !== 'assistant' &&
        role !== 'system' &&
        role !== 'tool'
      ) {
        return null;
      }

      const timestampValue =
        typeof msg.timestamp === 'string' && msg.timestamp.length > 0
          ? msg.timestamp
          : new Date().toISOString();
      const createdAt = new Date(timestampValue);
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content ?? '');

      return {
        id: `history-${role}-${index}-${timestampValue}`,
        role,
        content,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      } as ChatMessage;
    })
    .filter((m): m is ChatMessage => m !== null);
}

function parseEnabledMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }

  const raw = (
    mcpStatusData as {
      enabled_tools_by_server?: unknown;
    }
  ).enabled_tools_by_server;

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = new Map<string, Set<string>>();
  for (const [serverId, toolNames] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(toolNames)) {
      continue;
    }
    const validToolNames = toolNames.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    parsed.set(serverId, new Set(validToolNames));
  }

  return parsed;
}

function parseApprovedMcpToolsByServer(
  mcpStatusData: unknown,
): Map<string, Set<string>> | null {
  if (!mcpStatusData || typeof mcpStatusData !== 'object') {
    return null;
  }

  const raw = (
    mcpStatusData as {
      approved_tools_by_server?: unknown;
    }
  ).approved_tools_by_server;

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = new Map<string, Set<string>>();
  for (const [serverId, toolNames] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(toolNames)) {
      continue;
    }
    const validToolNames = toolNames.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    parsed.set(serverId, new Set(validToolNames));
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// ChatBase (outer wrapper — ensures QueryClient is available)
// ---------------------------------------------------------------------------

/**
 * ChatBase component — Universal chat panel supporting store, protocol, and custom modes.
 */
export function ChatBase(props: ChatBaseProps) {
  const {
    agentRuntimeConfig,
    protocol: protocolProp,
    useStore: useStoreMode = true,
  } = props;

  // Resolve protocol: string Protocol overrides type in agentRuntimeConfig or
  // is combined with a full ProtocolConfig object.
  const protocolType =
    typeof protocolProp === 'string' ? protocolProp : undefined;
  const protocolConfigProp =
    typeof protocolProp === 'object' ? protocolProp : undefined;

  const protocol: ProtocolConfig | undefined = agentRuntimeConfig
    ? {
        type: protocolType || agentRuntimeConfig.protocol || 'vercel-ai',
        endpoint: agentRuntimeConfig.url,
        authToken: agentRuntimeConfig.authToken,
        agentId: agentRuntimeConfig.agentId,
        enableConfigQuery: true,
        configEndpoint: `${agentRuntimeConfig.url}/api/v1/config`,
      }
    : protocolConfigProp;

  // If agentRuntimeConfig is provided, force protocol mode
  const effectiveUseStoreMode = agentRuntimeConfig ? false : useStoreMode;

  // Check if QueryClientProvider is already available
  const existingQueryClient = useContext(QueryClientContext);

  const innerProps: ChatBaseProps = {
    ...props,
    // Protocol is resolved to ProtocolConfig | undefined by the outer wrapper.
    // Force the type to satisfy ChatBaseProps (which accepts the union).
    protocol: protocol as ChatBaseProps['protocol'],
    useStore: effectiveUseStoreMode,
  };

  if (!existingQueryClient) {
    return (
      <QueryClientProvider client={internalQueryClient}>
        <ChatBaseInner {...innerProps} />
      </QueryClientProvider>
    );
  }

  return <ChatBaseInner {...innerProps} />;
}

// ---------------------------------------------------------------------------
// ChatBaseInner — contains all actual logic
// ---------------------------------------------------------------------------

function ChatBaseInner({
  title,
  showHeader = false,
  showTokenUsage = true,
  showLoadingIndicator = true,
  showErrors = true,
  showInput = true,
  showModelSelector = false,
  showToolsMenu = false,
  showSkillsMenu = false,
  codemodeEnabled = false,
  initialModel,
  availableModels,
  mcpServers,
  initialSkills: _initialSkills,
  className,
  loadingState,
  headerActions,
  chatViewMode,
  onChatViewModeChange,
  // Mode selection
  useStore: useStoreMode = true,
  protocol: protocolRaw,
  onSendMessage,
  enableStreaming = false,
  // Extended props
  brandIcon,
  avatarConfig,
  headerButtons,
  showPoweredBy = false,
  poweredByProps,
  emptyState,
  renderToolResult,
  footerContent,
  showInformation = false,
  onInformationClick,
  headerContent,
  children,
  borderRadius,
  backgroundColor,
  border,
  boxShadow,
  compact = false,
  placeholder,
  description = 'Start a conversation with the AI agent.',
  onStateUpdate,
  onNewChat,
  onClear,
  onMessagesChange,
  autoFocus = false,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  focusTrigger,
  frontendTools,
  // Tool invocation hooks
  onToolCallStart,
  onToolCallComplete,
  // Identity/Authorization props
  onAuthorizationRequired: _onAuthorizationRequired,
  connectedIdentities,
  // Conversation persistence
  runtimeId,
  historyEndpoint,
  historyAuthToken: _historyAuthToken,
  // Pending prompt
  pendingPrompt,
  contextSnapshot: externalContextSnapshot,
  mcpStatusData,
  sandboxStatusData,
  // Tool approval banner
  showToolApprovalBanner = true,
  pendingApprovals,
  onApproveApproval,
  onRejectApproval,
}: ChatBaseProps) {
  useEffect(() => {
    setupPrimerPortals();
  }, []);

  // The outer ChatBase wrapper always resolves a string Protocol to a full
  // ProtocolConfig (or undefined).  Narrow the type for internal use.
  const protocol: ProtocolConfig | undefined =
    typeof protocolRaw === 'object' ? protocolRaw : undefined;

  // Stabilize the protocol reference so that the adapter-init effect only
  // re-runs when the protocol *contents* actually change.
  const protocolKey = protocol ? JSON.stringify(protocol) : '';
  const monitoringServiceName = 'agent-runtimes';

  // Store (optional for message persistence)
  const clearStoreMessages = useChatStore(state => state.clearMessages);

  // Check if protocol is A2A (doesn't support per-request model override)
  const isA2AProtocol = protocol?.type === 'a2a';

  // ---- Component state ----
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');

  // History-loaded flag — true immediately when there is nothing to fetch
  const [historyLoaded, setHistoryLoaded] = useState(!runtimeId);
  // Adapter-ready flag — flipped to true once the protocol adapter is initialised
  const [adapterReady, setAdapterReady] = useState(false);
  // Guard so the pending prompt is sent at most once
  const pendingPromptSentRef = useRef(false);
  const pendingPromptKey =
    pendingPrompt &&
    [
      runtimeId || historyEndpoint || protocol?.endpoint || protocol?.agentId,
      pendingPrompt,
    ]
      .filter(Boolean)
      .join('::');
  const [selectedModel, setSelectedModel] = useState<string>('');
  // enabledTools tracks which MCP server tools are enabled
  // Format: Map<serverId, Set<toolName>>
  const [enabledMcpTools, setEnabledMcpTools] = useState<
    Map<string, Set<string>>
  >(new Map());
  // approvedMcpTools tracks which MCP server tools are approved per server.
  // Default: all tools approved (empty map = all approved).
  const [approvedMcpTools, setApprovedMcpTools] = useState<
    Map<string, Set<string>>
  >(new Map());
  // Note: legacy _enabledTools for backend-defined tools from config query
  const [_enabledTools, setEnabledTools] = useState<string[]>([]);
  const wsState = useAgentRuntimeWsState();

  // ---- Data queries ----
  const configQuery = useConfig(
    Boolean(protocol?.enableConfigQuery),
    protocol?.configEndpoint,
    protocol?.authToken,
    protocol?.agentId,
  );
  const skillsQuery = useSkills(
    Boolean(protocol?.enableConfigQuery) && showSkillsMenu,
    protocol?.configEndpoint,
    protocol?.authToken,
  );
  const {
    enableSkill: wsEnableSkill,
    disableSkill: wsDisableSkill,
    approveSkill: wsApproveSkill,
    unapproveSkill: wsUnapproveSkill,
  } = useSkillActions();

  // Derive enabledSkills from the WS-pushed skill statuses.
  const enabledSkills = useMemo(() => {
    const set = new Set<string>();
    for (const s of skillsQuery.data?.skills ?? []) {
      if (s.status === 'enabled' || s.status === 'loaded') {
        set.add(s.id);
      }
    }
    return set;
  }, [skillsQuery.data]);

  // Derive approvedSkills from the WS-pushed skill statuses (default: approved).
  const approvedSkills = useMemo(() => {
    const set = new Set<string>();
    for (const s of skillsQuery.data?.skills ?? []) {
      if (s.approved !== false) {
        set.add(s.id);
      }
    }
    return set;
  }, [skillsQuery.data]);
  const contextSnapshotQuery = useContextSnapshot(
    Boolean(protocol?.enableConfigQuery) && showTokenUsage,
    protocol?.configEndpoint,
    protocol?.agentId,
    protocol?.authToken,
  );
  const agentUsage = externalContextSnapshot ?? contextSnapshotQuery.data;
  const sandboxStatusQuery = useSandbox(
    Boolean(protocol?.enableConfigQuery) && codemodeEnabled && showHeader,
    protocol?.configEndpoint,
    protocol?.authToken,
  );
  const sandboxStatus = sandboxStatusQuery.data;

  // ---- Agent-runtime WebSocket (monitoring stream) ----
  // Derive the bare base URL from configEndpoint or protocol.endpoint.
  const wsBaseUrl = protocol?.configEndpoint
    ? protocol.configEndpoint.replace(/\/api\/v1\/(config|configure)\/?$/, '')
    : (protocol?.endpoint?.replace(/\/api\/v1\/.*$/, '') ?? '');
  useAgentRuntimeWebSocket({
    enabled: !!protocol && !!wsBaseUrl,
    baseUrl: wsBaseUrl,
    authToken: protocol?.authToken,
    agentId: protocol?.agentId,
  });

  // ---- Refs ----
  const adapterRef = useRef<BaseProtocolAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const toolCallsRef = useRef<Map<string, ToolCallMessage>>(new Map());
  const pendingToolExecutionsRef = useRef(0);
  const currentAssistantMessageRef = useRef<ChatMessage | null>(null);
  const suppressAssistantTextForToolOnlyRef = useRef(false);
  const hideMessagesAfterToolUIRef = useRef(hideMessagesAfterToolUI);
  hideMessagesAfterToolUIRef.current = hideMessagesAfterToolUI;
  const threadIdRef = useRef<string>(generateMessageId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Set to true by handleStop so in-flight / about-to-run tool executions
   *  can bail out early.  Reset to false at the start of each handleSend. */
  const stoppedRef = useRef(false);
  const connectedIdentitiesRef = useRef(connectedIdentities);
  connectedIdentitiesRef.current = connectedIdentities;
  // Keep a ref to frontendTools so the event listener closure (which is NOT
  // re-created when frontendTools changes) always accesses the latest value.
  const frontendToolsRef = useRef(frontendTools);
  frontendToolsRef.current = frontendTools;
  // Stable refs for tool invocation hooks (pre/post)
  const onToolCallStartRef = useRef(onToolCallStart);
  onToolCallStartRef.current = onToolCallStart;
  const onToolCallCompleteRef = useRef(onToolCallComplete);
  onToolCallCompleteRef.current = onToolCallComplete;

  // ---- Helpers ----
  const isServerSelected = useCallback(
    (server: { id: string; isConfig?: boolean }) => {
      if (!mcpServers) return true;
      const origin = server.isConfig === false ? 'catalog' : 'config';
      return mcpServers.some(s => s.id === server.id && s.origin === origin);
    },
    [mcpServers],
  );

  // ---- Focus management ----
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (focusTrigger !== undefined && focusTrigger > 0 && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timeoutId);
    }
  }, [focusTrigger]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && inputRef.current) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timeoutId);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // ---- Auto-resize textarea ----
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 120;
      const minHeight = 40;
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        maxHeight,
      );
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  useEffect(() => {
    const timer = setTimeout(adjustTextareaHeight, 0);
    return () => clearTimeout(timer);
  }, [adjustTextareaHeight]);

  // ---- Initialize model and tools when config is available ----
  useEffect(() => {
    if ((configQuery.data || availableModels) && !selectedModel) {
      const modelsList = availableModels || configQuery.data?.models || [];
      const preferredModel = initialModel || configQuery.data?.defaultModel;
      if (preferredModel) {
        const modelExists = modelsList.some(m => m.id === preferredModel);
        if (modelExists) {
          setSelectedModel(preferredModel);
        } else {
          const firstAvailableModel = modelsList.find(
            m => m.isAvailable !== false,
          );
          const firstModel = firstAvailableModel || modelsList[0];
          if (firstModel) setSelectedModel(firstModel.id);
        }
      } else {
        const firstAvailableModel = modelsList.find(
          m => m.isAvailable !== false,
        );
        const firstModel = firstAvailableModel || modelsList[0];
        if (firstModel) setSelectedModel(firstModel.id);
      }

      const allToolIds =
        configQuery.data?.builtinTools?.map(tool => tool.id) || [];
      setEnabledTools(allToolIds);

      if (configQuery.data?.mcpServers) {
        const newEnabledMcpTools = new Map<string, Set<string>>();
        for (const server of configQuery.data.mcpServers) {
          if (server.isAvailable && server.enabled) {
            const shouldEnableServer = isServerSelected(server);
            if (shouldEnableServer) {
              const enabledToolNames = new Set<string>(
                server.tools.filter(t => t.enabled).map(t => t.name),
              );
              newEnabledMcpTools.set(server.id, enabledToolNames);
            }
          }
        }
        setEnabledMcpTools(newEnabledMcpTools);
      }
    }
  }, [
    configQuery.data,
    selectedModel,
    initialModel,
    availableModels,
    mcpServers,
    isServerSelected,
  ]);

  // Update enabled MCP servers when mcpServers prop changes
  useEffect(() => {
    if (!configQuery.data?.mcpServers || !mcpServers) return;
    setEnabledMcpTools(prev => {
      const newMap = new Map<string, Set<string>>();
      for (const server of configQuery.data?.mcpServers ?? []) {
        if (isServerSelected(server) && prev.has(server.id)) {
          const existing = prev.get(server.id);
          if (existing) newMap.set(server.id, existing);
        } else if (
          isServerSelected(server) &&
          server.isAvailable &&
          server.enabled
        ) {
          const enabledToolNames = new Set<string>(
            server.tools.filter(t => t.enabled).map(t => t.name),
          );
          newMap.set(server.id, enabledToolNames);
        }
      }
      return newMap;
    });
  }, [mcpServers, configQuery.data?.mcpServers, isServerSelected]);

  // Keep MCP tool selection synchronized with backend WS snapshots.
  // Intentionally exclude `mcpServers` from the dependency array: the effect
  // should only re-run when the backend snapshot (`mcpStatusData`) changes, not
  // when the `mcpServers` prop reference changes (e.g. due to parent re-renders).
  // We read the latest `mcpServers` through a ref so the filter logic is always
  // current without causing the effect to fire.
  const mcpServersRef = useRef(mcpServers);
  mcpServersRef.current = mcpServers;
  useEffect(() => {
    const wsEnabledMcpTools = parseEnabledMcpToolsByServer(mcpStatusData);
    if (!wsEnabledMcpTools) {
      return;
    }

    setEnabledMcpTools(() => {
      const next = new Map<string, Set<string>>();
      wsEnabledMcpTools.forEach((toolNames, serverId) => {
        const selectedInProps =
          !mcpServersRef.current ||
          mcpServersRef.current.some(server => server.id === serverId);
        if (selectedInProps) {
          next.set(serverId, new Set(toolNames));
        }
      });
      return next;
    });
  }, [mcpStatusData]);

  // Keep MCP tool *approval* synchronized with backend WS snapshots.
  useEffect(() => {
    const wsApprovedMcpTools = parseApprovedMcpToolsByServer(mcpStatusData);
    if (!wsApprovedMcpTools) {
      return;
    }
    setApprovedMcpTools(() => {
      const next = new Map<string, Set<string>>();
      wsApprovedMcpTools.forEach((toolNames, serverId) => {
        const selectedInProps =
          !mcpServersRef.current ||
          mcpServersRef.current.some(server => server.id === serverId);
        if (selectedInProps) {
          next.set(serverId, new Set(toolNames));
        }
      });
      return next;
    });
  }, [mcpStatusData]);

  // Refetch configQuery when WS reports MCP servers as started but the
  // cached config response has missing servers or empty tools.
  const lastConfigMcpKeyRef = useRef('');
  useEffect(() => {
    const wsServers = mcpStatusData?.servers;
    if (!wsServers || wsServers.length === 0) return;
    const startedIds = wsServers
      .filter(s => s.status === 'started')
      .map(s => s.id)
      .sort();
    if (startedIds.length === 0) return;

    const configServers = configQuery.data?.mcpServers || [];
    const needsRefetch = startedIds.some(id => {
      const cs = configServers.find(s => s.id === id);
      return !cs || cs.tools.length === 0;
    });

    // Only refetch once per unique set of started server IDs
    const key = startedIds.join(',');
    if (
      needsRefetch &&
      key !== lastConfigMcpKeyRef.current &&
      configQuery.refetch
    ) {
      lastConfigMcpKeyRef.current = key;
      configQuery.refetch();
    }
  }, [mcpStatusData, configQuery]);

  // initialSkills are now handled server-side during agent creation.

  // ---- Toggle helpers ----
  const toggleMcpTool = useCallback((serverId: string, toolName: string) => {
    setEnabledMcpTools(prev => {
      const newMap = new Map(prev);
      const serverTools = new Set(prev.get(serverId) || []);
      if (serverTools.has(toolName)) {
        serverTools.delete(toolName);
      } else {
        serverTools.add(toolName);
      }
      newMap.set(serverId, serverTools);

      const ok = agentRuntimeStore.getState().sendRawMessage({
        type: 'mcp_server_tools_set',
        serverId,
        enabledToolNames: Array.from(serverTools),
      });
      if (!ok) {
        console.warn(
          '[ChatBase] mcp_server_tools_set dropped: websocket not ready',
        );
      }

      return newMap;
    });
  }, []);

  const toggleAllMcpServerTools = useCallback(
    (serverId: string, allToolNames: string[], enable: boolean) => {
      setEnabledMcpTools(prev => {
        const newMap = new Map(prev);
        const nextTools = enable ? new Set(allToolNames) : new Set<string>();
        if (enable) {
          newMap.set(serverId, nextTools);
        } else {
          newMap.set(serverId, nextTools);
        }

        const ok = agentRuntimeStore.getState().sendRawMessage({
          type: 'mcp_server_tools_set',
          serverId,
          enabledToolNames: Array.from(nextTools),
        });
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tools_set dropped: websocket not ready',
          );
        }

        return newMap;
      });
    },
    [],
  );

  const toggleSkill = useCallback(
    (skillId: string) => {
      if (enabledSkills.has(skillId)) {
        wsDisableSkill(skillId);
      } else {
        wsEnableSkill(skillId);
      }
    },
    [enabledSkills, wsEnableSkill, wsDisableSkill],
  );

  const toggleAllSkills = useCallback(
    (allSkillIds: string[], enable: boolean) => {
      for (const id of allSkillIds) {
        if (enable) {
          wsEnableSkill(id);
        } else {
          wsDisableSkill(id);
        }
      }
    },
    [wsEnableSkill, wsDisableSkill],
  );

  const toggleMcpToolApproval = useCallback(
    (serverId: string, toolName: string) => {
      setApprovedMcpTools(prev => {
        const newMap = new Map(prev);
        // Default: if no entry for this server, all tools are approved.
        const serverTools = new Set(prev.get(serverId) ?? []);
        const currentlyApproved = serverTools.has(toolName);
        if (currentlyApproved) {
          serverTools.delete(toolName);
        } else {
          serverTools.add(toolName);
        }
        newMap.set(serverId, serverTools);

        const ok = agentRuntimeStore.getState().sendRawMessage({
          type: 'mcp_server_tool_approve',
          serverId,
          toolName,
          approved: !currentlyApproved,
        });
        if (!ok) {
          console.warn(
            '[ChatBase] mcp_server_tool_approve dropped: websocket not ready',
          );
        }

        return newMap;
      });
    },
    [],
  );

  const toggleSkillApproval = useCallback(
    (skillId: string) => {
      if (approvedSkills.has(skillId)) {
        wsUnapproveSkill(skillId);
      } else {
        wsApproveSkill(skillId);
      }
    },
    [approvedSkills, wsApproveSkill, wsUnapproveSkill],
  );

  const getEnabledMcpToolNames = useCallback((): string[] => {
    const toolNames: string[] = [];
    enabledMcpTools.forEach((tools, serverId) => {
      if (!mcpServers || mcpServers.some(s => s.id === serverId)) {
        tools.forEach(toolName => toolNames.push(toolName));
      }
    });
    return toolNames;
  }, [enabledMcpTools, mcpServers]);

  const getEnabledSkillIds = useCallback((): string[] => {
    return Array.from(enabledSkills);
  }, [enabledSkills]);

  // ---- Load messages from store on mount ----
  useEffect(() => {
    if (useStoreMode) {
      const storeMessages = useChatStore.getState().messages;
      if (storeMessages.length > 0) {
        setDisplayItems(storeMessages);
      }
    }
  }, [useStoreMode]);

  // ---- Conversation history loading ----
  const prevRuntimeIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (runtimeId !== prevRuntimeIdRef.current) {
      prevRuntimeIdRef.current = runtimeId;
      setDisplayItems([]);
      toolCallsRef.current.clear();
      if (!runtimeId) return;
    }

    if (!runtimeId) return;

    const store = useConversationStore.getState();
    const currentlyFetching = store.isFetching(runtimeId);

    if (!store.needsFetch(runtimeId)) {
      if (currentlyFetching) {
        return;
      }
      const storedMessages = store.getMessages(runtimeId);
      if (storedMessages.length > 0) {
        setDisplayItems(storedMessages);
      }
      setHistoryLoaded(true);
      return;
    }

    store.setFetching(runtimeId, true);

    const fullContextToMessages = () =>
      extractChatMessagesFromFullContext(
        agentRuntimeStore.getState().fullContext as Record<
          string,
          unknown
        > | null,
      );

    const applyMessages = (messages: ChatMessage[]) => {
      if (messages.length > 0) {
        store.setMessages(runtimeId, messages);
        setDisplayItems(convertHistoryToDisplayItems(messages));
      }
      store.markFetched(runtimeId);
      setHistoryLoaded(true);
    };

    const existingMessages = fullContextToMessages();
    if (existingMessages.length > 0) {
      applyMessages(existingMessages);
      return;
    }

    // Ask the monitoring websocket for a fresh snapshot and wait briefly
    // for `fullContext.messages` to arrive.
    const refreshRequested = agentRuntimeStore.getState().requestRefresh();
    if (!refreshRequested) {
      // Socket not ready yet; allow a later retry (e.g. when wsState changes).
      store.setFetching(runtimeId, false);
      setHistoryLoaded(true);
      return;
    }

    let resolved = false;
    const unsubscribe = agentRuntimeStore.subscribe(
      state => state.fullContext,
      nextFullContext => {
        if (resolved || !nextFullContext) {
          return;
        }
        resolved = true;
        unsubscribe();
        const messages = extractChatMessagesFromFullContext(
          nextFullContext as Record<string, unknown>,
        );
        applyMessages(messages);
      },
    );

    const timeout = window.setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      unsubscribe();
      // Do not mark as fetched on timeout; keep it retryable for late WS snapshots.
      store.setFetching(runtimeId, false);
      setHistoryLoaded(true);
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [runtimeId, historyEndpoint, protocol?.agentId, wsState]);

  // Keep in-memory store in sync with displayItems
  useEffect(() => {
    if (runtimeId && displayItems.length > 0) {
      const messagesToSave = displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      );
      if (messagesToSave.length > 0) {
        useConversationStore.getState().setMessages(runtimeId, messagesToSave);
      }
    }
  }, [runtimeId, displayItems]);

  // ---- Derived state ----
  const messages = displayItems.filter(
    (item): item is ChatMessage => !isToolCallMessage(item),
  );
  const ready = true;

  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount !== prevMessageCountRef.current) {
      prevMessageCountRef.current = currentCount;
      onMessagesChange?.(messages);
    }
  }, [displayItems, messages, onMessagesChange]);

  const padding = compact ? 2 : 3;

  // Derive approval config from protocol for built-in tool approval support
  const approvalConfig = useMemo((): ToolApprovalConfig | undefined => {
    if (!protocol?.configEndpoint) return undefined;
    return {
      apiBaseUrl: getApiBaseFromConfig(protocol.configEndpoint),
      authToken: protocol.authToken,
    };
  }, [protocol?.configEndpoint, protocol?.authToken]);

  const defaultAvatarConfig: Required<
    Pick<
      AvatarConfig,
      | 'userAvatar'
      | 'assistantAvatar'
      | 'showAvatars'
      | 'avatarSize'
      | 'userAvatarBg'
      | 'assistantAvatarBg'
    >
  > = {
    userAvatar: <PersonIcon size={16} />,
    assistantAvatar: <AiAgentIcon size={16} />,
    showAvatars: true,
    avatarSize: 32,
    userAvatarBg: 'neutral.muted',
    assistantAvatarBg: 'accent.emphasis',
    ...avatarConfig,
  };

  // ========================================================================
  // Protocol adapter subscription
  // ========================================================================
  useEffect(() => {
    if (!protocol) return;

    const adapter = createProtocolAdapter(protocol);
    if (!adapter) return;

    adapterRef.current = adapter;
    setAdapterReady(true);

    unsubscribeRef.current = adapter.subscribe((event: ProtocolEvent) => {
      switch (event.type) {
        case 'message':
          if (event.usage) {
            const timestampMs =
              event.timestamp instanceof Date
                ? event.timestamp.getTime()
                : Date.now();
            const promptTokens = Math.max(0, event.usage.promptTokens ?? 0);
            const completionTokens = Math.max(
              0,
              event.usage.completionTokens ?? 0,
            );
            const totalTokens = Math.max(
              promptTokens + completionTokens,
              event.usage.totalTokens ?? 0,
            );

            const runtimeState = agentRuntimeStore.getState();
            runtimeState.appendLocalTokenTurn({
              serviceName: monitoringServiceName,
              agentId: protocol?.agentId,
              timestampMs,
              promptTokens,
              completionTokens,
              totalTokens,
            });

            const liveCumulativeUsd = runtimeState.costUsage?.cumulativeCostUsd;
            if (
              typeof liveCumulativeUsd === 'number' &&
              Number.isFinite(liveCumulativeUsd)
            ) {
              runtimeState.upsertLocalCostPoint({
                serviceName: monitoringServiceName,
                agentId: protocol?.agentId,
                timestampMs,
                cumulativeUsd: Math.max(0, liveCumulativeUsd),
              });
            }
          }

          if (suppressAssistantTextForToolOnlyRef.current) {
            const suppressedMessageId = currentAssistantMessageRef.current?.id;
            if (suppressedMessageId) {
              setDisplayItems(prev =>
                prev.filter(
                  item =>
                    isToolCallMessage(item) || item.id !== suppressedMessageId,
                ),
              );
              if (useStoreMode) {
                useChatStore.getState().deleteMessage(suppressedMessageId);
              }
              currentAssistantMessageRef.current = null;
            }
            break;
          }

          if (event.message) {
            const incomingId = event.message.id;
            const currentId = currentAssistantMessageRef.current?.id;
            const isNewMessage =
              !currentId || (incomingId && incomingId !== currentId);

            if (currentAssistantMessageRef.current && !isNewMessage) {
              setDisplayItems(prev => {
                const newItems = [...prev];
                const idx = newItems.findIndex(
                  item =>
                    !isToolCallMessage(item) &&
                    item.id === currentAssistantMessageRef.current?.id,
                );
                if (idx >= 0 && !isToolCallMessage(newItems[idx])) {
                  const rawContent = event.message?.content;
                  const sanitizedContent =
                    typeof rawContent === 'string'
                      ? sanitizeAssistantContent(rawContent)
                      : (rawContent ?? '');
                  newItems[idx] = {
                    ...(newItems[idx] as ChatMessage),
                    content: sanitizedContent,
                  };
                }
                return newItems;
              });
              if (useStoreMode && currentAssistantMessageRef.current) {
                const rawContent = event.message?.content;
                const sanitizedContent =
                  typeof rawContent === 'string'
                    ? sanitizeAssistantContent(rawContent)
                    : (rawContent ?? '');
                useChatStore
                  .getState()
                  .updateMessage(currentAssistantMessageRef.current.id, {
                    content: sanitizedContent,
                  });
              }
            } else {
              const content = event.message.content;
              const contentStr =
                typeof content === 'string' ? content : (content ?? '');
              const sanitizedContent =
                typeof contentStr === 'string'
                  ? sanitizeAssistantContent(contentStr)
                  : '';
              const newMessage = createAssistantMessage(sanitizedContent);
              newMessage.id = event.message.id || newMessage.id;
              currentAssistantMessageRef.current = newMessage;
              setDisplayItems(prev => {
                const existingIdx = prev.findIndex(
                  item => !isToolCallMessage(item) && item.id === newMessage.id,
                );
                if (existingIdx >= 0) {
                  const newItems = [...prev];
                  newItems[existingIdx] = {
                    ...(newItems[existingIdx] as ChatMessage),
                    content: sanitizedContent,
                  };
                  return newItems;
                }
                return [...prev, newMessage];
              });
              if (useStoreMode) {
                const existingInStore = useChatStore
                  .getState()
                  .messages.find(m => m.id === newMessage.id);
                if (existingInStore) {
                  useChatStore.getState().updateMessage(newMessage.id, {
                    content: sanitizedContent,
                  });
                } else {
                  useChatStore.getState().addMessage(newMessage);
                }
              }
            }
          }
          break;

        case 'tool-call':
          if (event.toolCall && !stoppedRef.current) {
            const toolCallId = event.toolCall.toolCallId || generateMessageId();
            const toolName = event.toolCall.toolName;
            const args = event.toolCall.args || {};

            if (toolCallsRef.current.has(toolCallId)) {
              const existingToolCall = toolCallsRef.current.get(toolCallId);
              if (existingToolCall) {
                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  args: { ...existingToolCall.args, ...args },
                };
                toolCallsRef.current.set(toolCallId, updatedToolCall);
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) && item.toolCallId === toolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );

                const frontendTool = frontendToolsRef.current?.find(
                  t => t.name === toolName,
                );
                const toolHandler = frontendTool?.handler;
                if (
                  toolHandler &&
                  existingToolCall.status === 'executing' &&
                  Object.keys(args).length > 0
                ) {
                  pendingToolExecutionsRef.current++;
                  executeFrontendTool(toolHandler, updatedToolCall, toolCallId);
                }
              }
            } else {
              const toolCallMsg: ToolCallMessage = {
                id: `tool-${toolCallId}`,
                type: 'tool-call',
                toolCallId,
                toolName,
                args,
                status: 'executing',
              };
              toolCallsRef.current.set(toolCallId, toolCallMsg);
              setDisplayItems(prev => [...prev, toolCallMsg]);

              // Fire pre-hook for new tool calls
              onToolCallStartRef.current?.({
                toolName,
                toolCallId,
                args,
              });

              const frontendTool = frontendToolsRef.current?.find(
                t => t.name === toolName,
              );
              const toolHandler = frontendTool?.handler;
              // Only execute when we have actual args. AG-UI emits an
              // initial tool-call with empty args on TOOL_CALL_START;
              // the real args arrive on TOOL_CALL_END. Skip execution
              // here and let the update branch (above) handle it once
              // the full args are available.
              if (toolHandler && Object.keys(args).length > 0) {
                pendingToolExecutionsRef.current++;
                executeFrontendTool(toolHandler, toolCallMsg, toolCallId);
              }
            }
          }
          break;

        case 'tool-result':
          if (event.toolResult) {
            const toolCallId = event.toolResult.toolCallId;
            if (toolCallId && toolCallsRef.current.has(toolCallId)) {
              const existingToolCall = toolCallsRef.current.get(toolCallId);
              if (existingToolCall) {
                const isHumanInTheLoop =
                  existingToolCall.args &&
                  'steps' in existingToolCall.args &&
                  Array.isArray(existingToolCall.args.steps);

                const resultData = event.toolResult.result as
                  | Record<string, unknown>
                  | undefined;
                let executionError: string | undefined;
                let codeError: ToolCallMessage['codeError'] | undefined;
                let exitCode: number | null | undefined;
                let isPendingApproval = false;
                let hasError = !!event.toolResult.error;

                if (resultData && typeof resultData === 'object') {
                  if (
                    'pending_approval' in resultData &&
                    resultData.pending_approval === true
                  ) {
                    isPendingApproval = true;
                  }
                  if (
                    resultData.execution_error &&
                    typeof resultData.execution_error === 'string'
                  ) {
                    executionError = resultData.execution_error;
                    hasError = true;
                  }
                  if (
                    resultData.code_error &&
                    typeof resultData.code_error === 'object'
                  ) {
                    const ce = resultData.code_error as Record<string, unknown>;
                    codeError = {
                      name: (ce.name as string) || 'Error',
                      value: (ce.value as string) || 'Unknown error',
                      traceback: ce.traceback as string | undefined,
                    };
                    hasError = true;
                  }
                  if ('exit_code' in resultData) {
                    const ec = resultData.exit_code;
                    exitCode = typeof ec === 'number' ? ec : null;
                    if (exitCode != null && exitCode !== 0) hasError = true;
                  }
                  if (
                    'execution_ok' in resultData &&
                    resultData.execution_ok === false
                  ) {
                    hasError = true;
                  }
                }

                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  result: event.toolResult.result,
                  status: hasError
                    ? 'error'
                    : isPendingApproval
                      ? 'inProgress'
                      : isHumanInTheLoop
                        ? 'executing'
                        : 'complete',
                  error: event.toolResult.error,
                  executionError,
                  codeError,
                  exitCode,
                };
                toolCallsRef.current.set(toolCallId, updatedToolCall);
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) && item.toolCallId === toolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );

                // Fire post-hook for tool results
                onToolCallCompleteRef.current?.({
                  toolName: existingToolCall.toolName,
                  toolCallId,
                  args: existingToolCall.args,
                  result: event.toolResult.result,
                  status: updatedToolCall.status,
                  error: event.toolResult.error,
                });
              }
            }
          }
          break;

        case 'state-update':
          onStateUpdate?.(event.data);
          if (event.data) {
            const executingToolCalls = Array.from(
              toolCallsRef.current.entries(),
            ).filter(([_, tc]) => tc.status === 'executing');

            if (executingToolCalls.length > 0) {
              const [lastToolCallId, existingToolCall] =
                executingToolCalls[executingToolCalls.length - 1];

              const isHumanInTheLoop =
                existingToolCall.args &&
                'steps' in existingToolCall.args &&
                Array.isArray(existingToolCall.args.steps);

              if (!isHumanInTheLoop) {
                const stateData = event.data as Record<string, unknown>;
                const result =
                  stateData.weather ??
                  stateData.result ??
                  stateData.toolResult ??
                  stateData;

                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  result,
                  status: 'complete',
                };
                toolCallsRef.current.set(lastToolCallId, updatedToolCall);
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) &&
                    item.toolCallId === lastToolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );
              }
            }
          }
          break;

        case 'done':
          // The adapter signals the entire multi-turn conversation
          // (including all continuations) has finished.
          if (
            suppressAssistantTextForToolOnlyRef.current &&
            hideMessagesAfterToolUIRef.current
          ) {
            setDisplayItems(prev => {
              const hasAssistantContent = prev.some(
                item =>
                  !isToolCallMessage(item) &&
                  item.role === 'assistant' &&
                  String(item.content || '').trim().length > 0,
              );

              if (hasAssistantContent) {
                return prev;
              }

              const latestCompletedTool = [...prev]
                .reverse()
                .find(
                  item =>
                    isToolCallMessage(item) &&
                    item.status === 'complete' &&
                    item.result !== undefined,
                );

              if (
                !latestCompletedTool ||
                !isToolCallMessage(latestCompletedTool)
              ) {
                return prev;
              }

              const fallbackMessage = createAssistantMessage(
                formatToolResultFallback(latestCompletedTool.result),
              );

              if (useStoreMode) {
                useChatStore.getState().addMessage(fallbackMessage);
              }

              return [...prev, fallbackMessage];
            });
          }
          suppressAssistantTextForToolOnlyRef.current = false;
          pendingToolExecutionsRef.current = 0;
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh();
          break;

        case 'error':
          console.error('[ChatBase] Protocol error:', event.error);
          if (
            event.error?.message &&
            /exceeded maximum retries/i.test(event.error.message) &&
            hideMessagesAfterToolUIRef.current
          ) {
            setDisplayItems(prev => {
              const hasAssistantContent = prev.some(
                item =>
                  !isToolCallMessage(item) &&
                  item.role === 'assistant' &&
                  String(item.content || '').trim().length > 0,
              );

              if (hasAssistantContent) {
                return prev;
              }

              const latestCompletedTool = [...prev]
                .reverse()
                .find(
                  item =>
                    isToolCallMessage(item) &&
                    item.status === 'complete' &&
                    item.result !== undefined,
                );

              if (
                !latestCompletedTool ||
                !isToolCallMessage(latestCompletedTool)
              ) {
                return prev;
              }

              const fallbackMessage = createAssistantMessage(
                formatToolResultFallback(latestCompletedTool.result),
              );

              if (useStoreMode) {
                useChatStore.getState().addMessage(fallbackMessage);
              }

              return [...prev, fallbackMessage];
            });
          }
          suppressAssistantTextForToolOnlyRef.current = false;
          setError(event.error || new Error('Unknown error'));
          pendingToolExecutionsRef.current = 0;
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh();
          break;
      }
    });

    adapter.connect().catch(console.error);

    return () => {
      unsubscribeRef.current?.();
      adapterRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolKey, onStateUpdate, useStoreMode]);

  // Helper to run a frontend tool and send result back via adapter
  function executeFrontendTool(
    toolHandler: (args: Record<string, unknown>) => Promise<unknown>,
    toolCallMsg: ToolCallMessage,
    toolCallId: string,
  ) {
    (async () => {
      // If the user clicked Stop, skip executing this tool entirely.
      if (stoppedRef.current) {
        pendingToolExecutionsRef.current--;
        if (pendingToolExecutionsRef.current < 0) {
          pendingToolExecutionsRef.current = 0;
        }
        return;
      }
      try {
        const result = await toolHandler(toolCallMsg.args);
        if (adapterRef.current) {
          await adapterRef.current.sendToolResult(toolCallId, {
            toolCallId,
            success: true,
            result,
          });
        }
        const completedToolCall: ToolCallMessage = {
          ...toolCallMsg,
          result,
          status: 'complete',
        };
        toolCallsRef.current.set(toolCallId, completedToolCall);
        setDisplayItems(prev =>
          prev.map(item =>
            isToolCallMessage(item) && item.toolCallId === toolCallId
              ? completedToolCall
              : item,
          ),
        );
      } catch (err) {
        console.error('[ChatBase] Frontend tool execution error:', err);
        const errorToolCall: ToolCallMessage = {
          ...toolCallMsg,
          status: 'error',
          error: (err as Error).message,
        };
        toolCallsRef.current.set(toolCallId, errorToolCall);
        setDisplayItems(prev =>
          prev.map(item =>
            isToolCallMessage(item) && item.toolCallId === toolCallId
              ? errorToolCall
              : item,
          ),
        );
      } finally {
        pendingToolExecutionsRef.current--;
        if (pendingToolExecutionsRef.current < 0) {
          pendingToolExecutionsRef.current = 0;
        }
        // NOTE: Do NOT reset isLoading here.  The adapter's 'done' event
        // is the sole authority for ending the loading state — it fires
        // only when RUN_FINISHED arrives with no pending tool calls,
        // meaning the entire multi-turn conversation is truly complete.
      }
    })();
  }

  // ---- Auto-scroll to bottom ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayItems]);

  // ========================================================================
  // handleSend
  // ========================================================================
  const handleSend = useCallback(
    async (messageOverride?: string) => {
      const messageContent = (messageOverride ?? input).trim();
      if (!messageContent || isLoading) return;
      if (!adapterRef.current && !onSendMessage) return;
      stoppedRef.current = false;
      suppressAssistantTextForToolOnlyRef.current =
        isToolCallOnlyPrompt(messageContent);

      const userMessage = createUserMessage(messageContent);
      const currentMessages = displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      );
      const allMessages = [...currentMessages, userMessage];

      setDisplayItems(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);
      setIsStreaming(true);
      setError(null);
      currentAssistantMessageRef.current = null;

      if (useStoreMode) {
        useChatStore.getState().addMessage(userMessage);
      }

      try {
        if (onSendMessage) {
          if (enableStreaming) {
            const assistantMessageId = generateMessageId();
            const assistantMessage = createAssistantMessage('');
            assistantMessage.id = assistantMessageId;
            setDisplayItems(prev => [...prev, assistantMessage]);
            currentAssistantMessageRef.current = assistantMessage;

            if (useStoreMode) {
              useChatStore.getState().addMessage(assistantMessage);
              useChatStore.getState().startStreaming(assistantMessageId);
            }

            abortControllerRef.current = new AbortController();

            await onSendMessage(messageContent, allMessages, {
              onChunk: (chunk: string) => {
                setDisplayItems(prev =>
                  prev.map(item =>
                    item.id === assistantMessageId
                      ? {
                          ...item,
                          content: (item as ChatMessage).content + chunk,
                        }
                      : item,
                  ),
                );
                if (useStoreMode) {
                  useChatStore
                    .getState()
                    .appendToStream(assistantMessageId, chunk);
                }
              },
              onComplete: (fullResponse: string) => {
                setDisplayItems(prev =>
                  prev.map(item =>
                    item.id === assistantMessageId
                      ? { ...item, content: fullResponse }
                      : item,
                  ),
                );
                if (useStoreMode) {
                  useChatStore.getState().updateMessage(assistantMessageId, {
                    content: fullResponse,
                  });
                  useChatStore.getState().stopStreaming();
                }
              },
              onError: (error: Error) => {
                const errorContent = `Error: ${error.message}`;
                setDisplayItems(prev =>
                  prev.map(item =>
                    item.id === assistantMessageId
                      ? { ...item, content: errorContent }
                      : item,
                  ),
                );
                if (useStoreMode) {
                  useChatStore.getState().updateMessage(assistantMessageId, {
                    content: errorContent,
                  });
                  useChatStore.getState().stopStreaming();
                }
                setError(error);
              },
              signal: abortControllerRef.current.signal,
            });
          } else {
            const response = await onSendMessage(messageContent, allMessages);
            if (response) {
              const assistantMessage = createAssistantMessage(response);
              setDisplayItems(prev => [...prev, assistantMessage]);
              if (useStoreMode) {
                useChatStore.getState().addMessage(assistantMessage);
              }
            }
          }
        } else if (adapterRef.current) {
          const toolsForRequest = (frontendTools || []).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'object', properties: {} },
          }));

          console.warn(
            '[ChatBase] frontendTools count:',
            frontendTools?.length ?? 0,
            'toolsForRequest:',
            toolsForRequest.map(t => t.name),
          );
          const enabledMcpToolNames = getEnabledMcpToolNames();
          const enabledSkillIds = getEnabledSkillIds();

          await adapterRef.current.sendMessage(userMessage, {
            threadId: threadIdRef.current,
            messages: allMessages,
            ...(selectedModel && { model: selectedModel }),
            tools: toolsForRequest,
            builtinTools: enabledMcpToolNames,
            skills: enabledSkillIds,
            identities: connectedIdentitiesRef.current,
          } as Parameters<typeof adapterRef.current.sendMessage>[1]);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[ChatBase] Send error:', err);
          const errorMessage = createAssistantMessage(
            `Error: ${(err as Error).message}`,
          );
          setDisplayItems(prev => [...prev, errorMessage]);
          setError(err as Error);
        }
      } finally {
        // NOTE: Do NOT reset isLoading here.  The adapter's 'done' event
        // handles this — it fires only after the entire multi-turn
        // conversation (including all tool-call continuations) completes.
        // For the non-adapter path (onSendMessage), 'done' is never
        // emitted so we reset when no adapter is present.
        if (!adapterRef.current) {
          setIsLoading(false);
          setIsStreaming(false);
          agentRuntimeStore.getState().requestRefresh();
        }
        suppressAssistantTextForToolOnlyRef.current = false;
        currentAssistantMessageRef.current = null;
        abortControllerRef.current = null;
      }
    },
    [
      input,
      isLoading,
      displayItems,
      selectedModel,
      frontendTools,
      useStoreMode,
      onSendMessage,
      enableStreaming,
      getEnabledMcpToolNames,
      getEnabledSkillIds,
    ],
  );

  // Send pending prompt once history loaded and adapter/handler available
  useEffect(() => {
    if (!pendingPrompt || pendingPromptSentRef.current) return;
    if (pendingPromptKey && sentPendingPromptKeys.has(pendingPromptKey)) {
      pendingPromptSentRef.current = true;
      return;
    }
    if (!historyLoaded) return;
    if (!adapterReady && !onSendMessage) return;
    pendingPromptSentRef.current = true;
    if (pendingPromptKey) {
      sentPendingPromptKeys.add(pendingPromptKey);
    }
    queueMicrotask(() => handleSend(pendingPrompt));
  }, [
    pendingPrompt,
    pendingPromptKey,
    historyLoaded,
    adapterReady,
    handleSend,
    onSendMessage,
  ]);

  // ---- handleStop ----
  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    abortControllerRef.current?.abort();

    // Best-effort cancellation without tearing down adapter/session.
    const adapter = adapterRef.current as {
      terminateSession?: () => Promise<void>;
      terminateAgent?: () => Promise<void>;
      terminateTask?: () => Promise<void>;
      terminateRequest?: () => Promise<void>;
      stopGeneration?: () => void;
    } | null;
    if (adapter) {
      // Abort the client-side SSE / fetch stream (if the adapter exposes it).
      if (typeof adapter.stopGeneration === 'function') {
        adapter.stopGeneration();
      }
      // Also tell the backend to stop (server-side cancellation).
      if (typeof adapter.terminateSession === 'function') {
        void adapter.terminateSession().catch(() => {});
      } else if (typeof adapter.terminateAgent === 'function') {
        void adapter.terminateAgent().catch(() => {});
      } else if (typeof adapter.terminateTask === 'function') {
        void adapter.terminateTask().catch(() => {});
      } else if (typeof adapter.terminateRequest === 'function') {
        void adapter.terminateRequest().catch(() => {});
      }
    }

    // Mark in-flight tool calls as interrupted so UI doesn't remain "Executing".
    for (const [toolCallId, toolCall] of toolCallsRef.current.entries()) {
      if (toolCall.status === 'executing' || toolCall.status === 'inProgress') {
        toolCallsRef.current.set(toolCallId, {
          ...toolCall,
          status: 'error',
          error: 'Interrupted by user',
        });
      }
    }
    setDisplayItems(prev =>
      prev.map(item => {
        if (!isToolCallMessage(item)) return item;
        if (item.status !== 'executing' && item.status !== 'inProgress') {
          return item;
        }
        return {
          ...item,
          status: 'error',
          error: 'Interrupted by user',
        } as ToolCallMessage;
      }),
    );

    if (useStoreMode) {
      useChatStore.getState().stopStreaming();
    }
    pendingToolExecutionsRef.current = 0;
    setIsLoading(false);
    setIsStreaming(false);
    agentRuntimeStore.getState().requestRefresh();
    suppressAssistantTextForToolOnlyRef.current = false;
    currentAssistantMessageRef.current = null;

    // Also interrupt any code running in the sandbox (best-effort).
    if (protocol?.configEndpoint) {
      const query = protocol.agentId
        ? `?agent_id=${encodeURIComponent(protocol.agentId)}`
        : '';
      const interruptUrl = `${getApiBaseFromConfig(protocol.configEndpoint)}/configure/sandbox/interrupt${query}`;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (protocol.authToken) {
        headers['Authorization'] = `Bearer ${protocol.authToken}`;
      }
      fetch(interruptUrl, { method: 'POST', headers }).catch(() => {});
    }
  }, [
    useStoreMode,
    protocol?.configEndpoint,
    protocol?.authToken,
    protocol?.agentId,
  ]);

  // ---- handleNewChat ----
  const handleNewChat = useCallback(() => {
    setDisplayItems([]);
    toolCallsRef.current.clear();
    pendingToolExecutionsRef.current = 0;
    setInput('');
    threadIdRef.current = generateMessageId();
    if (useStoreMode) clearStoreMessages();
    if (runtimeId) useConversationStore.getState().clearMessages(runtimeId);
    onNewChat?.();
    headerButtons?.onNewChat?.();
  }, [clearStoreMessages, onNewChat, headerButtons, useStoreMode, runtimeId]);

  // ---- handleClear ----
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      setDisplayItems([]);
      toolCallsRef.current.clear();
      if (useStoreMode) clearStoreMessages();
      if (runtimeId) useConversationStore.getState().clearMessages(runtimeId);
      onClear?.();
      headerButtons?.onClear?.();
    }
  }, [clearStoreMessages, onClear, headerButtons, useStoreMode, runtimeId]);

  // ---- handleSandboxInterrupt ----
  const handleSandboxInterrupt = useCallback(async () => {
    if (!protocol?.configEndpoint) return;
    const interruptUrl = `${getApiBaseFromConfig(protocol.configEndpoint)}/configure/sandbox/interrupt`;
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (protocol.authToken) {
        headers['Authorization'] = `Bearer ${protocol.authToken}`;
      }
      await fetch(interruptUrl, { method: 'POST', headers });
      sandboxStatusQuery.refetch();
    } catch {
      // Interrupt is best-effort
    }
  }, [protocol?.configEndpoint, protocol?.authToken, sandboxStatusQuery]);

  // ---- HITL respond handler (passed to MessageList) ----
  const handleRespond = useCallback(
    async (toolCallId: string, result: unknown) => {
      const existingToolCall = toolCallsRef.current.get(toolCallId);
      if (
        existingToolCall &&
        (existingToolCall.status === 'executing' ||
          existingToolCall.status === 'inProgress')
      ) {
        const isApprovalDecision =
          !!result &&
          typeof result === 'object' &&
          (result as Record<string, unknown>).type ===
            'tool-approval-decision' &&
          typeof (result as Record<string, unknown>).approved === 'boolean';

        if (isApprovalDecision && adapterRef.current) {
          const approved = Boolean(
            (result as Record<string, unknown>).approved,
          );

          const updatedToolCall: ToolCallMessage = {
            ...existingToolCall,
            result,
            status: approved ? 'complete' : 'error',
            error: approved ? undefined : 'Tool approval rejected by user',
          };
          toolCallsRef.current.set(toolCallId, updatedToolCall);
          setDisplayItems(prev =>
            prev.map(item =>
              isToolCallMessage(item) && item.toolCallId === toolCallId
                ? updatedToolCall
                : item,
            ),
          );

          setIsLoading(true);
          setIsStreaming(true);

          try {
            const approvalId =
              typeof result === 'object' &&
              result !== null &&
              typeof (result as Record<string, unknown>).approvalId === 'string'
                ? ((result as Record<string, unknown>).approvalId as string)
                : undefined;

            await adapterRef.current.sendToolResult(toolCallId, {
              toolCallId,
              success: approved,
              result: approved
                ? {
                    approved: true,
                    message: 'Tool call approved by user.',
                    ...(approvalId ? { approvalId } : {}),
                  }
                : {
                    approved: false,
                    message: 'Tool call rejected by user.',
                    ...(approvalId ? { approvalId } : {}),
                  },
              ...(approved ? {} : { error: 'Tool approval rejected by user' }),
            });
          } catch (err) {
            console.error('[ChatBase] Approval continuation error:', err);
            setError(err as Error);
          }
          return;
        }

        const updatedToolCall: ToolCallMessage = {
          ...existingToolCall,
          result,
          status: 'complete',
        };
        toolCallsRef.current.set(toolCallId, updatedToolCall);
        setDisplayItems(prev =>
          prev.map(item =>
            isToolCallMessage(item) && item.toolCallId === toolCallId
              ? updatedToolCall
              : item,
          ),
        );

        if (adapterRef.current) {
          let responseText: string;
          if (typeof result === 'string') {
            responseText = result;
          } else if (
            result &&
            typeof result === 'object' &&
            'accepted' in result
          ) {
            const hitlResult = result as {
              accepted: boolean;
              steps?: Array<{ description: string }>;
            };
            if (hitlResult.accepted) {
              const stepDescriptions =
                hitlResult.steps?.map(s => s.description).join(', ') || '';
              responseText = stepDescriptions
                ? `I confirm and approve the following steps: ${stepDescriptions}`
                : 'I confirm and approve the plan.';
            } else {
              responseText =
                'I reject this plan. Please suggest something else.';
            }
          } else {
            responseText = JSON.stringify(result, null, 2);
          }

          const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'user',
            content: responseText,
            createdAt: new Date(),
          };

          setIsLoading(true);
          setIsStreaming(true);

          try {
            const allMessages = displayItems.filter(
              (item): item is ChatMessage => !isToolCallMessage(item),
            );
            await adapterRef.current.sendMessage(userMessage, {
              threadId: threadIdRef.current,
              messages: [...allMessages, userMessage],
            } as Parameters<typeof adapterRef.current.sendMessage>[1]);
          } catch (err) {
            console.error('[ChatBase] HITL respond error:', err);
          }
          // NOTE: Do NOT reset isLoading here — the adapter's 'done'
          // event will handle it when the run truly completes.
        }
      }
    },
    [displayItems],
  );

  // ---- Suggestion handlers (for EmptyState) ----
  const handleSuggestionSubmit = useCallback(
    (suggestion: Suggestion) => {
      void handleSend(suggestion.message);
    },
    [handleSend],
  );

  const handleSuggestionFill = useCallback((message: string) => {
    setInput(message);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // ---- Compute data for InputToolbar ----
  // Merge real-time WebSocket MCP status into the cached config data so the
  // dropdown reflects live availability even when the config query was cached
  // before the MCP servers finished starting.
  const configMcpServers = (configQuery.data?.mcpServers || []).filter(
    server => !mcpServers || isServerSelected(server),
  );
  const filteredMcpServers = useMemo(() => {
    const merged = configMcpServers.map(server => {
      const wsServer = mcpStatusData?.servers?.find(s => s.id === server.id);
      if (wsServer && wsServer.status === 'started') {
        const updates: Partial<typeof server> = {};
        if (!server.isAvailable) {
          updates.isAvailable = true;
        }
        // Always prefer WS-discovered tools over cached config data.
        // The config query may have been fetched before MCP servers
        // finished starting, leaving tools empty or stale.
        if (wsServer.tools && wsServer.tools.length > 0) {
          updates.tools = wsServer.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            enabled: t.enabled ?? true,
          }));
        }
        if (Object.keys(updates).length > 0) {
          return { ...server, ...updates };
        }
      }
      return server;
    });

    // Include WS-only servers that are started but missing from the config
    // query (e.g. config was fetched before the MCP server finished starting).
    const configIds = new Set(configMcpServers.map(s => s.id));
    for (const wsServer of mcpStatusData?.servers ?? []) {
      if (
        wsServer.status === 'started' &&
        !configIds.has(wsServer.id) &&
        wsServer.tools &&
        wsServer.tools.length > 0
      ) {
        const selected =
          !mcpServers || mcpServers.some(s => s.id === wsServer.id);
        if (selected) {
          merged.push({
            id: wsServer.id,
            name: wsServer.id,
            description: '',
            url: '',
            enabled: true,
            tools: wsServer.tools.map(t => ({
              name: t.name,
              description: t.description || '',
              enabled: t.enabled ?? true,
            })),
            args: [],
            requiredEnvVars: [],
            isAvailable: true,
            transport: 'stdio',
            isConfig: false,
            isRunning: true,
          });
        }
      }
    }

    return merged;
  }, [configMcpServers, mcpStatusData, mcpServers]);

  // ---- Not ready ----
  if (!ready) {
    return (
      <Box
        className={className}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
          borderRadius,
          bg: backgroundColor || 'canvas.default',
          border,
          boxShadow,
        }}
      >
        {loadingState || (
          <>
            <Spinner size="large" />
            <Text sx={{ mt: 3, color: 'fg.muted' }}>Initializing chat...</Text>
          </>
        )}
      </Box>
    );
  }

  // ---- apiBase for indicators (derived from configEndpoint) ----
  // Indicators (McpStatusIndicator, SandboxStatusIndicator) prepend
  // "/api/v1/configure/…" themselves, so we need the raw base URL
  // (without "/api/v1") rather than getApiBaseFromConfig() which keeps it.
  const indicatorApiBase = protocol?.configEndpoint
    ? protocol.configEndpoint.replace(/\/api\/v1\/(config|configure)\/?$/, '')
    : undefined;

  const connectionConfirmed =
    !protocol ||
    protocol.enableConfigQuery === false ||
    !!configQuery.data ||
    !!skillsQuery.data;

  // ========================================================================
  // Render
  // ========================================================================
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bg: backgroundColor || 'canvas.default',
        borderRadius,
        border,
        boxShadow,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      {showHeader && (
        <ChatBaseHeader
          title={title}
          brandIcon={brandIcon}
          headerContent={headerContent}
          headerActions={headerActions}
          showInformation={showInformation}
          onInformationClick={onInformationClick}
          padding={padding}
          sandboxStatus={sandboxStatus}
          onSandboxInterrupt={handleSandboxInterrupt}
          headerButtons={headerButtons}
          messageCount={messages.length}
          onNewChat={handleNewChat}
          onClear={handleClear}
          chatViewMode={chatViewMode}
          onChatViewModeChange={onChatViewModeChange}
        />
      )}

      {/* Tool approval banner (top-of-chat) */}
      {showToolApprovalBanner &&
        pendingApprovals &&
        pendingApprovals.length > 0 && (
          <ToolApprovalBannerSection
            pendingApprovals={pendingApprovals}
            onApprove={onApproveApproval}
            onReject={onRejectApproval}
          />
        )}

      {/* Error banner */}
      {showErrors && error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: padding,
            bg: 'danger.subtle',
            borderBottom: '1px solid',
            borderColor: 'danger.muted',
          }}
        >
          <AlertIcon size={16} />
          <Text sx={{ color: 'danger.fg', fontSize: 1 }}>{error.message}</Text>
        </Box>
      )}

      {/* Messages area */}
      <Box
        sx={{ flex: 1, flexGrow: 1, overflow: 'auto', bg: 'canvas.default' }}
      >
        {children ? (
          children
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100%',
              bg: 'canvas.default',
            }}
          >
            <ChatMessageList
              displayItems={displayItems}
              isLoading={isLoading}
              isStreaming={isStreaming}
              showLoadingIndicator={showLoadingIndicator}
              hideMessagesAfterToolUI={hideMessagesAfterToolUI}
              avatarConfig={defaultAvatarConfig}
              padding={padding}
              renderToolResult={renderToolResult}
              approvalConfig={approvalConfig}
              messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
              onRespond={handleRespond}
              emptyContent={
                <ChatEmptyState
                  emptyState={emptyState}
                  brandIcon={brandIcon}
                  description={description}
                  suggestions={suggestions}
                  submitOnSuggestionClick={submitOnSuggestionClick}
                  onSuggestionSubmit={handleSuggestionSubmit}
                  onSuggestionFill={handleSuggestionFill}
                />
              }
            />
          </Box>
        )}
      </Box>

      {/* Footer content */}
      {footerContent}

      {/* Input */}
      {showInput && (
        <InputToolbar
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          connectionConfirmed={connectionConfirmed}
          placeholder={placeholder}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
          padding={padding}
          onSend={() => handleSend()}
          onStop={handleStop}
          showTokenUsage={showTokenUsage}
          agentUsage={agentUsage}
          showModelSelector={showModelSelector}
          showToolsMenu={showToolsMenu}
          showSkillsMenu={showSkillsMenu}
          codemodeEnabled={codemodeEnabled}
          isA2AProtocol={isA2AProtocol}
          hasConfigData={!!configQuery.data}
          hasSkillsData={!!skillsQuery.data}
          models={availableModels || configQuery.data?.models || []}
          selectedModel={selectedModel}
          onModelSelect={setSelectedModel}
          availableTools={configQuery.data?.builtinTools || []}
          mcpServers={filteredMcpServers}
          enabledMcpTools={enabledMcpTools}
          enabledMcpToolCount={getEnabledMcpToolNames().length}
          onToggleMcpTool={toggleMcpTool}
          onToggleAllMcpServerTools={toggleAllMcpServerTools}
          approvedMcpTools={approvedMcpTools}
          onToggleMcpToolApproval={toggleMcpToolApproval}
          skills={skillsQuery.data?.skills || []}
          skillsLoading={!!skillsQuery.isLoading}
          enabledSkills={enabledSkills}
          onToggleSkill={toggleSkill}
          onToggleAllSkills={toggleAllSkills}
          approvedSkills={approvedSkills}
          onToggleSkillApproval={toggleSkillApproval}
          apiBase={indicatorApiBase}
          authToken={protocol?.authToken}
          agentId={protocol?.agentId}
          mcpStatusData={mcpStatusData}
          sandboxStatusData={sandboxStatusData}
        />
      )}

      {/* Powered by tag */}
      {showPoweredBy && <PoweredByTag {...poweredByProps} />}
    </Box>
  );
}

/**
 * Internal component rendering the top-of-chat approval banner + review dialog.
 * Extracted so we can keep `ChatBase` focused on chat flow while still owning
 * the banner UX via the `showToolApprovalBanner` prop.
 */
function ToolApprovalBannerSection({
  pendingApprovals,
  onApprove,
  onReject,
}: {
  pendingApprovals: PendingApproval[];
  onApprove?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;
  onReject?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;
}) {
  const [activeApproval, setActiveApproval] = useState<PendingApproval | null>(
    null,
  );

  // Keep the active approval in sync with the incoming list; if the active
  // one is no longer pending (resolved), dismiss the dialog.
  useEffect(() => {
    if (!activeApproval) {
      return;
    }
    if (!pendingApprovals.some(a => a.id === activeApproval.id)) {
      setActiveApproval(null);
    }
  }, [pendingApprovals, activeApproval]);

  return (
    <>
      <ToolApprovalBanner
        pendingApprovals={pendingApprovals}
        onReview={approval => setActiveApproval(approval)}
        onApproveAll={async () => {
          if (!onApprove) return;
          for (const approval of pendingApprovals) {
            await onApprove(approval.id);
          }
        }}
      />

      <ToolApprovalDialog
        isOpen={!!activeApproval}
        toolName={activeApproval?.toolName ?? ''}
        toolDescription={activeApproval?.toolDescription}
        args={activeApproval?.args ?? {}}
        onApprove={async () => {
          if (!activeApproval || !onApprove) {
            setActiveApproval(null);
            return;
          }
          const result = await onApprove(activeApproval.id);
          if (result !== false) {
            setActiveApproval(null);
          }
        }}
        onDeny={async () => {
          if (!activeApproval || !onReject) {
            setActiveApproval(null);
            return;
          }
          const result = await onReject(
            activeApproval.id,
            'Rejected from tool approval dialog',
          );
          if (result !== false) {
            setActiveApproval(null);
          }
        }}
        onClose={() => setActiveApproval(null)}
      />
    </>
  );
}

export default ChatBase;
