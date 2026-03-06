/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ACP (Agent Communication Protocol) adapter using WebSocket transport.
 *
 * Implements the Agent Client Protocol as specified at:
 * https://agentclientprotocol.com
 *
 * Key Protocol Features:
 * - JSON-RPC 2.0 message format
 * - Protocol version: 1 (integer for MAJOR version)
 * - Methods: initialize, session/new, session/prompt, session/cancel
 * - Session updates via session/update notifications
 * - Permission handling via session/request_permission
 *
 * @module components/chat/protocols/ACPAdapter
 */

import {
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  AGENT_METHODS,
  CLIENT_METHODS,
  type StopReason,
  type SessionUpdate,
  type RequestPermissionRequest,
  type PermissionOption,
  type ToolCallUpdate,
} from '@agentclientprotocol/sdk';

import type { ProtocolAdapterConfig, ACP } from '../types/protocol';
import type { ChatMessage } from '../types/message';
import type { ToolDefinition, ToolExecutionResult } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';

/**
 * Session update type discriminator
 */
type SessionUpdateType = SessionUpdate extends {
  sessionUpdate: infer T;
}
  ? T
  : never;

/**
 * ACP session tracking
 */
export interface ACPSession {
  sessionId: string;
  agentId: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'error';
}

/**
 * ACP agent info
 */
export interface ACPAgent {
  id: string;
  name: string;
  description?: string;
  capabilities?: Record<string, unknown>;
}

/**
 * Pending permission request
 */
export interface ACPPendingPermission {
  /** JSON-RPC request ID for the response */
  requestId: string | number;
  /** Session ID */
  sessionId: string;
  /** Tool call details */
  toolCall: ToolCallUpdate;
  /** Permission options */
  options: PermissionOption[];
}

/**
 * ACP specific configuration
 */
export interface ACPAdapterConfig extends ProtocolAdapterConfig {
  /** WebSocket URL (ws:// or wss://) */
  wsUrl?: string;
  /** Client capabilities to advertise */
  clientCapabilities?: {
    fs?: {
      readTextFile?: boolean;
      writeTextFile?: boolean;
    };
    terminal?: boolean;
  };
  /** Callback when permission is requested */
  onPermissionRequest?: (permission: ACPPendingPermission) => void;
}

/**
 * ACP protocol adapter
 * Uses WebSocket with JSON-RPC 2.0 for bidirectional communication
 */
export class ACPAdapter extends BaseProtocolAdapter {
  readonly type = 'acp' as const;
  readonly transport = 'websocket' as const;

  private acpConfig: ACPAdapterConfig;
  private ws: WebSocket | null = null;
  private session: ACPSession | null = null;
  private agent: ACPAgent | null = null;
  private streamingContent = '';
  private streamingMessageId: string | null = null;
  private pendingPermission: ACPPendingPermission | null = null;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor(config: ACPAdapterConfig) {
    super(config);
    this.acpConfig = config;
  }

  /**
   * Get current session
   */
  getSession(): ACPSession | null {
    return this.session;
  }

  /**
   * Get agent info
   */
  getAgent(): ACPAgent | null {
    return this.agent;
  }

  /**
   * Get pending permission request
   */
  getPendingPermission(): ACPPendingPermission | null {
    return this.pendingPermission;
  }

  /**
   * Connect to ACP WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setConnectionState('connecting');

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.acpConfig.wsUrl || this.config.baseUrl;
        const agentId = this.config.agentId;
        const fullUrl = agentId ? `${wsUrl}/${agentId}` : wsUrl;

        this.ws = new WebSocket(fullUrl);

        this.ws.onopen = async () => {
          this.reconnectAttempts = 0;

          try {
            // Initialize connection per ACP spec
            const initResult = (await this.sendRequest('initialize', {
              protocolVersion: ACP_PROTOCOL_VERSION,
              clientCapabilities: this.acpConfig.clientCapabilities || {
                fs: {
                  readTextFile: false,
                  writeTextFile: false,
                },
                terminal: false,
              },
            })) as {
              protocolVersion?: number;
              agentCapabilities?: {
                agent?: ACPAgent;
                [key: string]: unknown;
              };
              session_id?: string;
            };

            if (initResult.agentCapabilities?.agent) {
              this.agent = initResult.agentCapabilities.agent;
            }

            // Create new session per ACP spec
            const sessionResult = (await this.sendRequest(
              AGENT_METHODS.session_new,
              {},
            )) as {
              sessionId?: string;
            };

            if (sessionResult.sessionId) {
              this.session = {
                sessionId: sessionResult.sessionId,
                agentId: this.config.agentId || '',
                createdAt: new Date().toISOString(),
                status: 'active',
              };
            } else if (initResult.session_id) {
              // Fallback for implementations that include session in initialize
              this.session = {
                sessionId: initResult.session_id,
                agentId: this.config.agentId || '',
                createdAt: new Date().toISOString(),
                status: 'active',
              };
            }

            this.setConnectionState('connected');
            resolve();
          } catch (e) {
            console.error('[ACPAdapter] Initialization error:', e);
            // Still mark as connected if WebSocket is open
            this.setConnectionState('connected');
            resolve();
          }
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (event: Event) => {
          console.error('[ACPAdapter] WebSocket error:', event);
          this.emit({
            type: 'error',
            error: new Error('WebSocket error'),
            timestamp: new Date(),
          });
        };

        this.ws.onclose = () => {
          this.ws = null;
          this.setConnectionState('disconnected');
          this.handleReconnect();
        };
      } catch (error) {
        this.setConnectionState('error');
        this.emit({
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket and terminate any running session
   */
  disconnect(): void {
    // Send session/cancel if we have an active session
    if (this.session && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.terminateSession(this.session.sessionId).catch(err => {
        console.warn('[ACPAdapter] Failed to terminate session:', err);
      });
    }

    // Clear pending requests
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.session = null;
    this.agent = null;
    this.pendingPermission = null;
    this.setConnectionState('disconnected');
  }

