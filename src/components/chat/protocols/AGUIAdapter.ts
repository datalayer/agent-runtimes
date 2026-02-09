/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AG-UI protocol adapter using SSE transport.
 *
 * @module components/chat/protocols/AGUIAdapter
 */

import type { ProtocolAdapterConfig, AGUI } from '../types/protocol';
import type { ChatMessage, ContentPart } from '../types/message';
import type { ToolDefinition, ToolExecutionResult } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';

/**
 * AG-UI specific configuration
 */
export interface AGUIAdapterConfig extends ProtocolAdapterConfig {
  /** Runtime URL (e.g., /api/copilotkit) */
  runtimeUrl?: string;
}

/**
 * AG-UI protocol adapter
 * Uses HTTP POST with SSE streaming for responses
 */
export class AGUIAdapter extends BaseProtocolAdapter {
  readonly type = 'ag-ui' as const;
  readonly transport = 'sse' as const;

  private aguiConfig: AGUIAdapterConfig;
  private abortController: AbortController | null = null;
  private currentThreadId: string | null = null;

  // Track in-progress tool calls to accumulate args and emit results
  private pendingToolCalls: Map<
    string,
    {
      toolCallId: string;
      toolName: string;
      argsJson: string;
    }
  > = new Map();

  // Store conversation history for tool result continuation
  private messageHistory: ChatMessage[] = [];
  private lastAssistantContent: string = '';
  private lastTools: ToolDefinition[] = [];

  constructor(config: AGUIAdapterConfig) {
    super(config);
    // Ensure baseUrl ends with trailing slash (required for mounted Starlette apps)
    this.aguiConfig = {
      ...config,
      baseUrl: config.baseUrl.endsWith('/')
        ? config.baseUrl
        : `${config.baseUrl}/`,
    };
  }

  /**
   * Connect to AG-UI endpoint (SSE doesn't require persistent connection)
   */
  async connect(): Promise<void> {
    this.setConnectionState('connecting');
    // AG-UI uses request-based SSE, no persistent connection needed
    // Just mark as connected - the actual endpoint will be verified on first message
    this.setConnectionState('connected');
  }

