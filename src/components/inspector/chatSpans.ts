/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's agent, as OpenTelemetry spans: each turn an `invoke_agent` span
 * (the prompt, the answer, the tokens), each tool call an `execute_tool` span
 * under it from its start to its end — an MCP server's, a skill, a frontend
 * tool the page runs, codemode's, a tool the runtime runs — whatever
 * transport the chat speaks (AG-UI, Vercel AI, A2A, the in-browser harness):
 * `ChatBase` tells it what its adapter told.
 *
 * @module components/inspector/chatSpans
 */

import type {
  OtelLiveSpan,
  OtelLiveTracer,
} from '@datalayer/core/lib/otel/live';
import type { MarkedMcpServer } from '../../chat/marks/toolMarks';
import {
  endAgentTurn,
  endToolCall,
  startAgentTurn,
  startToolCall,
  type TurnUsage,
} from './agentSpans';
import { classifyToolCall } from './classify';

export type ChatSpanRecorder = {
  turnStarted: (prompt: string, model?: string) => void;
  turnEnded: (outcome: {
    text?: string;
    usage?: TurnUsage;
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

/** A recorder for one chat's agent (`agent`) into `tracer`. */
export function chatSpanRecorder(
  tracer: OtelLiveTracer,
  agent: () => string,
  options: {
    /** The page's own tools, by name: frontend tools. */
    frontendTools?: () => readonly string[];
    mcpServers?: () => readonly MarkedMcpServer[];
  } = {},
): ChatSpanRecorder {
  let turn: OtelLiveSpan | undefined;
  const tools = new Map<string, OtelLiveSpan>();
  return {
    turnStarted(prompt, model) {
      turn = startAgentTurn(tracer, { agent: agent(), prompt, model });
    },
    turnEnded(outcome) {
      if (!turn) {
        return;
      }
      endAgentTurn(turn, outcome);
      turn = undefined;
    },
    toolStarted({ id, name, args }) {
      const known = tools.get(id);
      if (known) {
        // Arguments that stream in: the latest whole.
        known.setAttribute(
          'gen_ai.tool.call.arguments',
          JSON.stringify(args ?? {}),
        );
        return;
      }
      tools.set(
        id,
        startToolCall(tracer, {
          agent: agent(),
          name,
          id,
          args,
          tool: classifyToolCall(name, args, {
            frontendTools: options.frontendTools?.(),
            mcpServers: options.mcpServers?.(),
          }),
          ...(turn ? { parent: turn.context } : {}),
        }),
      );
    },
    toolEnded(id, outcome) {
      const span = tools.get(id);
      if (!span) {
        return;
      }
      tools.delete(id);
      endToolCall(span, outcome);
    },
  };
}
