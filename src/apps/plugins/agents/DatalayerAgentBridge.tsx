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
 * @module apps/plugins/agents/DatalayerAgentBridge
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useReactorPlatform, useSignalValue } from '@datalayer/reactor/react';

import { useAgentRuntimes } from '../../../hooks/useAgentRuntimes';
import { ensureVisitorAgent } from '../../apps/visitorToken';
import { AGENTSPECS } from '../../../specs/agents/agents';
import { IDLE_SANDBOX_TARGET_SIGNAL } from '../../core';
import { appLaunchOf } from './appLaunch';
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
  const agentsConfig = reactor.getConfig<AgentsConfig>(AGENTS_PLUGIN_NAME);
  const agentSpecId =
    agentsConfig?.datalayerAgentSpecId ?? DEFAULT_DATALAYER_AGENTSPEC;
  const createPayload = agentsConfig?.datalayerCreatePayload;
  // A conversation without an account (LOOP R-30): the agent is already on
  // the visitors' runtime, kept warm there; nothing is allocated or made.
  const visitors = agentsConfig?.datalayerVisitors;
  // A deployment kept on a runtime of its own (LOOP R-33): its agent was made
  // there from the deployment record as the runtime started; nothing is
  // allocated or made either.
  const kept = agentsConfig?.datalayerKept;
  const already = visitors?.url ?? kept?.url;

  const service = useOptionalSandboxService();
  const target = useSignalValue(service?.target ?? IDLE_SANDBOX_TARGET_SIGNAL);
  const onDatalayer = target === 'datalayer';

  /*
   * On the visitors' runtime, the application's agent made before the page
   * follows it (STUDIO D-15): an application at its address has none until
   * a visitor opens it, and its runtime holds no plugin of it until then —
   * so the page's plugin of the pair (F-15) would stand down and its chat
   * have nothing to speak to. Asked with a visitor's token, the runtime
   * makes it and says which agent it is; the runtime is reported only then,
   * and its refusal is said in its sentence.
   */
  const visitorAppId = (createPayload?.app_spec as { id?: unknown } | undefined)
    ?.id;
  const [visitorAgent, setVisitorAgent] = useState<{
    ready?: boolean;
    error?: string;
  }>({});
  useEffect(() => {
    setVisitorAgent({});
    if (!visitors || !onDatalayer) {
      return;
    }
    if (typeof visitorAppId !== 'string' || !visitorAppId) {
      setVisitorAgent({
        error:
          'A conversation without an account runs an application: none was given.',
      });
      return;
    }
    let current = true;
    ensureVisitorAgent(visitors, visitorAppId)
      .then(() => {
        if (current) {
          setVisitorAgent({ ready: true });
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setVisitorAgent({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      current = false;
    };
    // By what it is, not by the host's object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visitors?.url,
    visitors?.app,
    visitors?.inferenceUrl,
    visitorAppId,
    onDatalayer,
  ]);

  /*
   * The agent hook, asked for a spec.
   *
   * `autoStart` only while Datalayer is the target: mounting this bridge must
   * not allocate a cloud runtime for somebody working in their browser, and a
   * runtime allocated by accident is one somebody pays for.
   */
  /*
   * The spec, restated as the config the agent is created from.
   *
   * `agentSpecId` as a hook option says which runtime to allocate. Creating
   * the agent on it reads `agentConfig`, and that is a different object —
   * which this passed nothing for, so the create refused with "Agent model is
   * required. Provide config.model from the selected spec/config." The
   * failure surfaced as `connected-dead` because nothing else about it
   * reached the page.
   *
   * The Notebook Agent example does not hit this: it builds a config with the
   * spec id in it and hands that over. Same thing, said in the place the
   * creation actually looks.
   */
  // An application names its own agent and transport; a bare spec, the spec's.
  const agentName =
    typeof createPayload?.name === 'string' ? createPayload.name : agentSpecId;
  const protocol =
    createPayload?.transport === 'ag-ui' ||
    createPayload?.transport === 'vercel-ai'
      ? (createPayload.transport as 'ag-ui' | 'vercel-ai')
      : undefined;
  const agentConfig = useMemo(
    () => ({
      name: agentName,
      ...(protocol ? { protocol } : {}),
      agentSpecId,
      model: AGENTSPECS[agentSpecId]?.model,
      description: AGENTSPECS[agentSpecId]?.description,
      // An application's spec, when the workspace runs one.
      ...(createPayload ? { createPayload } : {}),
    }),
    [agentSpecId, agentName, protocol, createPayload],
  );

  /*
   * The application the runtime is launched for (STUDIO R-19): its Appspec
   * and where it runs, read from the payload its agent is created with — the
   * Studio's Preview, the hosted page signed in. Sent with the launch, so the
   * runtime is given the secrets its connections declare before its agent is
   * made; without it, a connection needing a secret is refused on the
   * runtime. A bare spec launches none.
   */
  const appLaunch = useMemo(() => appLaunchOf(createPayload), [createPayload]);

  const { runtime, status, error } = useAgentRuntimes({
    agentSpecId,
    agentConfig,
    ...(appLaunch ? { appLaunch } : {}),
    variant: 'cloud-pydanticai',
    autoStart: onDatalayer && !already,
    autoCreateAgent: onDatalayer && !already,
  });

  useEffect(() => {
    if (!service || !onDatalayer) {
      return;
    }
    if (visitors) {
      if (visitorAgent.error) {
        service.setState('error', visitorAgent.error);
        return;
      }
      if (!visitorAgent.ready) {
        service.setState('starting');
        return;
      }
    }
    if (already) {
      service.report({
        variant: 'datalayer',
        // No sandbox reported: the agent is already on its runtime, and the
        // chat is all the page talks to.
        sandbox_running: false,
        agent_base_url: already,
      });
      return;
    }
    if (error) {
      // The reason travels with the state. "connected-dead" and a column of
      // "unknown" is what a reader saw before, which names the symptom and
      // hides the cause.
      // `error` is already a message from the hook; `String()` on it would
      // only matter if it were not, and would print `[object Object]` if so.
      service.setState('error', error);
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
  }, [
    service,
    onDatalayer,
    runtime,
    status,
    error,
    already,
    visitors,
    visitorAgent,
  ]);

  return null;
}

export default DatalayerAgentBridge;
