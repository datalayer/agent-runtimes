/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2A (Agent-to-Agent) protocol adapter using SSE transport.
 *
 * @module components/chat/protocols/A2AAdapter
 */

import type { ProtocolAdapterConfig, AgentCard } from '../types/protocol';
import type { ChatMessage } from '../types/message';
import type { ToolDefinition, ToolExecutionResult } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';

/**
 * A2A specific configuration
 */
export interface A2AAdapterConfig extends ProtocolAdapterConfig {
  /** Agent URL for .well-known/agent.json discovery */
  agentUrl?: string;

  /** Enable A2UI extension */
  enableA2UI?: boolean;
}

/**
 * A2A protocol adapter
 * Uses JSON-RPC 2.0 with SSE streaming for responses
 */
export class A2AAdapter extends BaseProtocolAdapter {
  readonly type = 'a2a' as const;
  readonly transport = 'sse' as const;

  private a2aConfig: A2AAdapterConfig;
  private abortController: AbortController | null = null;
  private agentCard: AgentCard | null = null;
  private currentTaskId: string | null = null;

  constructor(config: A2AAdapterConfig) {
    super(config);
    this.a2aConfig = {
      enableA2UI: true,
      ...config,
    };
  }

  /**
   * Connect and discover agent card
   */
  async connect(): Promise<void> {
    this.setConnectionState('connecting');

    try {
      // Fetch agent card from .well-known endpoint
      const agentUrl = this.a2aConfig.agentUrl || this.a2aConfig.baseUrl;
      const wellKnownUrl = new URL(
        '/.well-known/agent.json',
        agentUrl,
      ).toString();

      const response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: this.createTimeoutSignal(),
      });

      if (response.ok) {
        this.agentCard = await response.json();
      }

