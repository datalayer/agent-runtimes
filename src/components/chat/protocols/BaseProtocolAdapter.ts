/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Base protocol adapter class with common functionality.
 *
 * @module components/chat/protocols/BaseProtocolAdapter
 */

import type {
  ProtocolAdapter,
  ProtocolAdapterConfig,
  TransportType,
  ProtocolTransport,
  ProtocolConnectionState,
  ProtocolEvent,
  ProtocolEventHandler,
  AgentCard,
} from '../types/protocol';
import type { ChatMessage } from '../types/message';
import type { ToolDefinition, ToolExecutionResult } from '../types/tool';

/**
 * Abstract base class for protocol adapters
 */
export abstract class BaseProtocolAdapter implements ProtocolAdapter {
  abstract readonly type: TransportType;
  abstract readonly transport: ProtocolTransport;

  protected config: ProtocolAdapterConfig;
  protected _connectionState: ProtocolConnectionState = 'disconnected';
  protected eventHandlers: Set<ProtocolEventHandler> = new Set();
  protected reconnectAttempts = 0;

  constructor(config: ProtocolAdapterConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5,
      timeout: 30000,
      ...config,
    };
  }

  get connectionState(): ProtocolConnectionState {
    return this._connectionState;
  }

  /**
   * Connect to the protocol endpoint
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the endpoint
   */
  abstract disconnect(): void;

  /**
   * Send a message through the protocol
   */
  abstract sendMessage(
    message: ChatMessage,
    options?: {
      tools?: ToolDefinition[];
      threadId?: string;
      metadata?: Record<string, unknown>;
      /** Full conversation history to send with the message */
      messages?: ChatMessage[];
      /** Model to use for this request (overrides agent default) */
      model?: string;
    },
  ): Promise<void>;

  /**
   * Send tool execution result back
   */
  abstract sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void>;

  /**
   * Subscribe to protocol events
   */
  subscribe(handler: ProtocolEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Get agent card (optional, mainly for A2A)
   */
  async getAgentCard(): Promise<AgentCard | null> {
    return null;
  }

  /**
   * Check if protocol supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    // Override in subclasses
    return false;
  }

  /**
   * Emit an event to all subscribers
   */
  protected emit(event: ProtocolEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[${this.type}] Error in event handler:`, error);
      }
    }
  }

  /**
   * Update connection state and emit event
   */
  protected setConnectionState(state: ProtocolConnectionState): void {
    const previousState = this._connectionState;
    this._connectionState = state;

    if (previousState !== state) {
      this.emit({
        type: state === 'connected' ? 'connected' : 'disconnected',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle reconnection logic
   */
  protected async handleReconnect(): Promise<void> {
    if (!this.config.autoReconnect) {
      return;
    }

    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      this.setConnectionState('error');
      this.emit({
        type: 'error',
        error: new Error('Max reconnection attempts reached'),
        timestamp: new Date(),
      });
      return;
    }

    this.setConnectionState('reconnecting');
    this.reconnectAttempts++;

    const delay =
      this.config.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
      this.reconnectAttempts = 0;
    } catch (error) {
      await this.handleReconnect();
    }
  }

  /**
   * Build headers for HTTP requests
   */
  protected buildHeaders(
    additionalHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return { ...headers, ...additionalHeaders };
  }

  /**
   * Create abort signal with timeout
   */
  protected createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.config.timeout || 30000);
  }
}
