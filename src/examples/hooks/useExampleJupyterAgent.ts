/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * One agent, on a Jupyter sandbox, created once.
 *
 * Five examples wanted the same thing — an agent that can drive the notebook
 * or document on the page — and each grew its own copy of the same twenty
 * lines. The copies shared two bugs, and sharing them is why this hook exists.
 *
 * **It never retries** — see {@link useCreateAgentOnce}, which is where the
 * copies' retry loop was.
 *
 * **It does not invent a sandbox** — see {@link exampleJupyterSandboxUrl},
 * which is where they invented one.
 *
 * Both live in modules of their own, free of the runtime graph this hook pulls
 * in, so the two things that were actually broken can be tested without it.
 *
 * @module examples/hooks/useExampleJupyterAgent
 */

import { useMemo } from 'react';
import type { ServiceManager } from '@jupyterlab/services';

import type { AgentConfig } from '../../types/config';
import type { ProtocolConfig } from '../../types/protocol';
import type { FrontendToolDefinition } from '../../types/tools';
import { DEFAULT_MODEL } from '../../specs';
import {
  BROWSER_SIGN_IN_REASON,
  useExampleAgentProtocol,
} from './useExampleAgentProtocol';
import { exampleJupyterSandboxUrl } from '../utils/jupyterSandboxUrl';
import { runsInBrowser } from '../../runtimes/variants';
import { useCreateAgentOnce } from './useCreateAgentOnce';
import {
  useExampleAgentRuntime,
  type UseExampleAgentRuntimeResult,
} from './useExampleAgentRuntime';

export { exampleJupyterSandboxUrl } from '../utils/jupyterSandboxUrl';
export { useCreateAgentOnce } from './useCreateAgentOnce';

/**
 * Statuses that mean a runtime is on its way rather than missing.
 *
 * A runtime that has not arrived yet is not a problem to report; one that is
 * not coming is.
 */
const STARTING_UP = new Set([
  'launching',
  'connecting',
  'pending',
  'resuming',
  'starting',
]);

export interface UseExampleJupyterAgentOptions {
  /** This example's key, for the summary badge. */
  exampleId: string;
  /** The agent's name, which is also its id on the runtime. */
  agentName: string;
  /** One line about the agent, shown by the runtime. */
  description: string;
  /** The agent's instructions. */
  systemPrompt: string;
  /** The notebook or document runtime, which may also be the sandbox. */
  serviceManager?: ServiceManager.IManager;
  /** Model override. Defaults to the package's. */
  model?: string;
  /**
   * The tools the agent can call in this page.
   *
   * Given here rather than to the chat, because who executes them depends on
   * where the loop turns and only this hook knows that — see
   * {@link UseExampleJupyterAgentResult.chatFrontendTools}.
   */
  frontendTools?: FrontendToolDefinition[];
}

export interface UseExampleJupyterAgentResult extends UseExampleAgentRuntimeResult {
  /**
   * Whether *this example's* agent exists on the runtime and is ready.
   *
   * Not the same as `isReady`, which reports the runtime. The distinction
   * matters on the cloud target, where the shell launches the runtime and
   * creates an agent of its own before the example mounts: the runtime is
   * ready long before this example's agent has been registered, and a chat
   * opened in that window posts to an agent id the runtime does not know,
   * which comes back as "No agent registered for this ID".
   *
   * Answered from this hook's own creation call rather than from the shared
   * runtime state, which `connectAgent` rebuilds without an agent id and which
   * the shell writes to as well.
   */
  agentReady: boolean;
  /**
   * What to give the chat, chosen by where the loop turns.
   *
   * Remotely it is the Vercel AI wire protocol against the agent's endpoint.
   * In the browser it is the in-page harness, carrying the prompt and the
   * tools rather than a URL.
   */
  protocol: ProtocolConfig;
  /**
   * The tools to pass the chat component — which is not always the tools.
   *
   * Against a runtime the chat runs frontend tools itself: a `tool-call`
   * arrives over the wire and it answers with the result. In the browser the
   * SDK owns the loop and calls the handlers directly, so handing them to the
   * chat as well would run every tool twice. Empty there, and the tools go to
   * the adapter instead.
   */
  chatFrontendTools?: FrontendToolDefinition[];
  /** The sandbox handed to the agent, when there is one. */
  jupyterSandboxUrl?: string;
  /** Whether the single creation attempt has been made. */
  createAttempted: boolean;
  /**
   * Why there is no agent, when there is none.
   *
   * Either the target has none to begin with, or there is no sandbox to give
   * it, or the one attempt to create it failed. All three are things an
   * example should say rather than retry.
   */
  unavailableReason?: string;
}