  /**
   * Terminate a running session on the backend via session/cancel
   */
  async terminateSession(sessionId?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ACPAdapter] Cannot terminate: WebSocket not connected');
      return;
    }

    try {
      const targetSessionId = sessionId || this.session?.sessionId;
      if (!targetSessionId) {
        console.warn('[ACPAdapter] Cannot terminate: No session ID');
        return;
      }

      // Send session/cancel JSON-RPC request
      const requestId = `cancel-${Date.now()}`;
      const cancelRequest = {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId: targetSessionId,
        },
        id: requestId,
      };

      this.ws.send(JSON.stringify(cancelRequest));
      console.debug('[ACPAdapter] Sent session/cancel for:', targetSessionId);
    } catch (err) {
      console.debug('[ACPAdapter] Terminate request error:', err);
    }
  }

  /**
   * Send a message through ACP protocol
   */
  async sendMessage(
    message: ChatMessage,
    _options?: {
      tools?: ToolDefinition[];
      threadId?: string;
      metadata?: Record<string, unknown>;
      /** Model to use for this request (overrides agent default) */
      model?: string;
      /** Built-in MCP tool names to enable */
      builtinTools?: string[];
      /** Skill IDs to enable */
      skills?: string[];
      /** Connected identity tokens to pass to backend for tool execution */
      identities?: Array<{
        provider: string;
        accessToken: string;
      }>;
    },
  ): Promise<void> {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Reset streaming state and generate a stable ID for this response
    this.streamingContent = '';
    this.streamingMessageId = generateMessageId();

    // Note: User message is already added to displayItems by ChatBase before calling sendMessage
    // Do NOT emit user message event here to avoid duplication

    try {
      // Use ACP spec method: session/prompt
      // Content is an array of ContentBlocks per ACP spec
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('');

      if (_options?.model) {
        console.log('[ACPAdapter] Sending with model:', _options.model);
      }

      if (_options?.identities && _options.identities.length > 0) {
        console.log(
          '[ACPAdapter] Sending with identities:',
          _options.identities.map(i => i.provider),
        );
      }

      // Build metadata including model override and identities
      const metadata: Record<string, unknown> = {};
      if (_options?.model) {
        metadata.model = _options.model;
      }
      if (_options?.identities && _options.identities.length > 0) {
        metadata.identities = _options.identities;
      }

      await this.sendRequest(AGENT_METHODS.session_prompt, {
        sessionId: this.session.sessionId,
        content: [{ type: 'text', text: content }],
        // Include metadata with model and identities
        ...(Object.keys(metadata).length > 0 && { metadata }),
      });
    } catch (error) {
      this.emit({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Send tool result back through ACP
   */
  async sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void> {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Emit tool result event
    this.emit({
      type: 'tool-result',
      toolResult: result,
      timestamp: new Date(),
    });

    // ACP handles tool results through the permission response flow
    // If there's a pending permission, respond to it
    if (this.pendingPermission) {
      this.grantPermission();
    }
  }

  /**
   * Grant permission (respond to session/request_permission)
   */
  grantPermission(optionId?: string): void {
    if (this.pendingPermission) {
      const selectedOptionId =
        optionId || this.pendingPermission.options[0]?.optionId || 'allow';

      this.sendResponse(this.pendingPermission.requestId, {
        outcome: {
          outcome: 'selected',
          optionId: selectedOptionId,
        },
      });

      this.pendingPermission = null;
    }
  }

  /**
   * Deny permission (respond with cancelled)
   */
  denyPermission(): void {
    if (this.pendingPermission) {
      this.sendResponse(this.pendingPermission.requestId, {
        outcome: {
          outcome: 'cancelled',
        },
      });

      this.pendingPermission = null;
    }
  }

  /**
   * Check feature support
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = [
      'streaming',
      'tools',
      'permissions',
      'session-management',
      'bidirectional',
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Send ACP JSON-RPC request
   */
  private async sendRequest(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to agent');
    }

    const id = this.generateId();
    const message: ACP.JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      if (this.ws) {
        this.ws.send(JSON.stringify(message));
      }

      // Timeout after configured timeout or 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.config.timeout || 30000);
    });
  }

  /**
   * Send ACP JSON-RPC response
   */
  private sendResponse(
    id: string | number,
    result: Record<string, unknown>,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[ACPAdapter] Cannot send response: not connected');
      return;
    }

    const message: ACP.JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as {
        jsonrpc: string;
        id?: string | number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { code: number; message: string; data?: unknown };
      };

      // Handle response to pending request
      if (data.id && this.pendingRequests.has(data.id)) {
        const pending = this.pendingRequests.get(data.id);
        if (!pending) return;
        const { resolve, reject } = pending;
        this.pendingRequests.delete(data.id);

        if (data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data.result);
        }

        // Handle stopReason for prompt completion
        if (
          data.result &&
          typeof data.result === 'object' &&
          'stopReason' in data.result
        ) {
          this.handleCompletion(data.result as { stopReason: StopReason });
        }

        return;
      }

      // Handle ACP session/update notifications
      if (data.method === 'session/update') {
        this.handleSessionUpdate(data.params || {});
        return;
      }

      // Handle permission request from agent
      if (
        data.method === CLIENT_METHODS.session_request_permission &&
        data.id
      ) {
        this.handlePermissionRequest(
          data.id,
          data.params as RequestPermissionRequest,
        );
        return;
      }

      // Handle response with stopReason
      if (
        data.result &&
        typeof data.result === 'object' &&
        'stopReason' in data.result
      ) {
        this.handleCompletion(data.result as { stopReason: StopReason });
      }
    } catch (e) {
      console.error('[ACPAdapter] Failed to parse message:', e);
    }
  }

  /**
   * Handle session update notifications
   */
  private handleSessionUpdate(params: Record<string, unknown>): void {
    const updateType = params.sessionUpdate as SessionUpdateType | undefined;

    // Handle streaming text chunks
    if (updateType === 'agent_message_chunk' && params.chunk) {
      const chunk = params.chunk as string;

      // Filter out debug StreamEvent strings
      if (!chunk.startsWith('StreamEvent(')) {
        this.streamingContent += chunk;

        // Use stable message ID for streaming updates
        const streamingMessage = createAssistantMessage(this.streamingContent);
        if (this.streamingMessageId) {
          streamingMessage.id = this.streamingMessageId;
        }

        this.emit({
          type: 'message',
          message: streamingMessage,
          timestamp: new Date(),
        });
      }
    }

    // Handle tool calls
    if (updateType === 'tool_call') {
      this.emit({
        type: 'tool-call',
        toolCall: {
          toolCallId: (params.toolCallId as string) || generateMessageId(),
          toolName: (params.title as string) || '',
          args: (params.rawInput as Record<string, unknown>) || {},
        },
        timestamp: new Date(),
      });
    }

    // Handle tool results
    if (updateType === 'tool_call_update') {
      this.emit({
        type: 'tool-result',
        toolResult: {
          success: true,
          result: params.rawOutput,
        },
        timestamp: new Date(),
      });
    }

    // Handle thought chunks (could be displayed differently)
    if (updateType === 'agent_thought_chunk' && params.chunk) {
      this.emit({
        type: 'activity',
        activity: {
          type: 'thought',
          data: params.chunk,
        },
        timestamp: new Date(),
      });
    }

    // Handle error events - emit as error, not as message
    if (params.error) {
      this.emit({
        type: 'error',
        error: new Error(params.error as string),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle permission request from agent
   */
  private handlePermissionRequest(
    requestId: string | number,
    params: RequestPermissionRequest,
  ): void {
    this.pendingPermission = {
      requestId,
      sessionId: params.sessionId,
      toolCall: params.toolCall,
      options: params.options,
    };

    // Emit as tool-call event for HITL handling
    this.emit({
      type: 'tool-call',
      toolCall: {
        toolCallId: params.toolCall.toolCallId,
        toolName: params.toolCall.title || '',
        args: (params.toolCall.rawInput as Record<string, unknown>) || {},
      },
      timestamp: new Date(),
    });

    // Also call the callback if provided
    this.acpConfig.onPermissionRequest?.(this.pendingPermission);
  }

  /**
   * Handle completion (stopReason received)
   */
  private handleCompletion(result: { stopReason: StopReason }): void {
    // Finalize any streamed content
    if (this.streamingContent) {
      const finalMessage = createAssistantMessage(this.streamingContent);
      // Use the stable streaming message ID for the final message
      finalMessage.id = this.streamingMessageId || generateMessageId();

      this.emit({
        type: 'message',
        message: finalMessage,
        timestamp: new Date(),
      });

      this.streamingContent = '';
      this.streamingMessageId = null;
    }

    // Emit activity for completion
    this.emit({
      type: 'activity',
      activity: {
        type: 'completed',
        data: { stopReason: result.stopReason },
      },
      timestamp: new Date(),
    });
  }
}
