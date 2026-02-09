/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Vercel AI protocol adapter using SSE transport.
 * Implements Pydantic AI's Vercel AI Data Stream Protocol.
 *
 * @see https://ai.pydantic.dev/ui/vercel-ai/
 *
 * @module components/chat/protocols/VercelAIAdapter
 */

import type { ProtocolAdapterConfig } from '../types/protocol';
import type { ChatMessage } from '../types/message';
import type { ToolDefinition, ToolExecutionResult } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';

/**
 * Vercel AI specific configuration
 */
export interface VercelAIAdapterConfig extends ProtocolAdapterConfig {
  /** Agent ID */
  agentId?: string;

  /** Custom headers for requests (e.g., for Jupyter authentication) */
  headers?: Record<string, string>;

  /** Custom fetch options */
  fetchOptions?: {
    /** Request mode */
    mode?: RequestMode;
    /** Credentials mode */
    credentials?: RequestCredentials;
  };
}

/**
 * Vercel AI protocol adapter
 * Uses HTTP POST with SSE streaming for responses
 * Compatible with Pydantic AI's Vercel AI Data Stream Protocol
 */
export class VercelAIAdapter extends BaseProtocolAdapter {
  readonly type = 'vercel-ai' as const;
  readonly transport = 'sse' as const;

  private vercelConfig: VercelAIAdapterConfig;
  private abortController: AbortController | null = null;
  private currentRequestId: string | null = null;

  constructor(config: VercelAIAdapterConfig) {
    super(config);
    this.vercelConfig = config;
  }

  /**
   * Connect to Vercel AI endpoint (SSE doesn't require persistent connection)
   */
  async connect(): Promise<void> {
    this.setConnectionState('connecting');
    // Vercel AI uses SSE, no persistent connection needed
    // Just mark as connected
    this.setConnectionState('connected');
  }

