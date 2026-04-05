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
 * @module protocols/VercelAIAdapter
 */

import type { ProtocolAdapterConfig } from '../types/protocol';
import type { ChatMessage } from '../types/messages';
import type { ToolDefinition, ToolExecutionResult } from '../types/tools';
import { generateMessageId, createAssistantMessage } from '../types/messages';
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
  readonly protocol = 'vercel-ai' as const;
  readonly protocolTransport = 'sse' as const;

  private vercelConfig: VercelAIAdapterConfig;
  private abortController: AbortController | null = null;
  private currentRequestId: string | null = null;

  // Frontend tool continuation state (modelled after AGUIAdapter)
  private pendingToolCalls: Map<
    string,
    { toolCallId: string; toolName: string; args: Record<string, unknown> }
  > = new Map();
  private collectedToolResults: Map<
    string,
    {
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result: ToolExecutionResult;
    }
  > = new Map();
  // Store conversation history for continuation
  private messageHistory: Array<{
    id: string;
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [];
  private lastAssistantText = '';
  private lastTools: ToolDefinition[] = [];
  private lastFrontendToolNames: Set<string> = new Set();
  private isContinuation = false;

  // Metadata for ALL deferred tool calls (frontend + approval), keyed by toolCallId.
  // Unlike pendingToolCalls (which only tracks frontend tools for batching),
  // this preserves tool name/args for approval tools so sendToolResult can
  // build a correct continuation message.
  private deferredToolMeta: Map<
    string,
    { toolCallId: string; toolName: string; args: Record<string, unknown> }
  > = new Map();

  // Stream parsing depth — prevents premature continuations
  private _streamParsingDepth = 0;
  private _streamDonePromise: Promise<void> | null = null;
  private _streamDoneResolve: (() => void) | null = null;

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
      /** Pre-built Vercel AI message array for continuation requests */
      _vercelMessages?: Array<{
        id: string;
        role: string;
        parts: Array<Record<string, unknown>>;
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

    // Store tools for potential continuation
    if (options?.tools) {
      this.lastTools = options.tools;
      this.lastFrontendToolNames = new Set(
        options.tools
          .map(t => t?.name)
          .filter((name): name is string => Boolean(name)),
      );
    } else {
      this.lastFrontendToolNames = new Set();
    }

    // Reset assistant content tracking for fresh (non-continuation) messages
    if (!this.isContinuation) {
      this.lastAssistantText = '';
      this.deferredToolMeta.clear();
    }

    try {
      let vercelMessages: Array<{
        id: string;
        role: string;
        parts: Array<Record<string, unknown>>;
      }>;

      if (options?._vercelMessages) {
        // Continuation: use pre-built messages
        vercelMessages = options._vercelMessages;
      } else {
        // Use full message history if provided, otherwise just the new message
        const allMessages = options?.messages || [message];

        vercelMessages = allMessages.map(msg => {
          const messageContent =
            typeof msg.content === 'string'
              ? msg.content
              : String(msg.content ?? '');

          const parts: Array<Record<string, unknown>> = [
            {
              type: 'text' as const,
              text: messageContent,
            },
          ];

          // For assistant messages with tool calls, add tool-invocation parts
          if (
            msg.role === 'assistant' &&
            msg.toolCalls &&
            msg.toolCalls.length > 0
          ) {
            for (const tc of msg.toolCalls) {
              parts.push({
                type: 'tool-invocation',
                toolInvocationId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args,
                state: 'result',
                result: tc.result,
              });
            }
          }

          return {
            id: msg.id,
            role: msg.role,
            parts,
          };
        });

        // For tool-result messages, add them as separate tool parts
        // (handled inline above via toolCalls on assistant messages)
      }

      // Store message history for continuation
      if (!this.isContinuation) {
        this.messageHistory = [...vercelMessages];
      } else {
        this.messageHistory = [...vercelMessages];
      }

      // Build Vercel AI request
      const requestBody = {
        id: requestId,
        messages: vercelMessages,
        // Required for pydantic-ai deferred tool approval continuations.
        // sdkVersion 6 enables parsing approval-responded tool parts.
        sdkVersion: 6 as const,
        trigger: 'submit-message' as const,
        ...(options?.tools && { tools: options.tools }),
        ...(options?.model && { model: options.model }),
        ...(options?.builtinTools &&
          options.builtinTools.length > 0 && {
            builtinTools: options.builtinTools,
          }),
        ...(options?.skills &&
          options.skills.length > 0 && {
            skills: options.skills,
          }),
        ...(options?.identities &&
          options.identities.length > 0 && {
            identities: options.identities,
          }),
      };

      if (options?.tools && options.tools.length > 0) {
        console.log(
          '[VercelAIAdapter] Sending with frontend tools:',
          options.tools.map((t: { name: string }) => t.name),
        );
      } else {
        console.log('[VercelAIAdapter] No frontend tools in request');
      }

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
    const pendingToolInputs = new Map<
      string,
      {
        toolName?: string;
        inputText: string;
      }
    >();
    let doneEmitted = false;

    // Consume the continuation flag — set by sendToolResult for this call only
    this.isContinuation = false;

    // Track stream parsing depth for sendToolResult synchronisation
    if (this._streamParsingDepth === 0) {
      this._streamDonePromise = new Promise<void>(resolve => {
        this._streamDoneResolve = resolve;
      });
    }
    this._streamParsingDepth++;

    const emitDoneOnce = () => {
      if (doneEmitted) return;
      // Don't emit 'done' if there are pending frontend tool calls
      // — the continuation triggered by sendToolResult will do it later
      if (this.pendingToolCalls.size > 0) return;
      doneEmitted = true;
      this.emit({
        type: 'done',
        timestamp: new Date(),
      });
    };

    const normalizeToolArgs = (
      rawArgs: unknown,
      fallbackText = '',
    ): Record<string, unknown> => {
      if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
        return rawArgs as Record<string, unknown>;
      }

      const asText =
        typeof rawArgs === 'string' && rawArgs.trim().length > 0
          ? rawArgs
          : fallbackText;

      if (!asText.trim()) {
        return {};
      }

      try {
        const parsed = JSON.parse(asText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Keep empty args if we can't parse structured input.
      }

      return {};
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended - emit final message if we have accumulated text
          if (accumulatedText) {
            this.lastAssistantText = accumulatedText;
            const message = createAssistantMessage(accumulatedText);
            message.id = currentMessageId;
            this.emit({
              type: 'message',
              message,
              timestamp: new Date(),
            });
          }
          emitDoneOnce();
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
                this.lastAssistantText = accumulatedText;
                const message = createAssistantMessage(accumulatedText);
                message.id = currentMessageId;
                this.emit({
                  type: 'message',
                  message,
                  timestamp: new Date(),
                });
              }
              emitDoneOnce();
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
              } else if (
                event.type === 'finish' ||
                event.type === 'end-step' ||
                event.type === 'finish-step'
              ) {
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

                const finishReason = String(
                  event.finishReason || event.finish_reason || '',
                ).toLowerCase();
                if (
                  event.type === 'finish' &&
                  (finishReason === 'tool-calls' ||
                    finishReason === 'tool_calls') &&
                  pendingToolInputs.size > 0
                ) {
                  // Only emit pending_approval for tool calls that are NOT in
                  // pendingToolCalls (i.e., server-side tools waiting for approval,
                  // not frontend tools that will be handled by sendToolResult)
                  for (const [toolCallId] of pendingToolInputs.entries()) {
                    if (!this.pendingToolCalls.has(toolCallId)) {
                      this.emit({
                        type: 'tool-result',
                        toolResult: {
                          toolCallId,
                          success: true,
                          result: {
                            pending_approval: true,
                            message: 'Awaiting user approval',
                          },
                        },
                        timestamp: new Date(),
                      });
                    }
                  }
                }

                if (event.type === 'finish') {
                  emitDoneOnce();
                }
              } else if (event.type === 'tool-input-start') {
                const toolCallId =
                  event.toolCallId ||
                  event.tool_call_id ||
                  event.id ||
                  generateMessageId();
                const toolName =
                  event.toolName ||
                  event.tool_name ||
                  event.name ||
                  event.tool?.name;

                pendingToolInputs.set(toolCallId, {
                  toolName,
                  inputText: '',
                });
              } else if (event.type === 'tool-input-delta') {
                const toolCallId =
                  event.toolCallId || event.tool_call_id || event.id;
                if (toolCallId && pendingToolInputs.has(toolCallId)) {
                  const existing = pendingToolInputs.get(toolCallId);
                  if (existing) {
                    existing.inputText += event.inputTextDelta || '';
                    pendingToolInputs.set(toolCallId, existing);
                  }
                }
              } else if (event.type === 'tool-input-available') {
                const toolCallId =
                  event.toolCallId ||
                  event.tool_call_id ||
                  event.id ||
                  generateMessageId();
                const pending = pendingToolInputs.get(toolCallId);
                const toolName =
                  event.toolName ||
                  event.tool_name ||
                  event.name ||
                  pending?.toolName ||
                  event.tool?.name;
                const args = normalizeToolArgs(
                  event.input || event.args || event.arguments,
                  pending?.inputText || '',
                );

                if (toolName) {
                  // Emit tool-call for all tools so UI can render a tool entry.
                  // Only client-declared frontend tools should participate in
                  // frontend continuation batching via pendingToolCalls.
                  this.emit({
                    type: 'tool-call',
                    toolCall: {
                      toolCallId,
                      toolName,
                      args,
                    },
                    timestamp: new Date(),
                  });

                  // Track metadata for ALL deferred tools so sendToolResult
                  // can build proper continuation messages (tool name + args).
                  this.deferredToolMeta.set(toolCallId, {
                    toolCallId,
                    toolName,
                    args,
                  });

                  if (this.lastFrontendToolNames.has(toolName)) {
                    this.pendingToolCalls.set(toolCallId, {
                      toolCallId,
                      toolName,
                      args,
                    });
                  }
                }
              } else if (event.type === 'tool-output-available') {
                const toolCallId =
                  event.toolCallId ||
                  event.tool_call_id ||
                  event.id ||
                  generateMessageId();
                const output =
                  event.output ?? event.result ?? event.data ?? event.content;

                this.emit({
                  type: 'tool-result',
                  toolResult: {
                    toolCallId,
                    success: true,
                    result: output,
                  },
                  timestamp: new Date(),
                });

                pendingToolInputs.delete(toolCallId);
                // Server already executed this tool — remove from pending
                // frontend tool calls so emitDoneOnce is not blocked.
                this.pendingToolCalls.delete(toolCallId);
                this.deferredToolMeta.delete(toolCallId);
              } else if (
                event.type === 'tool-output-error' ||
                event.type === 'tool-error'
              ) {
                const toolCallId =
                  event.toolCallId ||
                  event.tool_call_id ||
                  event.id ||
                  generateMessageId();
                const errorMessage =
                  event.error ||
                  event.errorText ||
                  event.message ||
                  'Tool error';

                // Server handled the error — clear from pending frontend
                // tool calls so emitDoneOnce is not blocked.
                this.pendingToolCalls.delete(toolCallId);
                this.deferredToolMeta.delete(toolCallId);

                this.emit({
                  type: 'tool-result',
                  toolResult: {
                    toolCallId,
                    success: false,
                    error: errorMessage,
                    result: event.output ?? event.result,
                  },
                  timestamp: new Date(),
                });

                pendingToolInputs.delete(toolCallId);
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
              } else if (
                event.type === 'tool-call' ||
                event.type === 'tool-call-start' ||
                event.type === 'tool-approval-request'
              ) {
                const toolName =
                  event.toolName ||
                  event.tool_name ||
                  event.name ||
                  event.tool?.name;
                const args =
                  normalizeToolArgs(
                    event.args ||
                      event.arguments ||
                      event.input ||
                      event.tool?.arguments,
                  ) || {};
                const toolCallId =
                  event.toolCallId ||
                  event.tool_call_id ||
                  event.id ||
                  generateMessageId();

                if (toolName) {
                  this.emit({
                    type: 'tool-call',
                    toolCall: {
                      toolCallId,
                      toolName,
                      args,
                    },
                    timestamp: new Date(),
                  });
                }
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
      this._streamParsingDepth--;
      if (this._streamParsingDepth === 0) {
        const resolve = this._streamDoneResolve;
        this._streamDonePromise = null;
        this._streamDoneResolve = null;
        resolve?.();
      }
    }
  }

  /**
   * Send tool result back and continue the conversation.
   *
   * When the agent makes multiple frontend tool calls in a single run, each
   * call triggers an independent async execution in ChatBase. This method
   * batches the results: it stores each result as it arrives and only sends
   * ONE continuation request once ALL pending tool calls have been resolved.
   */
  async sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void> {
    // 1. Emit local event for UI updates
    this.emit({
      type: 'tool-result',
      toolResult: result,
      timestamp: new Date(),
    });

    // 2. Retrieve tool metadata from pending map (frontend tools) or
    //    deferred tool meta (approval / all deferred tools).
    const pendingToolCall =
      this.pendingToolCalls.get(toolCallId) ??
      this.deferredToolMeta.get(toolCallId);
    if (!pendingToolCall) {
      console.warn(
        '[VercelAIAdapter] No pending tool call found for ID:',
        toolCallId,
      );
    }
    const toolName = pendingToolCall?.toolName ?? 'unknown';
    const toolArgs = pendingToolCall?.args ?? {};

    // 3. Collect this result (batching)
    this.collectedToolResults.set(toolCallId, {
      toolCallId,
      toolName,
      args: toolArgs,
      result,
    });

    // 4. Check whether ALL pending tool calls now have results
    let allResolved = Array.from(this.pendingToolCalls.keys()).every(id =>
      this.collectedToolResults.has(id),
    );

    if (!allResolved) {
      return;
    }

    // 4b. Guard against premature continuations while stream is still parsing
    if (this._streamParsingDepth > 0 && this._streamDonePromise) {
      await this._streamDonePromise;
      allResolved = Array.from(this.pendingToolCalls.keys()).every(id =>
        this.collectedToolResults.has(id),
      );
      if (!allResolved) {
        return;
      }
    }

    // ── All tool results collected — build ONE continuation request ──

    // 5. Build an assistant message with DynamicToolUIParts (output-available)
    const assistantParts: Array<Record<string, unknown>> = [];

    // Include the assistant text if any was produced before tool calls
    if (this.lastAssistantText) {
      assistantParts.push({
        type: 'text',
        text: this.lastAssistantText,
        state: 'done',
      });
    }

    // Add each tool call with its result as a dynamic-tool part.
    // pydantic-ai parses DynamicTool* parts with output-available / output-error
    // and approval-responded states for deferred approval continuations.
    for (const tr of this.collectedToolResults.values()) {
      const resultObj =
        tr.result.result && typeof tr.result.result === 'object'
          ? (tr.result.result as Record<string, unknown>)
          : undefined;
      const isApprovalDecision =
        !!resultObj && typeof resultObj.approved === 'boolean';

      if (isApprovalDecision) {
        const approvalId =
          typeof resultObj?.approvalId === 'string'
            ? resultObj.approvalId
            : tr.toolCallId;
        const approved = Boolean(resultObj?.approved);
        const reason =
          typeof resultObj?.message === 'string' ? resultObj.message : undefined;

        assistantParts.push({
          type: 'dynamic-tool',
          toolName: tr.toolName,
          toolCallId: tr.toolCallId,
          state: 'approval-responded',
          input: tr.args,
          approval: {
            id: approvalId,
            approved,
            ...(reason ? { reason } : {}),
          },
        });
      } else if (tr.result.success) {
        assistantParts.push({
          type: 'dynamic-tool',
          toolName: tr.toolName,
          toolCallId: tr.toolCallId,
          state: 'output-available',
          input: tr.args,
          output: tr.result.result,
        });
      } else {
        assistantParts.push({
          type: 'dynamic-tool',
          toolName: tr.toolName,
          toolCallId: tr.toolCallId,
          state: 'output-error',
          input: tr.args,
          errorText: tr.result.error ?? 'Tool execution failed',
        });
      }
    }

    const assistantMessage = {
      id: generateMessageId(),
      role: 'assistant',
      parts: assistantParts,
    };

    // 6. Build full continuation messages
    const continuationMessages = [...this.messageHistory, assistantMessage];

    // 7. Clear batching state BEFORE the async sendMessage call
    this.pendingToolCalls.clear();
    this.collectedToolResults.clear();
    this.deferredToolMeta.clear();

    // 8. Update stored message history
    this.messageHistory = continuationMessages;

    // 9. Mark as continuation
    this.isContinuation = true;

    // 10. Send ONE continuation request with all tool results
    const dummyMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: '',
      createdAt: new Date(),
    };

    await this.sendMessage(dummyMessage, {
      _vercelMessages: continuationMessages,
      tools: this.lastTools,
      threadId: this.currentRequestId ?? undefined,
    });
  }

  /**
   * Request permission (not supported in Vercel AI)
   */
  async requestPermission(_permission: string): Promise<boolean> {
    return true;
  }

  /**
   * Check feature support
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = [
      'streaming',
      'tools',
      'frontend-tools',
      'backend-tools',
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * Stop generation
   */
  stopGeneration(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