/**
 * An agent for an example, created once against a Jupyter sandbox.
 */
export function useExampleJupyterAgent(
  options: UseExampleJupyterAgentOptions,
): UseExampleJupyterAgentResult {
  const {
    exampleId,
    agentName,
    description,
    systemPrompt,
    serviceManager,
    model = DEFAULT_MODEL,
    frontendTools,
  } = options;

  const jupyterSandboxUrl = useMemo(
    () => exampleJupyterSandboxUrl(serviceManager),
    [serviceManager],
  );

  const agentConfig = useMemo<AgentConfig>(
    () => ({
      name: agentName,
      description,
      protocol: 'vercel-ai',
      model,
      systemPrompt,
      enableCodemode: false,
      sandboxVariant: 'jupyter-server',
      jupyterSandbox: jupyterSandboxUrl,
    }),
    [agentName, description, model, systemPrompt, jupyterSandboxUrl],
  );

  const result = useExampleAgentRuntime({
    exampleId,
    agentName,
    autoCreateAgent: false,
    agentConfig,
  });
  const { agentId, createAgent, hasAgent, chatGate, runtime, status, variant } =
    result;

  // The one branch this hook exists to hide. Everything about *reaching* an
  // agent differs between a runtime and this page; nothing else does.
  const inBrowser = runsInBrowser(variant);

  const { protocol, chatFrontendTools, needsSignIn } = useExampleAgentProtocol({
    inBrowser,
    agentName,
    systemPrompt,
    model,
    frontendTools,
    remoteBaseUrl: result.baseUrl,
  });

  const {
    attempted,
    created,
    error: createError,
  } = useCreateAgentOnce({
    /*
     * Three things have to be true before there is anything to attempt.
     *
     * The third — a connected runtime — is a precondition rather than a
     * preference: the store's `createAgent` needs one to know where to post,
     * and throws "No runtime connected" without it. On the cloud target that
     * runtime is launched by the shell, which finishes after the example has
     * mounted, so an attempt made on mount is always too early.
     *
     * The copies this hook replaced survived that ordering by accident: they
     * retried without limit, so one of the attempts eventually landed after
     * the runtime appeared. Waiting for the precondition is what makes a
     * single attempt correct — the effect simply does not run until it can
     * succeed.
     */
    // Nothing to create in the browser: the loop is already here, and there
    // is no runtime to register an agent on.
    enabled: !inBrowser && hasAgent && !!jupyterSandboxUrl && !!runtime,
    // Ours, by name. The runtime state is shared with the shell, which
    // registers an agent of its own on the cloud target — treating that as
    // "already created" is what left this example without one.
    alreadyCreated: agentId === agentName,
    createAgent,
    config: agentConfig,
  });

  const unavailableReason = !hasAgent
    ? chatGate.disableReason
    : inBrowser
      ? needsSignIn
        ? BROWSER_SIGN_IN_REASON
        : undefined
      : !jupyterSandboxUrl
        ? 'No Jupyter server to run this agent on. Start one and set VITE_JUPYTER_SANDBOX_URL, or switch the runtime target.'
        : !runtime
          ? // Still arriving is not a fault; still absent once everything has
            // settled is. Said out loud because the alternative — which this
            // replaces — was a chat that simply never appeared, with nothing
            // anywhere to say why.
            STARTING_UP.has(status)
            ? undefined
            : 'No runtime is connected, so there is nowhere to create this agent. Try switching the runtime target again.'
          : createError;

  return {
    ...result,
    // In the browser there is nothing to wait for: no runtime to start and no
    // agent to register. Elsewhere, our own call having returned — not a read
    // of the shared runtime state, which `connectAgent` rebuilds without an
    // agent id whenever anything reconnects, and which the shell writes to too.
    agentReady: inBrowser ? !needsSignIn : !!created || agentId === agentName,
    protocol,
    chatFrontendTools,
    jupyterSandboxUrl,
    createAttempted: attempted,
    unavailableReason,
  };
}

export default useExampleJupyterAgent;