  /**
   * Disconnect and terminate any ongoing request
   */
  disconnect(): void {
    this.abortController?.abort();
    this.abortController = null;

    // Send terminate request to backend if we have a request ID
    if (this.currentRequestId) {
      this.terminateRequest(this.currentRequestId).catch(err => {
        console.warn('[VercelAIAdapter] Failed to terminate request:', err);
      });
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Terminate a running request on the backend
   */
  async terminateRequest(requestId?: string): Promise<void> {
    try {
      // Derive the terminate endpoint from the base URL
      const baseUrl = new URL(this.vercelConfig.baseUrl);
      const terminateUrl = `${baseUrl.origin}/api/v1/vercel-ai/terminate`;

      const response = await fetch(terminateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_id: requestId || this.currentRequestId,
        }),
      });

      if (!response.ok) {
        console.warn(
          `[VercelAIAdapter] Terminate request failed: ${response.status}`,
        );
      } else {
        // Consume the response (terminate result)
        await response.json();
      }
    } catch {
      // Ignore errors - request may have already completed
    }
  }

  /**
   * Send a message using Vercel AI Data Stream Protocol
   */
  async sendMessage(
    message: ChatMessage,
    options?: {
      tools?: ToolDefinition[];
      threadId?: string;
      metadata?: Record<string, unknown>;
      /** Model to use for this request (overrides agent default) */
      model?: string;
      /** Full conversation history to send with the message */
      messages?: ChatMessage[];
      /** Builtin tools / MCP tools to enable for this request */
      builtinTools?: string[];
      /** Skills to enable for this request */
      skills?: string[];
      /** Connected identities with access tokens for skill execution */
      identities?: Array<{
        provider: string;
        accessToken?: string;
      }>;
    },
  ): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    // Generate request ID for tracking
    const requestId = options?.threadId || generateMessageId();
    this.currentRequestId = requestId;

    try {
      // Extract the message content as a string
      const messageContent =
        typeof message.content === 'string'
          ? message.content
          : String(message.content);

      // Build single message in Vercel AI SDK format
      const vercelMessage = {
        id: message.id,
        role: message.role,
        parts: [
          {
            type: 'text',
            text: messageContent,
          },
        ],
      };

      // Build Vercel AI request
      const requestBody = {
        id: requestId, // Run ID for tracking
        messages: [vercelMessage],
        trigger: 'submit-message',
        // Optional fields based on Pydantic AI's Vercel adapter
        ...(options?.tools && { tools: options.tools }),
        // Model override for per-request model selection
        ...(options?.model && { model: options.model }),
        // Builtin tools / MCP tools to enable
        ...(options?.builtinTools &&
          options.builtinTools.length > 0 && {
            builtinTools: options.builtinTools,
          }),
        // Skills to enable
        ...(options?.skills &&
          options.skills.length > 0 && {
            skills: options.skills,
          }),
        // Connected identities with access tokens
        ...(options?.identities &&
          options.identities.length > 0 && {
            identities: options.identities,
          }),
      };

      if (options?.model) {
        console.log('[VercelAIAdapter] Sending with model:', options.model);
      }

      if (options?.builtinTools && options.builtinTools.length > 0) {
        console.log(
          '[VercelAIAdapter] Sending with builtinTools:',
          options.builtinTools,
        );
      }

      if (options?.skills && options.skills.length > 0) {
        console.log('[VercelAIAdapter] Sending with skills:', options.skills);
      }

      if (options?.identities && options.identities.length > 0) {
        console.log(
          '[VercelAIAdapter] Sending with identities:',
          options.identities.map(i => i.provider),
        );
      }

      // Merge custom headers with defaults
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...this.vercelConfig.headers,
      };

      // Add auth token if provided
      if (this.vercelConfig.authToken) {
        headers['Authorization'] = `token ${this.vercelConfig.authToken}`;
      }

      const response = await fetch(this.vercelConfig.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
        mode: this.vercelConfig.fetchOptions?.mode,
        credentials: this.vercelConfig.fetchOptions?.credentials,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Parse SSE stream
      await this.parseSSEStream(response.body);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('[VercelAIAdapter] Send error:', error);
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Parse SSE stream from Vercel AI
   */
  private async parseSSEStream(
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentMessageId = generateMessageId();
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended - emit final message if we have accumulated text
          if (accumulatedText) {
            const message = createAssistantMessage(accumulatedText);
            message.id = currentMessageId;
            this.emit({
              type: 'message',
              message,
              timestamp: new Date(),
            });
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) {
            continue;
          }

          // Log raw line for debugging
          console.debug('[VercelAIAdapter] SSE line:', line);

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              // Stream complete
              if (accumulatedText) {
                const message = createAssistantMessage(accumulatedText);
                message.id = currentMessageId;
                this.emit({
                  type: 'message',
                  message,
                  timestamp: new Date(),
                });
              }
              break;
            }

            try {
              const event = JSON.parse(data);
              console.debug('[VercelAIAdapter] Parsed event:', event);

              // Handle Vercel AI event types
              // Server sends: {"type":"text-delta","delta":"Hello","id":"..."}
              if (event.type === 'text-delta' && event.delta) {
                accumulatedText += event.delta;
                // Emit 'message' event with accumulated content for useChat
                const message = createAssistantMessage(accumulatedText);
                message.id = currentMessageId;
                this.emit({
                  type: 'message',
                  message,
                  timestamp: new Date(),
                });
              } else if (event.type === 'text-start') {
                // New text block starting
                currentMessageId = event.id || generateMessageId();
                accumulatedText = '';
              } else if (event.type === 'finish' || event.type === 'end-step') {
                if (accumulatedText) {
                  const message = createAssistantMessage(accumulatedText);
                  message.id = currentMessageId;
                  this.emit({
                    type: 'message',
                    message,
                    timestamp: new Date(),
                  });
                }
                // Extract and emit usage data from finish events
                if (event.usage) {
                  const usage = event.usage as {
                    promptTokens?: number;
                    completionTokens?: number;
                    totalTokens?: number;
                  };
                  this.emit({
                    type: 'message',
                    usage: {
                      promptTokens: usage.promptTokens ?? 0,
                      completionTokens: usage.completionTokens ?? 0,
                      totalTokens:
                        usage.totalTokens ??
                        (usage.promptTokens ?? 0) +
                          (usage.completionTokens ?? 0),
                    },
                    timestamp: new Date(),
                  });
                }
              } else if (event.type === 'error') {
                const errorMessage =
                  event.error ||
                  event.errorText ||
                  event.message ||
                  event.detail ||
                  'Unknown server error';
                console.error('[VercelAIAdapter] Server error event:', event);
                this.emit({
                  type: 'error',
                  error: new Error(errorMessage),
                  timestamp: new Date(),
                });
              }
            } catch (parseError) {
              console.error(
                '[VercelAIAdapter] Failed to parse SSE data:',
                parseError,
              );
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Send tool result (not supported in Vercel AI adapter)
   */
  async sendToolResult(
    _toolCallId: string,
    _result: ToolExecutionResult,
  ): Promise<void> {
    throw new Error('Tool result not supported in Vercel AI adapter');
  }

  /**
   * Request permission (not supported in Vercel AI)
   */
  async requestPermission(_permission: string): Promise<boolean> {
    return true;
  }

  /**
   * Stop generation
   */
  stopGeneration(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
