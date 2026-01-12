/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * useAcp - React hook for connecting to ACP-compatible agents.
 *
 * Implements the Agent Client Protocol (ACP) as specified at:
 * https://agentclientprotocol.com
 *
 * Uses the official ACP TypeScript SDK from:
 * https://github.com/agentclientprotocol/typescript-sdk
 *
 * Key Protocol Features:
 * - JSON-RPC 2.0 message format
 * - Protocol version: 1 (integer for MAJOR version)
 * - Methods: initialize, session/new, session/prompt, session/cancel
 * - Session updates via session/update notifications
 *
 * This hook provides a simple interface for:
 * - WebSocket-based agent communication
 * - Session management
 * - Message streaming with session/update notifications
 * - Permission handling
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Import from official ACP SDK
import {
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  AGENT_METHODS,
  CLIENT_METHODS,
  type StopReason,
  type SessionUpdate,
  type AgentCapabilities,
  type ClientCapabilities,
  type RequestPermissionRequest,
  type PermissionOption,
  type ToolCallUpdate,
} from '@agentclientprotocol/sdk';

// Re-export SDK types for convenience
export type {
  StopReason,
  AgentCapabilities,
  ClientCapabilities,
  ToolCallUpdate,
  PermissionOption,
};

// Connection state for UI
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// Extract sessionUpdate discriminator for easier message handling
export type SessionUpdateType = SessionUpdate extends {
  sessionUpdate: infer T;
}
  ? T
  : never;

/**
 * UI-level agent info (simplified from SDK's AgentCapabilities).
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  capabilities?: AgentCapabilities;
}

/**
 * UI-level session tracking.
 */
export interface Session {
  sessionId: string;
  agentId: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'error';
}

/**
 * UI-level message for chat display.
 * Note: SDK's ContentBlock is used for protocol-level content.
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * UI-level streaming event.
 */
export interface StreamEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'completed' | 'error';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  error?: string;
  stopReason?: StopReason;
}

/**
 * Pending permission request awaiting user response.
 * Based on SDK's RequestPermissionRequest with ToolCallUpdate and PermissionOption.
 */
export interface PendingPermission {
  /** JSON-RPC request ID for the response */
  requestId: string | number;
  /** Session ID */
  sessionId: string;
  /** Tool call details from SDK */
  toolCall: ToolCallUpdate;
  /** Permission options from SDK */
  options: PermissionOption[];
}