      this.setConnectionState('connected');
    } catch (error) {
      console.warn('[A2AAdapter] Could not fetch agent card:', error);
      // Still mark as connected, card is optional
      this.setConnectionState('connected');
    }
  }

  /**
   * Disconnect and terminate any ongoing agent execution
   */
  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Send terminate request to backend if we have a task ID
    if (this.currentTaskId) {
      this.terminateTask(this.currentTaskId).catch(err => {
        console.warn('[A2AAdapter] Failed to terminate task:', err);
      });
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Terminate a running task on the backend
   */
  async terminateTask(taskId?: string): Promise<void> {
    try {
      // Derive the terminate endpoint from the base URL
      const baseUrl = new URL(this.a2aConfig.baseUrl);
      const terminateUrl = `${baseUrl.origin}/api/v1/a2a/terminate`;

      const response = await fetch(terminateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: taskId || this.currentTaskId,
        }),
      });

      if (!response.ok) {
        console.warn(
          `[A2AAdapter] Terminate request failed: ${response.status}`,
        );
      } else {
        const result = await response.json();
        console.debug('[A2AAdapter] Terminate result:', result);
      }
    } catch (err) {
      // Ignore errors - task may have already completed
      console.debug('[A2AAdapter] Terminate request error:', err);
    }
  }

  /**
   * Get agent card
   */
  async getAgentCard(): Promise<AgentCard | null> {
    return this.agentCard;
  }

  /**
   * Send a message through A2A protocol
   */
  async sendMessage(
    message: ChatMessage,
    options?: {
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
    this.abortController = new AbortController();

    const taskId =
      options?.threadId || this.currentTaskId || generateMessageId();
    this.currentTaskId = taskId;

    // Build A2A message parts (A2A uses 'kind' discriminator, not 'type')
    const parts: Array<{ kind: string; text?: string; data?: unknown }> = [];

    if (typeof message.content === 'string') {
      parts.push({ kind: 'text', text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          parts.push({ kind: 'text', text: part.text });
        } else if (part.type === 'activity') {
          parts.push({ kind: 'data', data: part.data });
        }
      }
    }

    // Build metadata with model and identities
    const metadata: Record<string, unknown> = {};
    if (options?.model) {
      metadata.model = options.model;
    }
    if (options?.identities && options.identities.length > 0) {
      metadata.identities = options.identities;
    }

    // Build JSON-RPC request with A2A message format
    // Use message/stream for SSE streaming responses
    const messageId = generateMessageId();
    const jsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'message/stream',
      params: {
        message: {
          kind: 'message',
          messageId,
          role: message.role,
          parts,
        },
        configuration: {
          acceptedOutputModes: ['text', 'text/plain'],
          requestedExtensions: this.a2aConfig.enableA2UI ? ['a2ui'] : [],
          // Model override for per-request model selection
          // Note: fasta2a/pydantic-ai A2A doesn't currently support per-request model override
          // The model is configured at agent creation time
          ...(options?.model && { model: options.model }),
        },
        // Also send metadata with model and identities
        ...(Object.keys(metadata).length > 0 && { metadata }),
      },
      id: taskId,
    };

    if (options?.model) {
      console.log(
        '[A2AAdapter] Sending with model:',
        options.model,
        '(Note: A2A uses agent-level model, not per-request)',
      );
    }

    if (options?.identities && options.identities.length > 0) {
      console.log(
        '[A2AAdapter] Sending with identities:',
        options.identities.map(i => i.provider),
      );
    }

    try {
      const response = await fetch(this.a2aConfig.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders({
          Accept: 'text/event-stream, application/json',
        }),
        body: JSON.stringify(jsonRpcRequest),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `A2A request failed: ${response.status} ${response.statusText}`,
        );
      }

      // Check content type to decide how to parse
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Parse SSE stream
        await this.parseSSEStream(response);
      } else {
        // Parse as JSON response
        const jsonResponse = await response.json();
        console.log(
          '[A2AAdapter] JSON response:',
          JSON.stringify(jsonResponse, null, 2),
        );
        this.handleA2AEvent(jsonResponse);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      this.emit({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Send tool result back
   */
  async sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void> {
    // A2A tool results are sent as data parts
    this.emit({
      type: 'tool-result',
      toolResult: result,
      timestamp: new Date(),
    });
  }

  /**
   * Check feature support
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = [
      'streaming',
      'agent-discovery',
      'a2ui',
      'activity-messages',
      'multi-agent',
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * Parse SSE stream from A2A response
   */
  private async parseSSEStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            try {
              const event = JSON.parse(data);
              this.handleA2AEvent(event);
            } catch (e) {
              console.warn('[A2AAdapter] Failed to parse event data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle A2A protocol events
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleA2AEvent(event: any): void {
    console.log('[A2AAdapter] Received event:', JSON.stringify(event, null, 2));

    // Handle JSON-RPC response
    if (event.result) {
      this.handleTaskUpdate(event.result);
    } else if (event.error) {
      this.emit({
        type: 'error',
        error: new Error(event.error.message || 'A2A error'),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle task update from A2A
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleTaskUpdate(task: any): void {
    console.log(
      '[A2AAdapter] Handling task update:',
      JSON.stringify(task, null, 2),
    );

    // Handle different event kinds in SSE streaming
    const eventKind = task.kind;

    // Handle direct message events (from streaming)
    if (eventKind === 'message' && task.role === 'agent') {
      this.processA2AMessage(task);
      return;
    }

    // Handle status updates
    if (eventKind === 'status-update') {
      const state = task.status?.state;
      console.log('[A2AAdapter] Status update:', state, 'final:', task.final);

      if (
        task.final &&
        (state === 'completed' || state === 'failed' || state === 'canceled')
      ) {
        this.emit({
          type: 'state-update',
          data: { state, final: true },
          timestamp: new Date(),
        });
      }
      return;
    }

    // Handle artifact updates
    if (eventKind === 'artifact-update') {
      console.log('[A2AAdapter] Artifact update:', task.artifact);
      // Artifacts contain the final result, but we already process messages
      // Could emit as activity if needed
      return;
    }

    // Handle task events (initial task submission response)
    if (eventKind === 'task') {
      // Store task ID for potential cancellation
      if (task.id) {
        this.currentTaskId = task.id;
      }

      // A2A uses 'history' for message history
      const messages = task.history || task.messages || [];

      // Process messages, but skip user messages (we already have them)
      for (const msg of messages) {
        if (
          msg.role === 'assistant' ||
          msg.role === 'model' ||
          msg.role === 'agent'
        ) {
          this.processA2AMessage(msg);
        }
      }
      return;
    }

    // Fallback: Check for legacy format
    const messages = task.history || task.messages || [];

    // Process messages, but skip user messages (we already have them)
    for (const msg of messages) {
      if (
        msg.role === 'assistant' ||
        msg.role === 'model' ||
        msg.role === 'agent'
      ) {
        this.processA2AMessage(msg);
      }
    }

    // Check task status - it's an object with 'state' property
    const taskState =
      typeof task.status === 'object' ? task.status?.state : task.status;

    if (taskState === 'completed' && task.result) {
      this.emit({
        type: 'message',
        message: createAssistantMessage(
          typeof task.result === 'string'
            ? task.result
            : JSON.stringify(task.result),
        ),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process individual A2A message
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processA2AMessage(msg: any): void {
    console.log(
      '[A2AAdapter] Processing message:',
      JSON.stringify(msg, null, 2),
    );

    if (!msg.parts) return;

    let textContent = '';
    const activities: { type: string; data: unknown }[] = [];

    for (const part of msg.parts) {
      // A2A uses 'kind' discriminator, not 'type'
      const partKind = part.kind || part.type;

      if (partKind === 'text' && part.text) {
        textContent += part.text;
      } else if (partKind === 'data') {
        // Check for A2UI messages
        if (
          part.data?.beginRendering ||
          part.data?.surfaceUpdate ||
          part.data?.dataModelUpdate
        ) {
          activities.push({
            type: 'a2ui',
            data: part.data,
          });
        } else {
          activities.push({
            type: 'data',
            data: part.data,
          });
        }
      }
    }

    // Emit text message
    if (textContent) {
      console.log('[A2AAdapter] Emitting text message:', textContent);
      this.emit({
        type: 'message',
        message: createAssistantMessage(textContent),
        timestamp: new Date(),
      });
    }

    // Emit activity messages (including A2UI)
    for (const activity of activities) {
      this.emit({
        type: 'activity',
        activity,
        timestamp: new Date(),
      });
    }
  }
}
