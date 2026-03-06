/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Self-hosted inference provider for custom endpoints.
 * Supports OpenAI-compatible APIs.
 *
 * @module components/chat/inference/SelfHostedInferenceProvider
 */

import type {
  InferenceProviderConfig,
  InferenceRequestOptions,
  InferenceResponse,
  StreamEventHandler,
} from '../types';
import type { ChatMessage, ToolCallContentPart } from '../types/message';
import type { ToolDefinition } from '../types/tool';
import { generateMessageId, createAssistantMessage } from '../types/message';
import { BaseInferenceProvider } from './BaseInferenceProvider';

/**
 * Self-hosted provider configuration
 */
export interface SelfHostedInferenceConfig extends InferenceProviderConfig {
  /** Base URL for the API endpoint (required) */
  baseUrl: string;

  /** Model name */
  model?: string;

  /** Custom headers */
  customHeaders?: Record<string, string>;

  /** Whether the endpoint is OpenAI-compatible */
  openaiCompatible?: boolean;
}

/**
 * Self-hosted inference provider for custom OpenAI-compatible endpoints
 */
export class SelfHostedInferenceProvider extends BaseInferenceProvider {
  readonly name = 'self-hosted';

  private selfHostedConfig: SelfHostedInferenceConfig;

  constructor(config: SelfHostedInferenceConfig) {
    super(config);
    this.selfHostedConfig = {
      openaiCompatible: true,
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
      const endpoint = this.selfHostedConfig.openaiCompatible
        ? `${this.selfHostedConfig.baseUrl}/v1/chat/completions`
        : this.selfHostedConfig.baseUrl;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(this.selfHostedConfig.customHeaders),
        body: JSON.stringify({
          model: this.selfHostedConfig.model,
          messages: this.convertMessages(messages),
          tools: options?.tools ? this.convertTools(options.tools) : undefined,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
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
      const endpoint = this.selfHostedConfig.openaiCompatible
        ? `${this.selfHostedConfig.baseUrl}/v1/chat/completions`
        : this.selfHostedConfig.baseUrl;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(this.selfHostedConfig.customHeaders),
        body: JSON.stringify({
          model: this.selfHostedConfig.model,
          messages: this.convertMessages(messages),
          tools: options?.tools ? this.convertTools(options.tools) : undefined,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      onEvent?.({ type: 'message-start', messageId });

      let fullContent = '';
      const toolCalls: ToolCallContentPart[] = [];
      let finishReason: string | undefined;

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
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              finishReason = parsed.choices?.[0]?.finish_reason;

              if (delta?.content) {
                fullContent += delta.content;
                onEvent?.({
                  type: 'content-delta',
                  messageId,
                  delta: { messageId, delta: { content: delta.content } },
                });
              }

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
                      try {
                        toolCalls[tc.index].args = JSON.parse(
                          tc.function.arguments,
                        );
                      } catch {
                        // Arguments still incomplete
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[SelfHostedProvider] Failed to parse SSE data:', e);
            }
          }
        }
      }

      onEvent?.({ type: 'message-end', messageId, finishReason });

      const message = createAssistantMessage(fullContent, {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      message.id = messageId;

      return { message, finishReason: finishReason as any };
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
   * Check if provider is available
   */
  isAvailable(): boolean {
    return !!this.selfHostedConfig.baseUrl;
  }

  /**
   * Convert internal messages to OpenAI format
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
  protected parseResponse(data: any): InferenceResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: ToolCallContentPart[] =
      message?.tool_calls?.map((tc: any) => ({
        type: 'tool-call' as const,
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
        status: 'pending' as const,
      })) || [];

    return {
      message: createAssistantMessage(message?.content || '', {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: choice?.finish_reason,
    };
  }
}