export interface UseAcpOptions {
  /** WebSocket URL of the ACP-compatible agent server */
  wsUrl: string;
  /** Agent ID to connect to */
  agentId: string;
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Number of reconnection attempts (default: 3) */
  reconnectAttempts?: number;
  /** Delay between reconnection attempts in ms (default: 2000) */
  reconnectDelay?: number;
  /** Callback when a stream event is received */
  onStreamEvent?: (event: StreamEvent) => void;
  /** Callback when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;
  /** Callback when a permission is requested */
  onPermissionRequest?: (request: PendingPermission) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseAcpReturn {
  // Connection management
  connect: () => Promise<void>;
  disconnect: () => void;
  connectionState: ConnectionState;

  // Agent info
  agent: Agent | null;
  session: Session | null;

  // Messaging
  sendMessage: (content: string) => Promise<void>;
  messages: Message[];
  isLoading: boolean;

  // Streaming
  streamingContent: string;
  isStreaming: boolean;

  // Permissions
  pendingPermission: PendingPermission | null;
  grantPermission: (optionId?: string) => void;
  denyPermission: () => void;

  // Utilities
  clearMessages: () => void;
  error: Error | null;
}

interface ACPMessage {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * React hook for connecting to ACP-compatible agents.
 *
 * @example
 * ```tsx
 * const {
 *   connect,
 *   disconnect,
 *   connectionState,
 *   sendMessage,
 *   messages,
 *   isStreaming,
 *   streamingContent,
 * } = useAcp({
 *   wsUrl: 'ws://localhost:8000/api/v1/acp/ws',
 *   agentId: 'my-agent',
 * });
 *
 * // Send a message
 * await sendMessage('Hello, agent!');
 * ```
 */
export function useAcp(options: UseAcpOptions): UseAcpReturn {
  const {
    wsUrl,
    agentId,
    autoConnect = true,
    reconnectAttempts = 3,
    reconnectDelay = 2000,
    onStreamEvent,
    onConnectionChange,
    onPermissionRequest,
    onError,
  } = options;

  // State
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const streamingContentRef = useRef('');
  const pendingRequestsRef = useRef<
    Map<
      string | number,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate unique message ID
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  // Send ACP request
  const sendRequest = useCallback(
    async (
      method: string,
      params: Record<string, unknown> = {},
    ): Promise<unknown> => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to agent');
      }

      const id = generateId();
      const message: ACPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });
        wsRef.current!.send(JSON.stringify(message));

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      });
    },
    [generateId],
  );

  // Send ACP response (for responding to incoming requests like session/request_permission)
  const sendResponse = useCallback(
    (id: string | number, result: Record<string, unknown>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('Cannot send response: not connected to agent');
        return;
      }

      const message: ACPMessage = {
        jsonrpc: '2.0',
        id,
        result,
      };

      wsRef.current.send(JSON.stringify(message));
    },
    [],
  );

  // Handle incoming message
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: ACPMessage = JSON.parse(event.data);

        // Handle response to pending request
        if (data.id && pendingRequestsRef.current.has(data.id)) {
          const { resolve, reject } = pendingRequestsRef.current.get(data.id)!;
          pendingRequestsRef.current.delete(data.id);

          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve(data.result);
          }

          // Also handle stopReason for prompt completion responses
          // This resets loading state and finalizes any streamed content
          if (
            data.result &&
            typeof data.result === 'object' &&
            'stopReason' in data.result
          ) {
            const result = data.result as { stopReason: StopReason };
            setIsStreaming(false);
            setIsLoading(false);

            // Add streamed content as message
            const content = streamingContentRef.current;
            if (content) {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content,
                  timestamp: new Date().toISOString(),
                },
              ]);
              setStreamingContent('');
              streamingContentRef.current = '';
            }

            onStreamEvent?.({
              type: 'completed',
              stopReason: result.stopReason,
            });
          }

          return;
        }

        // Handle ACP spec session/update notifications
        if (data.method === 'session/update') {
          const params = data.params as {
            sessionId?: string;
            sessionUpdate?: SessionUpdateType;
            chunk?: string;
            toolCallId?: string;
            name?: string;
            arguments?: Record<string, unknown>;
            result?: unknown;
          };

          const updateType = params.sessionUpdate;

          // Handle streaming text chunks
          if (updateType === 'agent_message_chunk' && params.chunk) {
            // Filter out debug StreamEvent strings that shouldn't be displayed
            const chunk = params.chunk;
            if (!chunk.startsWith('StreamEvent(')) {
              setStreamingContent(prev => {
                const newContent = prev + chunk;
                streamingContentRef.current = newContent;
                return newContent;
              });
              setIsStreaming(true);

              onStreamEvent?.({
                type: 'text_delta',
                content: chunk,
              });
            }
          }

          // Handle tool calls
          if (updateType === 'tool_call') {
            onStreamEvent?.({
              type: 'tool_call',
              toolName: params.name,
              toolArgs: params.arguments,
            });
          }

          // Handle tool results
          if (updateType === 'tool_call_update') {
            onStreamEvent?.({
              type: 'tool_result',
              toolResult: params.result,
            });
          }

          // Handle thought chunks
          if (updateType === 'agent_thought_chunk' && params.chunk) {
            // Thoughts could be displayed differently in UI
            onStreamEvent?.({
              type: 'text_delta',
              content: params.chunk,
            });
          }

          return;
        }

        // Handle permission request from agent (ACP spec: session/request_permission)
        // Per ACP spec, this is a request from agent that needs a response from client
        if (
          data.method === CLIENT_METHODS.session_request_permission &&
          data.id
        ) {
          // Parse as SDK's RequestPermissionRequest
          const params = data.params as RequestPermissionRequest;

          // Store as PendingPermission using SDK types
          const pendingPerm: PendingPermission = {
            requestId: data.id,
            sessionId: params.sessionId,
            toolCall: params.toolCall,
            options: params.options,
          };

          setPendingPermission(pendingPerm);
          onPermissionRequest?.(pendingPerm);
          return;
        }

        // Handle response with stopReason (prompt completion)
        if (
          data.result &&
          typeof data.result === 'object' &&
          'stopReason' in data.result
        ) {
          const result = data.result as { stopReason: StopReason };
          setIsStreaming(false);
          setIsLoading(false);

          // Add streamed content as message
          const content = streamingContentRef.current;
          if (content) {
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
              },
            ]);
            setStreamingContent('');
            streamingContentRef.current = '';
          } else {
            // If no content was received, show a placeholder message
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: '(No response)',
                timestamp: new Date().toISOString(),
              },
            ]);
          }

          onStreamEvent?.({
            type: 'completed',
            stopReason: result.stopReason,
          });
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    },
    [onStreamEvent, onPermissionRequest],
  );

  // Connect to agent
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');
    onConnectionChange?.('connecting');

    try {
      const fullUrl = `${wsUrl}/${agentId}`;
      const ws = new WebSocket(fullUrl);

      ws.onopen = async () => {
        wsRef.current = ws;
        reconnectAttemptsRef.current = 0;
        setConnectionState('connected');
        onConnectionChange?.('connected');

        try {
          // Initialize connection per ACP spec
          const initResult = (await sendRequest('initialize', {
            protocolVersion: ACP_PROTOCOL_VERSION,
            clientCapabilities: {
              fs: {
                readTextFile: false,
                writeTextFile: false,
              },
              terminal: false,
            },
          })) as {
            protocolVersion?: number;
            agentCapabilities?: {
              agent?: Agent;
              [key: string]: unknown;
            };
            session_id?: string;
          };

          if (initResult.agentCapabilities?.agent) {
            setAgent(initResult.agentCapabilities.agent);
          }

          // Create new session per ACP spec
          const sessionResult = (await sendRequest(
            AGENT_METHODS.session_new,
            {},
          )) as {
            sessionId?: string;
          };

          if (sessionResult.sessionId) {
            setSession({
              sessionId: sessionResult.sessionId,
              agentId,
              createdAt: new Date().toISOString(),
              status: 'active',
            });
          } else if (initResult.session_id) {
            // Fallback for implementations that include session in initialize
            setSession({
              sessionId: initResult.session_id,
              agentId,
              createdAt: new Date().toISOString(),
              status: 'active',
            });
          }
        } catch (e) {
          console.error('Initialization error:', e);
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = event => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket error'));
        onError?.(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnectionState('disconnected');
        onConnectionChange?.('disconnected');

        // Attempt reconnection
        if (reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (e) {
      setConnectionState('error');
      onConnectionChange?.('error');
      setError(e as Error);
      onError?.(e as Error);
    }
  }, [
    wsUrl,
    agentId,
    reconnectAttempts,
    reconnectDelay,
    handleMessage,
    sendRequest,
    onConnectionChange,
    onError,
  ]);

  // Disconnect from agent
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttemptsRef.current = reconnectAttempts; // Prevent auto-reconnect

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    setAgent(null);
    setSession(null);
    setPendingPermission(null);
  }, [reconnectAttempts]);

  // Send message to agent
  const sendMessage = useCallback(
    async (content: string) => {
      if (!session) {
        throw new Error('No active session');
      }

      // Add user message
      setMessages(prev => [
        ...prev,
        {
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);

      setIsLoading(true);
      setStreamingContent('');
      setError(null);

      try {
        // Use ACP spec method: session/prompt
        // Content is an array of ContentBlocks per ACP spec
        await sendRequest(AGENT_METHODS.session_prompt, {
          sessionId: session.sessionId,
          content: [{ type: 'text', text: content }],
        });
      } catch (e) {
        setIsLoading(false);
        setError(e as Error);
        throw e;
      }
    },
    [session, sendRequest],
  );

  // Grant permission (respond to session/request_permission with selected option)
  const grantPermission = useCallback(
    (optionId?: string) => {
      if (pendingPermission) {
        // Per ACP spec, respond with RequestPermissionResponse
        // Use the first option if no optionId specified
        const selectedOptionId =
          optionId || pendingPermission.options[0]?.optionId || 'allow';
        sendResponse(pendingPermission.requestId, {
          outcome: {
            outcome: 'selected',
            optionId: selectedOptionId,
          },
        });
        setPendingPermission(null);
      }
    },
    [pendingPermission, sendResponse],
  );

  // Deny permission (respond to session/request_permission with cancelled outcome)
  const denyPermission = useCallback(() => {
    if (pendingPermission) {
      // Per ACP spec, respond with cancelled outcome
      sendResponse(pendingPermission.requestId, {
        outcome: {
          outcome: 'cancelled',
        },
      });
      setPendingPermission(null);
    }
  }, [pendingPermission, sendResponse]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Connection management
    connect,
    disconnect,
    connectionState,

    // Agent info
    agent,
    session,

    // Messaging
    sendMessage,
    messages,
    isLoading,

    // Streaming
    streamingContent,
    isStreaming,

    // Permissions
    pendingPermission,
    grantPermission,
    denyPermission,

    // Utilities
    clearMessages,
    error,
  };
}

export default useAcp;
