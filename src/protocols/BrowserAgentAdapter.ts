/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser harness, behind the protocol interface every chat surface uses.
 *
 * The other adapters carry messages to somewhere else — AG-UI over SSE, Vercel
 * AI over SSE, ACP over a socket. This one carries them nowhere: the loop turns
 * in this page with the Vercel AI SDK, and the adapter exists so that fact
 * stays invisible to `<Chat>`, `<ChatFloating>` and everything downstream of
 * them. Suggestions, tool rendering, the panel, the history: all unchanged.
 *
 * That is the point of putting it here rather than writing a bespoke chat for
 * in-browser agents. There is nothing chat-shaped about the browser harness —
 * only a different answer to "where does the loop turn" — so it belongs at the
 * one seam the package already has for that question.
 *
 * **Who executes the tools.** In every other adapter the runtime asks and the
 * client answers: a `tool-call` arrives, `ChatBase` runs the frontend tool's
 * handler and posts the result back with {@link sendToolResult}. Here the SDK
 * owns the loop and calls the handler itself, so a host must NOT also pass
 * `frontendTools` to the chat component — the tools go to this adapter, and the
 * chat is left to render what happened. {@link sendToolResult} is therefore a
 * no-op: by the time anyone could call it, the tool has already run.
 *
 * @module protocols/BrowserAgentAdapter
 */

import { streamText, stepCountIs, type LanguageModel, type ToolSet } from 'ai';
import type { ProtocolAdapterConfig } from '../types/protocol';
import type { ChatMessage } from '../types/messages';
import { createAssistantMessage, generateMessageId } from '../types/messages';
import type { FrontendToolDefinition } from '../types/tools';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import {
  createBrowserModel,
  frontendToolsToVercelAI,
  DEFAULT_BROWSER_MAX_STEPS,
  type BrowserModelOptions,
  type FrontendToolsToVercelAIOptions,
} from '../runtimes/browser';

/**
 * What a browser agent needs that a remote one does not.
 *
 * These arrive through `ProtocolConfig.options`, which `createProtocolAdapter`
 * spreads onto the adapter config. They are live objects — a tool set bound to
 * this page's notebook — rather than the URLs and tokens the other adapters
 * take, which is exactly the difference between running a loop and calling one.
 */
export interface BrowserAgentAdapterConfig
  extends ProtocolAdapterConfig, FrontendToolsToVercelAIOptions {
  /** The agent's instructions. From the spec's `systemPrompt`. */
  instructions?: string;
  /** The tools the agent can call in this page. */
  frontendTools?: FrontendToolDefinition[];
  /** Where to reach a model, unless one is supplied outright. */
  inference?: Omit<BrowserModelOptions, 'model'>;
  /** The model id, as a spec spells it. */
  model?: string;
  /** A ready-made model, for a host that resolves models its own way. */
  languageModel?: LanguageModel;
  /** Turn ceiling for one request. */
  maxSteps?: number;
}

/** The text of a chat message, whatever shape it arrived in. */
function messageText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map(part =>
      typeof part === 'string'
        ? part
        : ((part as { text?: string }).text ?? ''),
    )
    .join('');
}

/** The roles a model can be sent. Everything else is presentation. */
function isModelRole(role: string): role is 'user' | 'assistant' | 'system' {
  return role === 'user' || role === 'assistant' || role === 'system';
}

/**
 * An agent loop running in the page, speaking the protocol adapter interface.
 */
export class BrowserAgentAdapter extends BaseProtocolAdapter {
  readonly protocol = 'browser-vercel-ai' as const;
  readonly protocolTransport = 'http' as const;

  private browserConfig: BrowserAgentAdapterConfig;
  private abortController: AbortController | null = null;
  private tools: ToolSet;

  constructor(config: BrowserAgentAdapterConfig) {
    super(config);
    this.browserConfig = config;
    this.tools = frontendToolsToVercelAI(config.frontendTools ?? [], {
      onHitlRequired: config.onHitlRequired,
      onStatusChange: config.onStatusChange,
    });
  }

  /**
   * Nothing to dial.
   *
   * The interface asks for a connection because the other adapters have one.
   * This reports connected because the loop is already here.
   */
  async connect(): Promise<void> {
    this.setConnectionState('connected');
  }

