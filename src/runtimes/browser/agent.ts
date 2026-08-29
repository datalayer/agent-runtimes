/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * An agent loop that turns in the page.
 *
 * The server-side harness reads a spec and builds a pydantic-ai agent from it.
 * This reads the same spec and builds a Vercel AI SDK agent from it — same
 * prompt, same model name, same tools, different thing turning the loop.
 *
 * What a browser agent does *not* get comes from the spec too, and it is not a
 * limitation this module has to enforce: a spec written for this harness
 * declares no MCP servers, no sandbox and no codemode, because none of them
 * exist without a server. All that is left is the frontend tools, and those
 * were always the ones that ran here anyway.
 *
 * @module runtimes/browser/agent
 */

import { ToolLoopAgent, stepCountIs, type LanguageModel } from 'ai';
import type { Agentspec } from '../../types/agentspecs';
import type { FrontendToolDefinition } from '../../types/tools';
import {
  frontendToolsToVercelAI,
  type FrontendToolsToVercelAIOptions,
} from './frontendTools';
import { createBrowserModel, type BrowserModelOptions } from './model';

/**
 * How many model turns one request may take.
 *
 * A compaction reads a notebook cell by cell and then edits it, so the loop
 * needs room — but it is running against a person's own page with nothing
 * between it and a bill, so it needs a ceiling too.
 */
export const DEFAULT_BROWSER_MAX_STEPS = 24;

export type CreateBrowserAgentOptions = FrontendToolsToVercelAIOptions & {
  /** The spec to run. Its prompt, model and identity are used as written. */
  spec: Pick<Agentspec, 'id' | 'model' | 'systemPrompt'>;
  /**
   * The tools the agent can call, in this page.
   *
   * The same array a host passes to `<Chat frontendTools={...}>` — from
   * `useNotebookTools`, `useLexicalTools`, or hand-written.
   */
  frontendTools: FrontendToolDefinition[];
  /** Where to reach the model, unless one is supplied outright. */
  inference?: Omit<BrowserModelOptions, 'model'>;
  /** A ready-made model, for a host that resolves models its own way. */
  model?: LanguageModel;
  /** Turn ceiling for one request. @see DEFAULT_BROWSER_MAX_STEPS */
  maxSteps?: number;
};

/**
 * Build the agent a browser variant runs.
 *
 * The result is an SDK agent, so it drops straight into `DirectChatTransport`
 * and from there into the same `useChat` the rest of the chat UI is built on
 * — which is why nothing downstream of the transport has to know which
 * harness produced its messages.
 */
export function createBrowserAgent(
  options: CreateBrowserAgentOptions,
): ToolLoopAgent {
  const {
    spec,
    frontendTools,
    inference,
    model,
    maxSteps = DEFAULT_BROWSER_MAX_STEPS,
    onHitlRequired,
    onStatusChange,
  } = options;

  if (!model && !inference) {
    throw new Error(
      'A browser agent needs either a `model` or an `inference` endpoint to reach one.',
    );
  }

  return new ToolLoopAgent({
    id: spec.id,
    model:
      model ??
      createBrowserModel({
        ...(inference as BrowserModelOptions),
        model: spec.model,
      }),
    instructions: spec.systemPrompt,
    tools: frontendToolsToVercelAI(frontendTools, {
      onHitlRequired,
      onStatusChange,
    }),
    stopWhen: stepCountIs(maxSteps),
  });
}
