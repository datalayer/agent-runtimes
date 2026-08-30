/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Datalayer target: a real agent, launched from a spec.
 *
 * It used to be a *sandbox* setting. Choosing Datalayer told the host's own
 * agent-runtimes server to run its sandbox on a Datalayer runtime, which gave
 * a Jupyter server in the cloud and an agent still running locally. That is a
 * different thing from what the target says it is, and it showed: a person
 * picked Datalayer and stayed on whatever agent the host had.
 *
 * So this target goes through the agent hook instead — the same one every
 * example uses — and asks for an agentspec by name. The platform allocates a
 * runtime, creates the agent on it from the spec, and hands back both halves:
 * the Jupyter ingress the notebook binds to, and the agent-runtimes base URL
 * the chat talks to. Both are reported into the sandbox service, because that
 * is where every surface already reads from.
 *
 * A component rather than part of the switchable service, because launching is
 * a hook and a service is not a React thing. It renders nothing.
 *
 * @module loop/plugins/agents/DatalayerAgentBridge
 */

import { useEffect } from 'react';
import { useReactorPlatform, useSignalValue } from '@datalayer/reactor/react';

import { useAgentRuntimes } from '../../../hooks/useAgentRuntimes';
import { IDLE_SANDBOX_TARGET_SIGNAL } from '../../core';
import { AGENTS_PLUGIN_NAME, type AgentsConfig } from './plugin';
import { useOptionalSandboxService } from './useSandboxService';

/**
 * The tutor.
 *
 * The front door of the notebook team, and the agent a person landing on a
 * Datalayer runtime should meet first. A host that wants another names it in
 * this plugin's config.
 */
const DEFAULT_DATALAYER_AGENTSPEC = 'jupyter-tutor';

export function DatalayerAgentBridge(): JSX.Element | null {
  const reactor = useReactorPlatform();
  const agentSpecId =
    reactor.getConfig<AgentsConfig>(AGENTS_PLUGIN_NAME)?.datalayerAgentSpecId ??
    DEFAULT_DATALAYER_AGENTSPEC;

  const service = useOptionalSandboxService();
  const target = useSignalValue(service?.target ?? IDLE_SANDBOX_TARGET_SIGNAL);
  const onDatalayer = target === 'datalayer';

  /*
   * The agent hook, asked for a spec.
   *
   * `autoStart` only while Datalayer is the target: mounting this bridge must
   * not allocate a cloud runtime for somebody working in their browser, and a
   * runtime allocated by accident is one somebody pays for.
   */
  const { runtime, status, error } = useAgentRuntimes({
    agentSpecId,
    variant: 'cloud-pydanticai',
    autoStart: onDatalayer,
    autoCreateAgent: onDatalayer,
  });

  useEffect(() => {
    if (!service || !onDatalayer) {
      return;
    }
    if (error) {
      service.setState('error');
      return;
    }
    if (!runtime?.jupyterBaseUrl) {
      // Still allocating. Said as a lifecycle state rather than a status, so
      // the surfaces show "starting" instead of claiming there is nothing.
      service.setState(status === 'error' ? 'error' : 'starting');
      return;
    }
    service.report({
      variant: 'datalayer',
      // The *sandbox*, not the agent. `runtime.isReady` answers "is the agent
      // registered and reachable", which is a separate and later event than
      // "does this runtime serve kernels". Gating the sandbox on it left the
      // workspace showing a live r1 server URL with no notebook and no chat
      // behind it, and a kernel indicator reporting `connected-dead` for a
      // pod that was up: the ingress was usable the whole time, nothing had
      // been told it was.
      sandbox_running: Boolean(runtime.serviceManager),
      jupyter_url: runtime.jupyterBaseUrl,
      // The ingress token travels with the manager the platform built, not
      // on the connection itself.
      jupyter_token: runtime.serviceManager?.serverSettings?.token,
      kernel_id: runtime.kernelId,
      // Where the agent actually is. Without this the chat would address the
      // host's server for an agent that is not on it.
      agent_base_url: runtime.agentBaseUrl,
    });
  }, [service, onDatalayer, runtime, status, error]);

  return null;
}

export default DatalayerAgentBridge;
