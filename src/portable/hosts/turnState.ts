/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A turn's state as a chat host shows it, from its semantic events: the
 * answer so far, the tools, the status line, the approvals waited on, the
 * question it ends on, and how it ended. Each host renders it in its own
 * blocks (Slack's Block Kit, Discord's components); nothing here is a
 * host's. Moved from the Slack service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/turnState
 */

import type { AskQuestion, SemanticEvent } from '../semantic';

export type TurnEnding = 'completion' | 'stop' | 'error';

export type TurnTool = Readonly<{ name: string; status: string }>;

export type TurnFile = Readonly<{
  mediaType?: string;
  name: string;
  url: string;
}>;

export class TurnState {
  #answer = '';
  #asking?: AskQuestion;
  #approvals: string[] = [];
  #ended?: TurnEnding;
  #error?: string;
  #files: TurnFile[] = [];
  #status = 'Working…';
  #tools = new Map<string, TurnTool>();

  /** Whether the turn finished while it streamed: else a `turn.completed` delivery finishes it. */
  get complete(): boolean {
    return this.#ended === 'completion';
  }

  /** Whether the turn ended (answered, stopped, failed) or waits on a question. */
  get ended(): boolean {
    return this.#ended !== undefined || this.#asking !== undefined;
  }

  /** Whether the turn still runs: not ended, and asking nothing. */
  get running(): boolean {
    return !this.ended;
  }

  /** The answer so far, its tables and citations as Markdown. */
  get answer(): string {
    return this.#answer;
  }

  /** The question the turn ends on, if any. */
  get asking(): AskQuestion | undefined {
    return this.#asking;
  }

  /** The tools whose approval the turn waited on, in order. */
  get approvals(): readonly string[] {
    return this.#approvals;
  }

  /** How the turn ended, if it did. */
  get ending(): TurnEnding | undefined {
    return this.#ended;
  }

  /** What the run said when it failed. */
  get error(): string | undefined {
    return this.#error;
  }

  get files(): readonly TurnFile[] {
    return this.#files;
  }

  /** The status line: what the turn is doing now. */
  get status(): string {
    return this.#status;
  }

  /** Each tool the turn used, by its call, in the order first seen. */
  get tools(): ReadonlyMap<string, TurnTool> {
    return this.#tools;
  }

  apply(event: SemanticEvent): void {
    switch (event.kind) {
      case 'text':
        this.#answer += event.text;
        break;
      case 'progress':
        this.#status = event.label;
        break;
      case 'tool':
        this.#tools.set(event.id || event.name, {
          name: event.name,
          status: event.status,
        });
        this.#status = `${event.status === 'running' ? 'Using' : event.status === 'failed' ? 'Failed:' : 'Used'} ${event.name}`;
        break;
      case 'approval':
        this.#approvals.push(event.toolName);
        this.#status = `Waiting for approval to use ${event.toolName}`;
        break;
      case 'file':
        this.#files.push({
          mediaType: event.mediaType,
          name: event.name,
          url: event.url,
        });
        break;
      case 'table':
        this.#answer += `\n\n| ${event.columns.join(' | ')} |\n|${event.columns.map(() => '---').join('|')}|\n${event.rows.map(row => `| ${row.join(' | ')} |`).join('\n')}\n`;
        break;
      case 'citation':
        this.#answer += `\n[${event.title}](${event.url})`;
        break;
      case 'ask':
        this.#asking = event.question;
        this.#status = 'Waiting for your answer';
        break;
      case 'completion':
        // The streamed words are the answer: a completion's text only
        // stands in for none, never repeated after them.
        if (event.text && !this.#answer) {
          this.#answer = event.text;
        }
        this.#ended = 'completion';
        this.#status = 'Complete';
        break;
      case 'stop':
        this.#ended = 'stop';
        this.#status = 'Stopped';
        break;
      case 'error':
        this.#ended = 'error';
        this.#error = event.message;
        this.#status = 'Could not finish';
        break;
    }
  }
}
