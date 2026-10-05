/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's agent, as the Agent Inspector records it: each turn of its model
 * (the prompt, the answer, the tokens), and each tool call from its start to
 * its end — an MCP server's, a skill, a frontend tool the page runs, a tool
 * the runtime runs — whatever transport the chat speaks (AG-UI, Vercel AI,
 * A2A, the in-browser harness): `ChatBase` tells it what its adapter told.
 *
 * @module components/inspector/chatInspect
 */

import type { MarkedMcpServer } from '../../chat/marks/toolMarks';
import {
  argumentsLine,
  shortLine,
  type AgentInspectorSink,
} from './agentInspector';
import { classifyToolCall } from './classify';

export type ChatInspectorRecorder = {
  turnStarted: (prompt: string, model?: string) => void;
  turnEnded: (outcome: {
    text?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    error?: string;
  }) => void;
  toolStarted: (call: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }) => void;
  toolEnded: (
    id: string,
    outcome: { result?: unknown; error?: string },
  ) => void;
};

/** A recorder for one chat's agent (`actor`) into `sink`. */
export function chatInspectorRecorder(
  sink: AgentInspectorSink,
  actor: () => string,
  options: {
    /** The page's own tools, by name: frontend tools. */
    frontendTools?: () => readonly string[];
    mcpServers?: () => readonly MarkedMcpServer[];
  } = {},
): ChatInspectorRecorder {
  let turns = 0;
  let turnKey: string | undefined;
  return {
    turnStarted(prompt, model) {
      turns += 1;
      turnKey = `chat-turn:${turns}`;
      sink.start({
        key: turnKey,
        actor: actor(),
        source: 'model',
        kind: 'turn',
        ...(model ? { name: model } : {}),
        summary: shortLine(prompt),
        payload: { prompt, ...(model ? { model } : {}) },
      });
    },
    turnEnded({ text, usage, error }) {
      if (!turnKey) {
        return;
      }
      const total =
        usage?.totalTokens ??
        (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
      sink.end(turnKey, {
        ...(error ? { status: 'failed' as const, error } : {}),
        result: {
          ...(text ? { text } : {}),
          ...(usage ? { usage } : {}),
        },
        ...(total ? { summary: `${total} tokens` } : {}),
      });
      turnKey = undefined;
    },
    toolStarted({ id, name, args }) {
      const kind = classifyToolCall(name, args, {
        frontendTools: options.frontendTools?.(),
        mcpServers: options.mcpServers?.(),
      });
      sink.start({
        key: `chat-tool:${id}`,
        actor: actor(),
        source: kind.source,
        ...(kind.icon ? { icon: kind.icon } : {}),
        ...(kind.emoji ? { emoji: kind.emoji } : {}),
        kind: 'tool-call',
        name,
        summary: argumentsLine(args),
        payload: args,
      });
    },
    toolEnded(id, { result, error }) {
      sink.end(`chat-tool:${id}`, {
        ...(error ? { status: 'failed' as const, error } : {}),
        result,
      });
    },
  };
}
