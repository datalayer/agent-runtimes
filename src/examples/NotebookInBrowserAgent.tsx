/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A notebook agent with no server behind it.
 *
 * `NotebookAgentExample` is the same idea run the usual way: it allocates a
 * runtime, creates an agent on it, points a chat at that agent's endpoint, and
 * the loop turns server-side in pydantic-ai. This one runs the loop in the
 * page with the Vercel AI SDK, and the difference in this file is mostly what
 * is *absent* — no runtime, no sandbox, no endpoint, no lifecycle.
 *
 * The chat is the same `<ChatFloating>` the other notebook examples use, in
 * the same right-hand panel, with the spec's own suggestions in its empty
 * state. That is the point of putting the browser harness behind a protocol
 * adapter: where the loop turns is the adapter's business, and the chat does
 * not have to know.
 *
 * **Tools go to the adapter, not to the chat.** In the AG-UI examples the
 * runtime asks and `ChatBase` answers, so they pass `frontendTools` to the
 * chat. Here the SDK owns the loop and calls the handlers itself — passing
 * them to the chat as well would run every tool twice. Same array, from the
 * same `useNotebookTools`; handed to whoever is turning the loop.
 *
 * The one thing this agent still needs a server for is the model: a browser
 * cannot hold an AWS credential, so it asks the Datalayer inference service,
 * which holds them and routes to Bedrock. That is a question-and-answer, not a
 * place the agent lives — but it does mean an account. The service admits
 * platform members only, so the chat is switched off with a reason when there
 * is no token to send, rather than 401-ing on the first turn.
 *
 * Spec: `jupyter-notebook-compactor-inbrowser`, whose `harness: vercel-ai` is
 * what says it belongs here.
 *
 * @module examples/NotebookInBrowserAgent
 */

import { useEffect, useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Spinner, Text } from '@primer/react';
import type { ServiceManager } from '@jupyterlab/services';
import { Notebook } from '@datalayer/jupyter-react';

import { ChatFloating } from '../chat';
import { browserModelRequiresSignIn } from '../runtimes/browser';
import { specHarnessOf, SPEC_HARNESS_BY_HARNESS } from '../runtimes/variants';
import { JUPYTER_NOTEBOOK_COMPACTOR_INBROWSER_AGENTSPEC_0_0_1 } from '../specs/agents/agents';
import { useCoreStore, useIAMStore } from '../state';
import type { ProtocolConfig } from '../types/protocol';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import {
  agentSummaryStore,
  type AgentSummary as AgentSummaryRecord,
} from './utils/agentSummaryStore';
import { ThemedJupyterProvider, ThemedProvider } from './utils/themedProvider';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';
import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';

const SPEC = JUPYTER_NOTEBOOK_COMPACTOR_INBROWSER_AGENTSPEC_0_0_1;

/** The notebook this agent works on — the one rendered beside the chat. */
const NOTEBOOK_ID = 'notebook-in-browser-agent';

/** This example's key in the shared summary store. */
const EXAMPLE_ID = 'NotebookInBrowserAgent';

/**
 * The harness this spec asks for, in the spelling a spec uses.
 *
 * Read back through the vocabulary rather than off `SPEC.harness` directly, so
 * a spec that declares none still reports the framework that would run it.
 */
const SPEC_HARNESS = SPEC_HARNESS_BY_HARNESS[specHarnessOf(SPEC)];

/** The spec's suggestions, as the chat's empty state wants them. */
const SUGGESTIONS = (SPEC.suggestions ?? []).map(message => ({
  // The first clause is the handle; the whole line is what gets sent.
  title: message.replace(/[.!?]$/, ''),
  message,
}));

export type NotebookInBrowserAgentProps = {
  /**
   * The Jupyter runtime for the notebook itself.
   *
   * Only the notebook needs it — the agent does not. It edits cells through
   * the frontend tools, and a compaction never has to run anything.
   */
  serviceManager?: ServiceManager.IManager;
};

/**
 * A notebook and an agent that edits it, both running in this page.
 */
