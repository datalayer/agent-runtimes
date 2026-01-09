/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Base inference provider class with common functionality.
 *
 * @module components/chat/inference/BaseInferenceProvider
 */

import type {
  InferenceProvider,
  InferenceProviderConfig,
  InferenceRequestOptions,
  InferenceResponse,
  StreamEventHandler,
} from '../types';
import type { ChatMessage } from '../types/message';
import type { ToolExecutionResult } from '../types/tool';

/**
 * Abstract base class for inference providers
 */
export abstract class BaseInferenceProvider implements InferenceProvider {
  protected config: InferenceProviderConfig;
  protected abortController: AbortController | null = null;

  abstract readonly name: string;

  constructor(config: InferenceProviderConfig) {
    this.config = config;
  }

  /**
   * Send a message and get a response (non-streaming)
   */
  abstract sendMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
  ): Promise<InferenceResponse>;

  /**
   * Send a message with streaming response
   */
  abstract streamMessage(
    messages: ChatMessage[],
    options?: InferenceRequestOptions,
    onEvent?: StreamEventHandler,
  ): Promise<InferenceResponse>;

  /**
   * Cancel an ongoing request
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Execute a backend tool (optional, for hybrid execution)
   */
  async executeBackendTool(
    _toolName: string,
    _args: Record<string, unknown>,
    _options?: InferenceRequestOptions,
  ): Promise<ToolExecutionResult> {
    return {
      success: false,
      error: `Backend tool execution not supported by ${this.name} provider`,
    };
  }

  /**
   * Check if provider is available/configured
   */
  isAvailable(): boolean {
    return !!this.config.apiKey || !!this.config.baseUrl;
  }

  /**
   * Get provider configuration
   */
  getConfig(): InferenceProviderConfig {
    return { ...this.config };
  }

  /**
   * Create abort controller for request
   */
  protected createAbortController(signal?: AbortSignal): AbortController {
    this.abortController = new AbortController();

    // Link to external signal if provided
    if (signal) {
      signal.addEventListener('abort', () => {
        this.abortController?.abort();
      });
    }

    return this.abortController;
  }

  /**
   * Build headers for API requests
   */
  protected buildHeaders(
    additionalHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return { ...headers, ...additionalHeaders };
  }

  /**
   * Convert internal messages to provider-specific format
   */
  protected abstract convertMessages(messages: ChatMessage[]): unknown[];

  /**
   * Parse provider response to internal format
   */
  protected abstract parseResponse(response: unknown): InferenceResponse;
}
