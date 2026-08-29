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
import type { FrontendToolDefinition } from '../../types/tools';
import type { BrowserModelOptions } from './model';

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
  const { agentId, instructions, model, frontendTools, inference } = options;
  return {
    type: 'browser-vercel-ai',
    endpoint: '',
    agentId,
    enableConfigQuery: false,
    options: { instructions, model, frontendTools, inference },
  };
}
