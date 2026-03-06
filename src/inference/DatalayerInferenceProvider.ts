/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer inference provider implementation.
 * Uses Datalayer's API for LLM inference.
 *
 * @module components/chat/inference/DatalayerInferenceProvider
 */

import type {
  InferenceProviderConfig,
  InferenceRequestOptions,
  InferenceResponse,
  StreamEventHandler,
} from '../types';
import type { ChatMessage, ToolCallContentPart } from '../types/message';
import type { ToolExecutionResult, ToolDefinition } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseInferenceProvider } from './BaseInferenceProvider';

/**
 * Finish reason type for inference responses
 */
export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'error';

/**
 * Datalayer-specific configuration
 */
export interface DatalayerInferenceConfig extends InferenceProviderConfig {
  /** Datalayer API key */
  apiKey: string;

  /** Base URL for Datalayer API */
  baseUrl?: string;

  /** Model to use */
  model?: string;

  /** Agent ID for agent-specific inference */
  agentId?: string;
}

/**
 * Datalayer inference provider
 */
export class DatalayerInferenceProvider extends BaseInferenceProvider {
  readonly name = 'datalayer';

  private datalayerConfig: DatalayerInferenceConfig;

  constructor(config: DatalayerInferenceConfig) {
    super(config);
    this.datalayerConfig = {
      baseUrl: 'https://api.datalayer.run',
      model: 'gpt-4o',
      ...config,
    };
  }

  /**
   * Send a message and get a response (non-streaming)
   */
  async sendMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
  ): Promise<InferenceResponse> {
    const controller = this.createAbortController(options?.signal);

    try {
      const response = await fetch(
        `${this.datalayerConfig.baseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: this.datalayerConfig.model,
            messages: this.convertMessages(messages),
            tools: options?.tools
              ? this.convertTools(options.tools)
              : undefined,
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            stream: false,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Datalayer API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return this.parseResponse(data);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Send a message with streaming response
   */
  async streamMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
    onEvent?: StreamEventHandler,
  ): Promise<InferenceResponse> {
    const controller = this.createAbortController(options?.signal);
    const messageId = generateMessageId();

    try {
      const response = await fetch(
        `${this.datalayerConfig.baseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: this.datalayerConfig.model,
            messages: this.convertMessages(messages),
            tools: options?.tools
              ? this.convertTools(options.tools)
              : undefined,
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            stream: true,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Datalayer API error: ${response.status} ${response.statusText}`,
        );
      }

      // Emit message start
      onEvent?.({
        type: 'message-start',
        messageId,
      });

      let fullContent = '';
      const toolCalls: ToolCallContentPart[] = [];
      let finishReason: string | undefined;

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              finishReason = parsed.choices?.[0]?.finish_reason;

              if (delta?.content) {
                fullContent += delta.content;
                onEvent?.({
                  type: 'content-delta',
                  messageId,
                  delta: {
                    messageId,
                    delta: { content: delta.content },
                  },
                });
              }

              // Handle tool calls in stream
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.index !== undefined) {
                    if (!toolCalls[tc.index]) {
                      toolCalls[tc.index] = {
                        type: 'tool-call',
                        toolCallId: tc.id || `tc_${Date.now()}_${tc.index}`,
                        toolName: tc.function?.name || '',
                        args: {},
                        status: 'pending',
                      };
                      onEvent?.({
                        type: 'tool-call-start',
                        toolCall: {
                          toolCallId: toolCalls[tc.index].toolCallId,
                          toolName: toolCalls[tc.index].toolName,
                          args: {},
                        },
                      });
                    }
                    if (tc.function?.arguments) {
                      // Accumulate arguments (they come in chunks)
                      try {
                        const newArgs = tc.function.arguments;
                        // This is a simplified approach - real implementation would accumulate string chunks
                        toolCalls[tc.index].args = JSON.parse(newArgs);
                      } catch {
                        // Arguments still incomplete
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[DatalayerProvider] Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Emit message end
      onEvent?.({
        type: 'message-end',
        messageId,
        finishReason,
      });

      const message = createAssistantMessage(fullContent, {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      message.id = messageId;

      return {
        message,
        finishReason: finishReason as FinishReason | undefined,
      };
    } catch (error) {
      onEvent?.({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Execute a backend tool
   */
  async executeBackendTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: InferenceRequestOptions,
  ): Promise<ToolExecutionResult> {
    const controller = this.createAbortController(options?.signal);

    try {
      const response = await fetch(
        `${this.datalayerConfig.baseUrl}/v1/tools/execute`,
        {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({
            tool_name: toolName,
            arguments: args,
            agent_id: this.datalayerConfig.agentId,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Tool execution failed: ${response.status} ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        result: data.result,
        executionTime: data.execution_time,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Check if provider is available
   */
  isAvailable(): boolean {
    return !!this.datalayerConfig.apiKey;
  }

  /**
   * Convert internal messages to OpenAI-compatible format
   */
  protected convertMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(msg => ({
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content),
      ...(msg.toolCalls && {
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.toolCallId,
          type: 'function',
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.args),
          },
        })),
      }),
    }));
  }

  /**
   * Convert tool definitions to OpenAI format
   */
  private convertTools(tools: ToolDefinition[]): unknown[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: Array.isArray(tool.parameters)
          ? {
              type: 'object',
              properties: Object.fromEntries(
                tool.parameters.map(p => [
                  p.name,
                  {
                    type: p.type || 'string',
                    description: p.description,
                    enum: p.enum,
                  },
                ]),
              ),
              required: tool.parameters
                .filter(p => p.required)
                .map(p => p.name),
            }
          : tool.parameters,
      },
    }));
  }

  /**
   * Parse API response to internal format
   */
  protected parseResponse(data: {
    choices?: Array<{
      message?: {
        role?: string;
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }): InferenceResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: ToolCallContentPart[] =
      message?.tool_calls?.map(
        (tc: {
          id: string;
          function: { name: string; arguments: string };
        }) => ({
          type: 'tool-call' as const,
          toolCallId: tc.id,
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments || '{}'),
          status: 'pending' as const,
        }),
      ) || [];

    return {
      message: createAssistantMessage(message?.content || '', {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
      finishReason: choice?.finish_reason as FinishReason | undefined,
    };
  }
}
