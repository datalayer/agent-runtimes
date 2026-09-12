/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What to give a chat, chosen by where the loop turns.
 *
 * Extracted from `useExampleJupyterAgent` when it turned out that the choice
 * has nothing to do with notebooks. `ChatExample` has no sandbox, no tools and
 * no surface — it is a conversation and nothing else — and it still has to
 * make the same decision the moment someone selects Browser in the runtime
 * control.
 *
 * Remotely the chat speaks the Vercel AI wire protocol to an agent's endpoint.
 * In the browser it speaks to the in-page harness, and carries the prompt and
 * the tools rather than a URL.
 *
 * @module examples/hooks/useExampleAgentProtocol
 */

import { useMemo } from 'react';

import type { ProtocolConfig } from '../../types/protocol';
import type { FrontendToolDefinition } from '../../types/tools';
import { browserProtocolConfig } from '../../runtimes/browser';
import { useBrowserInference } from '../../hooks/useBrowserInference';

/** Why a browser agent is unusable when it is. */
export const BROWSER_SIGN_IN_REASON =
  'Sign in to use this agent. The loop runs in your browser and needs no ' +
  'runtime, but the model it asks is reached through the Datalayer inference ' +
  'service, which answers to signed-in members only.';

export interface UseExampleAgentProtocolOptions {
  /** Whether the loop turns in this page. */
  inBrowser: boolean;
  /** The agent's name, which is also its id on a runtime. */
  agentName: string;
  /** The agent's instructions, for the in-page harness to run with. */
  systemPrompt?: string;
  /** The model id, as a spec spells it. */
  model?: string;
  /** The tools the agent may call in this page, if any. */
  frontendTools?: FrontendToolDefinition[];
  /** Base URL of the agent's runtime, for the remote case. */
  remoteBaseUrl?: string;
}

export interface UseExampleAgentProtocolResult {
  protocol: ProtocolConfig;
  /**
   * The tools to pass the chat component — which is not always the tools.
   *
   * Against a runtime the chat runs frontend tools itself: a `tool-call`
   * arrives over the wire and it answers with the result. In the browser the
   * SDK owns the loop and calls the handlers directly, so handing them to the
   * chat as well would run every tool twice.
   */
  chatFrontendTools?: FrontendToolDefinition[];
  /** Whether the in-page agent is unusable for want of a sign-in. */
  needsSignIn: boolean;
}

/** The protocol config for this example, and who should run its tools. */
export function useExampleAgentProtocol(
  options: UseExampleAgentProtocolOptions,
): UseExampleAgentProtocolResult {
  const {
    inBrowser,
    agentName,
    systemPrompt,
    model,
    frontendTools,
    remoteBaseUrl,
  } = options;

  /* Only an in-page agent spends the visitor's trial key. A server-backed one
     authenticates itself, and starting a clock against a conversation that
     will never use it is a countdown on nothing. */
  const { inference, needsSignIn } = useBrowserInference(inBrowser);

  const protocol = useMemo<ProtocolConfig>(
    () =>
      inBrowser
        ? browserProtocolConfig({
            agentId: agentName,
            instructions: systemPrompt,
            model,
            frontendTools,
            inference,
          })
        : {
            type: 'vercel-ai',
            endpoint: `${remoteBaseUrl}/api/v1/vercel-ai/${agentName}`,
            agentId: agentName,
            enableConfigQuery: true,
            configEndpoint: `${remoteBaseUrl}/api/v1/configure`,
          },
    [
      agentName,
      frontendTools,
      inBrowser,
      inference,
      model,
      remoteBaseUrl,
      systemPrompt,
    ],
  );

  return {
    protocol,
    chatFrontendTools: inBrowser ? undefined : frontendTools,
    needsSignIn: inBrowser && needsSignIn,
  };
}

export default useExampleAgentProtocol;