  /**
   * Disconnect and terminate any ongoing agent execution
   */
  disconnect(): void {
    // Abort any ongoing fetch request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Send terminate request to backend if we have a thread ID
    if (this.currentThreadId) {
      this.terminateAgent(this.currentThreadId).catch(err => {
        console.warn('[AGUIAdapter] Failed to terminate agent:', err);
      });
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Terminate a running agent thread on the backend
   */
  async terminateAgent(threadId?: string): Promise<void> {
    try {
      // Derive the terminate endpoint from the base URL
      // e.g., http://localhost:8765/api/v1/examples/agentic_chat -> http://localhost:8765/api/v1/ag-ui/terminate
      const baseUrl = new URL(this.aguiConfig.baseUrl);
      const terminateUrl = `${baseUrl.origin}/api/v1/ag-ui/terminate`;

      const response = await fetch(terminateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: threadId || this.currentThreadId,
        }),
      });

      if (!response.ok) {
        console.warn(
          `[AGUIAdapter] Terminate request failed: ${response.status}`,
        );
      }
      // else: Successfully terminated, no action needed
    } catch {
      // Ignore errors - agent may have already completed
    }
  }

  /**
   * Send a message through AG-UI protocol
   * @param message - The new message to send
   * @param options - Options including full message history
   */
  async sendMessage(
    message: ChatMessage,
    options?: {
      tools?: ToolDefinition[];
      threadId?: string;
      metadata?: Record<string, unknown>;
      /** Full conversation history to send with the message */
      messages?: ChatMessage[];
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

    const threadId =
      options?.threadId || this.currentThreadId || generateMessageId();
    this.currentThreadId = threadId;

    // Use full message history if provided, otherwise just the new message
    // AG-UI expects the complete conversation history
    const allMessages = options?.messages || [message];

    // Store message history and tools for potential tool result continuation
    this.messageHistory = [...allMessages];
    this.lastTools = options?.tools || [];
    this.lastAssistantContent = '';

    // Convert ChatMessages to AG-UI message format
    // AG-UI expects:
    // - Assistant messages with tool_calls array for tool invocations
    // - Tool messages with tool_call_id at top level (snake_case per OpenAI format)
    const aguiMessages = allMessages.map(msg => {
      const baseMessage: {
        id: string;
        role: string;
        content: string | ContentPart[] | null;
        tool_call_id?: string;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
      } = {
        id: msg.id,
        role: msg.role,
        content: msg.content,
      };

      // For tool messages, add the tool_call_id (snake_case for AG-UI/OpenAI format)
      if (msg.role === 'tool' && msg.metadata?.toolCallId) {
        baseMessage.tool_call_id = msg.metadata.toolCallId as string;
      }

      // For assistant messages with tool calls, convert to AG-UI format
      // Content should be null when there are tool calls (OpenAI format)
      if (
        msg.role === 'assistant' &&
        msg.toolCalls &&
        msg.toolCalls.length > 0
      ) {
        baseMessage.content =
          typeof msg.content === 'string' && msg.content.trim()
            ? msg.content
            : null;
        baseMessage.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.toolCallId,
          type: 'function',
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.args || {}),
          },
        }));
      }

      return baseMessage;
    });

    const runAgentInput: AGUI.RunAgentInput = {
      threadId,
      runId: generateMessageId(),
      messages: aguiMessages as ChatMessage[],
      state: null,
      tools: options?.tools || [],
      context: [],
      forwardedProps: null,
      // Include model for per-request model override
      ...(options?.model && { model: options.model }),
      // Include identities for tool execution with OAuth tokens
      ...(options?.identities &&
        options.identities.length > 0 && { identities: options.identities }),
    };

    if (options?.model) {
      console.log('[AGUIAdapter] Sending with model:', options.model);
    }
    if (options?.identities && options.identities.length > 0) {
      console.log(
        '[AGUIAdapter] Sending with identities:',
        options.identities.map(i => i.provider),
      );
    }

    try {
      const response = await fetch(this.aguiConfig.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders({
          Accept: 'text/event-stream',
        }),
        body: JSON.stringify(runAgentInput),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `AG-UI request failed: ${response.status} ${response.statusText}`,
        );
      }

      // Parse SSE stream
      await this.parseSSEStream(response);
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
   * Send tool result back through AG-UI and continue the conversation
   *
   * AG-UI requires tool results to be sent as a new request with the full
   * message history including the tool result as a message with role: "tool"
   */
  async sendToolResult(
    toolCallId: string,
    result: ToolExecutionResult,
  ): Promise<void> {
    // First emit local event for UI updates
    this.emit({
      type: 'tool-result',
      toolResult: result,
      timestamp: new Date(),
    });

    // Get the tool name and args from pending tool calls
    const pendingToolCall = this.pendingToolCalls.get(toolCallId);
    if (!pendingToolCall) {
      console.warn(
        '[AGUIAdapter] No pending tool call found for ID:',
        toolCallId,
      );
      console.log(
        '[AGUIAdapter] Pending tool calls:',
        Array.from(this.pendingToolCalls.keys()),
      );
    }
    const toolName = pendingToolCall?.toolName || 'unknown';

    // Parse the args safely
    let parsedArgs: Record<string, unknown> = {};
    if (pendingToolCall?.argsJson) {
      try {
        parsedArgs = JSON.parse(pendingToolCall.argsJson);
      } catch (e) {
        console.warn('[AGUIAdapter] Failed to parse tool args:', e);
      }
    }

    // Build the assistant message that contained the tool call
    // AG-UI expects assistant messages with tool_calls to potentially have empty content
    const assistantMessageWithToolCall: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: this.lastAssistantContent || '',
      createdAt: new Date(),
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          args: parsedArgs,
          status: 'completed',
        },
      ],
    };

    // Build the tool result message
    const toolResultMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'tool',
      content:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
      createdAt: new Date(),
      metadata: {
        toolCallId,
        toolName,
        isError: !result.success,
      },
    };

    // Build full message history for continuation
    const continuationMessages = [
      ...this.messageHistory,
      assistantMessageWithToolCall,
      toolResultMessage,
    ];

    // Update stored message history
    this.messageHistory = continuationMessages;

    // Send continuation request to get agent's response to the tool result
    // This will trigger a new SSE stream with the agent's response
    await this.sendMessage(toolResultMessage, {
      messages: continuationMessages,
      tools: this.lastTools,
      threadId: this.currentThreadId || undefined,
    });

    // Clear the pending tool call
    this.pendingToolCalls.delete(toolCallId);
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
      'activity-messages',
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * Parse SSE stream from AG-UI response
   */
  private async parseSSEStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentMessageId: string | null = null;
    let currentContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Event type (currently unused)
            // const eventType = line.slice(7);
            // Handle event type if needed
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);

            try {
              const event = JSON.parse(data) as AGUI.Event;
              this.handleAGUIEvent(
                event as unknown as Record<string, unknown>,
                {
                  getCurrentMessageId: () => currentMessageId,
                  setCurrentMessageId: id => {
                    currentMessageId = id;
                  },
                  getCurrentContent: () => currentContent,
                  appendContent: content => {
                    currentContent += content;
                  },
                  resetContent: () => {
                    currentContent = '';
                  },
                },
              );
            } catch (e) {
              // Non-JSON data, might be raw content
              console.warn('[AGUIAdapter] Failed to parse event data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle individual AG-UI events
   *
   * AG-UI event format:
   * - type: Event type (e.g., "TEXT_MESSAGE_CONTENT")
   * - timestamp: Event timestamp
   * - messageId: Message ID (for message events)
   * - delta: Content delta (for TEXT_MESSAGE_CONTENT)
   * - Other fields at top level, NOT nested in 'data'
   */
  private handleAGUIEvent(
    event: Record<string, unknown>,
    context: {
      getCurrentMessageId: () => string | null;
      setCurrentMessageId: (id: string) => void;
      getCurrentContent: () => string;
      appendContent: (content: string) => void;
      resetContent: () => void;
    },
  ): void {
    const eventType = event.type as string;

    switch (eventType) {
      case 'RUN_STARTED':
        context.setCurrentMessageId(generateMessageId());
        context.resetContent();
        break;

      case 'TEXT_MESSAGE_START': {
        const messageId = event.messageId as string | undefined;
        context.setCurrentMessageId(messageId || generateMessageId());
        context.resetContent();
        break;
      }

      case 'TEXT_MESSAGE_CONTENT': {
        // AG-UI sends delta at top level, not nested in data
        const delta = event.delta as string | undefined;
        if (delta) {
          context.appendContent(delta);
          const message = createAssistantMessage(context.getCurrentContent());
          message.id = context.getCurrentMessageId() || generateMessageId();
          this.emit({
            type: 'message',
            message,
            timestamp: new Date(),
          });
        }
        break;
      }

      case 'TEXT_MESSAGE_END': {
        const finalMessage = createAssistantMessage(
          context.getCurrentContent(),
        );
        finalMessage.id = context.getCurrentMessageId() || generateMessageId();
        // Store the assistant content for tool result continuation
        this.lastAssistantContent = context.getCurrentContent();
        this.emit({
          type: 'message',
          message: finalMessage,
          timestamp: new Date(),
        });
        break;
      }

      case 'TOOL_CALL_START': {
        // AG-UI protocol uses camelCase (toolCallId, toolCallName)
        const toolCallId =
          (event.toolCallId as string) ||
          (event.tool_call_id as string) ||
          generateMessageId();
        const toolName =
          (event.toolCallName as string) ||
          (event.tool_call_name as string) ||
          (event.name as string) ||
          '';

        // Initialize pending tool call
        this.pendingToolCalls.set(toolCallId, {
          toolCallId,
          toolName,
          argsJson: '',
        });

        this.emit({
          type: 'tool-call',
          toolCall: {
            toolCallId,
            toolName,
            args: {},
          },
          timestamp: new Date(),
        });
        break;
      }

      case 'TOOL_CALL_ARGS': {
        // Accumulate tool call arguments (streamed as JSON deltas)
        // AG-UI uses camelCase (toolCallId)
        const toolCallId =
          (event.toolCallId as string) || (event.tool_call_id as string);
        const delta = event.delta as string | undefined;

        if (toolCallId && delta && this.pendingToolCalls.has(toolCallId)) {
          const pending = this.pendingToolCalls.get(toolCallId);
          if (pending) {
            pending.argsJson += delta;
          }
        }
        break;
      }

      case 'TOOL_CALL_END': {
        // Tool call completed - emit tool-call event with accumulated args
        // AG-UI uses camelCase (toolCallId)
        const toolCallIdEnd =
          (event.toolCallId as string) || (event.tool_call_id as string);
        if (toolCallIdEnd && this.pendingToolCalls.has(toolCallIdEnd)) {
          const pending = this.pendingToolCalls.get(toolCallIdEnd);
          if (pending) {
            // Parse accumulated args JSON
            let parsedArgs: Record<string, unknown> = {};
            if (pending.argsJson) {
              try {
                parsedArgs = JSON.parse(pending.argsJson);
              } catch {
                // Keep empty if JSON parsing fails
              }
            }

            // Emit tool-call event with the parsed arguments
            // This updates the tool call with the complete args
            this.emit({
              type: 'tool-call',
              toolCall: {
                toolCallId: pending.toolCallId,
                toolName: pending.toolName,
                args: parsedArgs,
              },
              timestamp: new Date(),
            });
          }
        }
        break;
      }

      case 'TOOL_CALL_RESULT': {
        // Tool execution result with actual output
        // AG-UI uses camelCase (toolCallId)
        const toolCallId =
          (event.toolCallId as string) || (event.tool_call_id as string);
        let content = event.content as unknown;

        // Parse JSON content if it's a string
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch {
            // Keep as string if not valid JSON
          }
        }

        if (toolCallId) {
          // Check for execution errors in the result
          // ExecutionResult format: { execution_ok, execution_error, code_error, ... }
          const contentObj = content as Record<string, unknown> | undefined;
          const isError =
            contentObj?.execution_ok === false ||
            contentObj?.code_error != null ||
            (contentObj?.error != null && !contentObj?.success);
          const errorMessage =
            (contentObj?.execution_error as string) ||
            (contentObj?.error as string) ||
            (contentObj?.code_error
              ? `${(contentObj.code_error as { name?: string })?.name || 'Error'}: ${(contentObj.code_error as { value?: string })?.value || ''}`
              : undefined);

          // Emit tool result event with the actual content
          this.emit({
            type: 'tool-result',
            toolResult: {
              toolCallId,
              success: !isError,
              result: content,
              error: isError ? errorMessage : undefined,
            },
            timestamp: new Date(),
          });

          // Clean up
          this.pendingToolCalls.delete(toolCallId);
        }
        break;
      }

      case 'STATE_SNAPSHOT': {
        const state = event.snapshot;
        this.emit({
          type: 'state-update',
          data: state,
          timestamp: new Date(),
        });
        break;
      }

      case 'STATE_DELTA': {
        // State delta contains JSON Patch operations (RFC 6902)
        // Emit as state-update with the delta for the ChatBase to handle
        const delta = event.delta;
        this.emit({
          type: 'state-update',
          data: { __delta: delta },
          timestamp: new Date(),
        });
        break;
      }

      case 'CUSTOM': {
        const name = event.name as string | undefined;
        const value = event.value;
        this.emit({
          type: 'activity',
          activity: {
            type: name || 'custom',
            data: value,
          },
          timestamp: new Date(),
        });
        break;
      }

      case 'RUN_FINISHED': {
        // Run completed successfully — extract usage data if available
        const usage = event.usage as
          | {
              promptTokens?: number;
              completionTokens?: number;
              totalTokens?: number;
            }
          | undefined;
        if (usage) {
          this.emit({
            type: 'message',
            usage: {
              promptTokens: usage.promptTokens ?? 0,
              completionTokens: usage.completionTokens ?? 0,
              totalTokens:
                usage.totalTokens ??
                (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
            },
            timestamp: new Date(),
          });
        }
        break;
      }

      case 'RUN_ERROR': {
        const errorMessage = event.message as string | undefined;
        this.emit({
          type: 'error',
          error: new Error(errorMessage || 'Run failed'),
          timestamp: new Date(),
        });
        break;
      }

      default:
        // Unknown event type - ignore
        break;
    }
  }
}