  disconnect(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.setConnectionState('disconnected');
  }

  override supportsFeature(feature: string): boolean {
    // Tools, yes — they are the whole point. Not the rest: there is no server
    // to hold a thread, resume a run, or approve anything out of band.
    return feature === 'tools';
  }

  /**
   * Already done.
   *
   * The SDK executed the tool before this adapter reported it, so there is no
   * result to carry back and nothing to resume. Kept because the interface has
   * it and a host should not have to know which adapter it is holding.
   */
  async sendToolResult(): Promise<void> {}

  /** The model this agent asks, resolved once per request. */
  private resolveModel(): LanguageModel {
    const { languageModel, inference, model } = this.browserConfig;
    if (languageModel) {
      return languageModel;
    }
    if (!inference) {
      throw new Error(
        'A browser agent needs either a `languageModel` or an `inference` endpoint to reach one.',
      );
    }
    return createBrowserModel({ ...inference, model });
  }

  /**
   * Run one turn of the loop and report it as it happens.
   *
   * The SDK's `fullStream` is already the event stream this interface wants —
   * text deltas, tool calls, tool results, a finish — so the body of this is a
   * translation rather than a protocol implementation.
   */
  async sendMessage(
    message: ChatMessage,
    options?: { messages?: ChatMessage[] },
  ): Promise<void> {
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;

    // The history the chat is showing, minus anything the model has no role
    // for — tool-call entries and activity items are presentation.
    const history = (options?.messages ?? [])
      .filter(entry => isModelRole(entry.role))
      .map(entry => ({
        role: entry.role as 'user' | 'assistant' | 'system',
        content: messageText(entry),
      }))
      .filter(entry => entry.content.length > 0);

    const latest = messageText(message);
    if (latest && history[history.length - 1]?.content !== latest) {
      history.push({ role: 'user', content: latest });
    }

    const messageId = generateMessageId();
    let text = '';

    /** Emit the assistant message as it stands, so the chat can stream it. */
    const emitText = () => {
      const assistant = createAssistantMessage(text);
      assistant.id = messageId;
      this.emit({ type: 'message', message: assistant, timestamp: new Date() });
    };

    try {
      const result = streamText({
        model: this.resolveModel(),
        system: this.browserConfig.instructions,
        messages: history,
        tools: this.tools,
        stopWhen: stepCountIs(
          this.browserConfig.maxSteps ?? DEFAULT_BROWSER_MAX_STEPS,
        ),
        abortSignal: abortController.signal,
      });

      for await (const part of result.fullStream) {
        if (abortController.signal.aborted) {
          break;
        }
        switch (part.type) {
          case 'text-delta':
            text += part.text;
            emitText();
            break;

          case 'tool-call':
            this.emit({
              type: 'tool-call',
              toolCall: {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: (part.input ?? {}) as Record<string, unknown>,
                // The SDK hands over a whole argument set in one part; unlike
                // AG-UI, nothing more is coming.
                argsComplete: true,
              },
              timestamp: new Date(),
            });
            break;

          case 'tool-result':
            this.emit({
              type: 'tool-result',
              toolResult: {
                toolCallId: part.toolCallId,
                success: true,
                result: part.output,
              },
              timestamp: new Date(),
            });
            break;

          case 'tool-error':
            this.emit({
              type: 'tool-result',
              toolResult: {
                toolCallId: part.toolCallId,
                success: false,
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              },
              timestamp: new Date(),
            });
            break;

          case 'error':
            this.emit({
              type: 'error',
              error:
                part.error instanceof Error
                  ? part.error
                  : new Error(String(part.error)),
              timestamp: new Date(),
            });
            break;

          case 'finish':
            this.emit({
              type: 'done',
              usage: {
                promptTokens: part.totalUsage?.inputTokens ?? 0,
                completionTokens: part.totalUsage?.outputTokens ?? 0,
                totalTokens: part.totalUsage?.totalTokens ?? undefined,
              },
              timestamp: new Date(),
            });
            break;

          default:
            break;
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      this.emit({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });
      this.emit({ type: 'done', timestamp: new Date() });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }
}
