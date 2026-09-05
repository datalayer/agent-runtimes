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
import type { AgentStreamSubagentPayload } from '../types/stream';
import { BaseProtocolAdapter } from './BaseProtocolAdapter';
import type { TeamContextSharing } from '../types/teams';
import {
  createBrowserModel,
  frontendToolsToVercelAI,
  subagentTools,
  type BrowserSubagent,
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
  /**
   * Agents this one may hand work to.
   *
   * They join the frontend tools as tools of their own, which is how the SDK
   * models delegation: a subagent is another agent the parent reaches by
   * calling it.
   */
  subagents?: BrowserSubagent[];
  /** What a subagent is told about the conversation so far. */
  sharing?: TeamContextSharing;
  /** Told what a delegated run does, as it does it — see `subagentTools`. */
  onSubagentEvent?: (event: AgentStreamSubagentPayload) => void;
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
    const page = frontendToolsToVercelAI(config.frontendTools ?? [], {
      onHitlRequired: config.onHitlRequired,
      onStatusChange: config.onStatusChange,
    });
    // One set: to the model there is no difference between reaching into the
    // page and reaching another agent — both are tools it may call, and the
    // names are what it chooses between.
    this.tools = {
      ...page,
      ...(config.subagents?.length && config.inference
        ? subagentTools({
            subagents: config.subagents,
            inference: config.inference,
            model: config.model,
            sharing: config.sharing,
            // A member reached by delegation works in this page too, with
            // the same tools as the one that delegated.
            tools: page,
            onEvent: config.onSubagentEvent,
            // The run being stopped stops its delegations too.
            signal: () => this.abortController?.signal,
          })
        : {}),
    };
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

  /**
   * Stop the run in flight, and stay connected.
   *
   * What the chat's stop button calls on an adapter that has it. The other
   * adapters cut a network stream; this one cuts the model call turning in
   * the page — and, through the signal every delegation reads, the
   * subagents that call started. Without this the button stopped the
   * chat's *display* of the run and nothing else: the parent kept calling
   * the model and the children kept working.
   */
  stopGeneration(): void {
    this.abortController?.abort();
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

    /*
     * One message per text block, and an id of our own for each.
     *
     * A tool-using turn is several blocks: the model says what it is about to
     * do, calls a tool, then says what it found. The SDK marks each with
     * `text-start`, and the chat keys on the message id — same id replaces in
     * place, a new id appends. Accumulating a whole turn under one id folded
     * everything said after a tool call back into the sentence before it.
     *
     * The id must not be the provider's, either. `text-start` carries a block
     * id that is unique only *within* a response — commonly "0" — so reusing
     * it across turns made the second turn's text replace the first turn's
     * message, which the chat then showed above the question that prompted it.
     * Ours are unique for the life of the page, which is the scope the chat's
     * message list actually has.
     */
    let messageId: string | null = null;
    let text = '';

    /** Begin a new assistant message. */
    const startBlock = () => {
      messageId = generateMessageId();
      text = '';
    };

    /** Emit the assistant message as it stands, so the chat can stream it. */
    const emitText = () => {
      const assistant = createAssistantMessage(text);
      assistant.id = messageId as string;
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
          case 'text-start':
            // A new block: whatever follows belongs to a message of its own,
            // after any tool the previous block called.
            startBlock();
            break;

          case 'text-delta':
            // Defensively: a provider that streams text without announcing a
            // block still gets a message rather than losing its words.
            if (messageId === null) {
              startBlock();
            }
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

          case 'finish': {
            /*
             * Whatever the provider counted, summed when it did not total.
             *
             * The SDK's `totalUsage` fields are all optional, and a
             * provider that reports the parts but not the sum used to leave
             * `totalTokens` undefined — which is the one field the chat's
             * local accounting keys on, so the usage bar read 0 for turns
             * that were counted perfectly well.
             */
            const counted = part.totalUsage;
            const promptTokens = counted?.inputTokens ?? 0;
            const completionTokens = counted?.outputTokens ?? 0;
            const totalTokens =
              counted?.totalTokens ??
              (promptTokens + completionTokens > 0
                ? promptTokens + completionTokens
                : undefined);
            this.emit({
              type: 'done',
              usage: { promptTokens, completionTokens, totalTokens },
              timestamp: new Date(),
            });
            break;
          }

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
