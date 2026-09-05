/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * How a chat is told to talk to an in-page agent.
 *
 * The shape belongs with the harness rather than with whoever renders a chat.
 * It started in the examples, and then the LOOP workspace needed the identical
 * thing — same fields, same reasons — which is the usual sign that a shape was
 * living in the wrong place.
 *
 * @module runtimes/browser/protocol
 */

import type { ProtocolConfig } from '../../types/protocol';
import type { AgentStreamSubagentPayload } from '../../types/stream';
import type { FrontendToolDefinition } from '../../types/tools';
import type { TeamContextSharing } from '../../types/teams';
import type { BrowserModelOptions } from './model';
import type { BrowserSubagent } from './subagents';

export type BrowserProtocolOptions = {
  /** The agent's id, for the chat to name it by. */
  agentId: string;
  /** The agent's instructions. */
  instructions?: string;
  /** The model id, as a spec spells it. */
  model?: string;
  /** The tools the agent may call in this page, if any. */
  frontendTools?: FrontendToolDefinition[];
  /** Where to reach a model. */
  inference: Omit<BrowserModelOptions, 'model'>;
  /**
   * Agents this one may hand work to.
   *
   * Each becomes a tool named after it, so the model reaches for `Compactor`
   * rather than `delegate_task('Compactor', …)`. What the child is told about
   * the conversation is {@link sharing}.
   */
  subagents?: BrowserSubagent[];
  /** What a subagent is told about the conversation so far. */
  sharing?: TeamContextSharing;
  /** Told what a delegated run does, as it does it — see `subagentTools`. */
  onSubagentEvent?: (event: AgentStreamSubagentPayload) => void;
};

/**
 * The protocol config for an agent whose loop runs in this page.
 *
 * Two fields carry the weight:
 *
 * - `endpoint` is empty and stays empty. There is nothing to address, and the
 *   live objects travel in `options` — the seam `createProtocolAdapter` leaves
 *   for an adapter whose configuration is not a URL.
 * - `enableConfigQuery: false`, because models, tools and skills all come from
 *   a runtime this agent does not have. Said explicitly rather than left
 *   undefined: the composer waits on that query before it will accept a
 *   keystroke, so an omitted flag reads as a chat that silently ignores typing.
 */
export function browserProtocolConfig(
  options: BrowserProtocolOptions,
): ProtocolConfig {
  const {
    agentId,
    instructions,
    model,
    frontendTools,
    inference,
    subagents,
    sharing,
    onSubagentEvent,
  } = options;
  return {
    type: 'browser-vercel-ai',
    endpoint: '',
    agentId,
    enableConfigQuery: false,
    options: {
      instructions,
      model,
      frontendTools,
      inference,
      subagents,
      sharing,
      onSubagentEvent,
    },
  };
}