function NotebookInBrowserAgent({
  serviceManager,
}: NotebookInBrowserAgentProps): JSX.Element {
  const { configuration } = useCoreStore();
  const token = useIAMStore(state => state.token);

  // The same tools the AG-UI examples pass to `<ChatFloating frontendTools>`.
  // They go to the adapter instead — see the note at the top of this module.
  const frontendTools = useNotebookTools(NOTEBOOK_ID);

  const inference = useMemo(
    () => ({
      inferenceUrl:
        configuration?.aiInferenceUrl || 'https://prod1.datalayer.run',
      // The signed-in person's token, forwarded to the inference service so
      // the completion is made as them and metered to them.
      token: token || undefined,
    }),
    [configuration?.aiInferenceUrl, token],
  );

  const needsSignIn = browserModelRequiresSignIn(inference);

  /**
   * Everything the browser harness needs, in the shape the chat passes on.
   *
   * `endpoint` is empty and stays empty: there is nothing to address. The live
   * objects travel in `options`, which is the seam `createProtocolAdapter`
   * leaves for an adapter whose configuration is not a URL.
   */
  const protocol = useMemo<ProtocolConfig>(
    () => ({
      type: 'browser-vercel-ai',
      endpoint: '',
      agentId: SPEC.id,
      options: {
        instructions: SPEC.systemPrompt,
        model: SPEC.model,
        frontendTools,
        inference,
      },
    }),
    [frontendTools, inference],
  );

  /**
   * What this agent is, for the summary badge.
   *
   * Most of these fields are empty, and that is the honest report rather than
   * missing data: there is no runtime to address, no sandbox to execute in and
   * no server-side agent record to have an id. What the badge does carry is
   * the three that say why — the spec, the harness it asks for, and the
   * variant running it.
   */
  const summary = useMemo<AgentSummaryRecord>(
    () => ({
      exampleId: EXAMPLE_ID,
      agentName: SPEC.id,
      specId: SPEC.id,
      harness: SPEC_HARNESS,
      variant: 'browser-vercelai',
      location: 'browser',
      baseUrl: '',
      status: needsSignIn ? 'signed out' : 'ready',
      isReady: !needsSignIn,
    }),
    [needsSignIn],
  );

  // Published to the shared store, so the examples shell shows this agent in
  // its header — with the spec, the harness and the variant — like any other.
  useEffect(() => {
    agentSummaryStore.getState().setActive(summary);
    return () => agentSummaryStore.getState().clearActive(EXAMPLE_ID);
  }, [summary]);

  return (
    <ThemedProvider>
      <Box sx={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            p: 3,
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Box as="h1" sx={{ m: 0, fontSize: 4 }}>
              Notebook Compactor, in the browser
            </Box>
            <Text sx={{ color: 'fg.muted' }}>{SPEC.description}</Text>
          </Box>

          {serviceManager ? (
            // Only the notebook is wrapped: `JupyterReactTheme` nests a Primer
            // theme of its own, and wrapping the whole example in it would
            // make the surrounding chrome read its colours from that theme
            // rather than the app's.
            <ThemedJupyterProvider>
              <Notebook
                nbformat={MatplotlibNotebook}
                id={NOTEBOOK_ID}
                Toolbar={ExampleNotebookToolbar}
                serviceManager={serviceManager}
                height="calc(100vh - 300px)"
                cellSidebarMargin={120}
              />
            </ThemedJupyterProvider>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Spinner size="small" />
              <Text sx={{ color: 'fg.muted' }}>Starting the notebook…</Text>
            </Box>
          )}
        </Box>

        <ChatFloating
          protocol={protocol}
          title={SPEC.name}
          description={SPEC.welcomeMessage}
          defaultOpen={true}
          defaultViewMode="panel"
          position="bottom-right"
          useStore={false}
          suggestions={SUGGESTIONS}
          // No model or tools menus: both let a person change what the agent
          // is, and both are answered by the runtime this agent does not have.
          showModelSelector={false}
          showToolsMenu={false}
          showSkillsMenu={false}
          disabled={needsSignIn}
          disableReason="Sign in to use this agent. The loop runs in your browser and needs no runtime, but the model it asks is reached through the Datalayer inference service, which answers to signed-in members only."
        />
      </Box>
    </ThemedProvider>
  );
}

export { NotebookInBrowserAgent };
export default NotebookInBrowserAgent;
