/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentRuntimeChatExample
 *
 * The unified Chat component, with whatever agent the selected runtime target
 * can give it.
 *
 * Against a runtime that means creating one from the `example-simple` spec
 * over the REST API and talking to its endpoint. In the browser it means the
 * in-page harness: the spec asks for `pydantic-ai`, but a page has no server
 * to turn that loop, so the location decides and the Vercel AI SDK runs it
 * here instead.
 *
 * This example is the plainest case of that split — no sandbox, no tools, no
 * surface, just a conversation — which is why the choice lives in
 * `useExampleAgentProtocol` rather than in the notebook-shaped hook it started
 * out in.
 *
 * Backend: POST /api/v1/agents  →  /api/v1/ag-ui/{agentId}/
 */

import React, { useMemo } from 'react';
import { Text, Spinner } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import {
  BROWSER_SIGN_IN_REASON,
  useExampleAgentProtocol,
} from './hooks/useExampleAgentProtocol';
import { runsInBrowser } from '../runtimes/variants';
import { EXAMPLE_SIMPLE_AGENTSPEC_0_0_1 } from '../specs/agents/agents';
import { ErrorView } from './components';
import { Chat } from '../chat';

setupPrimerPortals();

const AGENTSPEC_ID = 'example-simple';
const AGENT_NAME = 'simple';

const SPEC = EXAMPLE_SIMPLE_AGENTSPEC_0_0_1;

const AgentRuntimeChatExample: React.FC = () => {
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, baseUrl, error, status, isReady, variant } =
    useExampleAgentRuntime({
      exampleId: 'ChatExample',
      agentName,
      specId: AGENTSPEC_ID,
      agentConfig: {
        protocol: 'ag-ui',
        agentSpecId: AGENTSPEC_ID,
      },
    });

  const inBrowser = runsInBrowser(variant);
  const { protocol, needsSignIn } = useExampleAgentProtocol({
    inBrowser,
    agentName,
    systemPrompt: SPEC.systemPrompt,
    model: SPEC.model,
    remoteBaseUrl: baseUrl,
  });

  // There is nothing to create in the browser, so nothing to wait for either.
  const isCreating = !inBrowser && !isReady && status !== 'error';

  // Loading state while agent is being created
  if (isCreating) {
    return (
      <ThemedProvider>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 3,
            bg: 'canvas.default',
          }}
        >
          <Spinner size="large" />
          <Text sx={{ color: 'fg.muted' }}>
            Creating agent from {AGENTSPEC_ID}...
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  // Error state. In the browser there is no agent id to have — the loop is
  // here — so the only thing that can be missing is the sign-in the inference
  // service requires.
  const failure = inBrowser
    ? needsSignIn
      ? BROWSER_SIGN_IN_REASON
      : error
    : error || (!agentId ? 'No agent ID returned' : undefined);
  if (failure) {
    return (
      <ThemedProvider>
        <ErrorView error="Failed to start agent" detail={failure} />
      </ThemedProvider>
    );
  }

  // Agent is ready — render the Chat component
  return (
    <Chat
      protocol={inBrowser ? protocol : 'ag-ui'}
      baseUrl={baseUrl}
      agentId={agentName}
      title="Simple Agent"
      placeholder="Send a message..."
      description="Chat with a simple AI assistant"
      showHeader={true}
      kernelIndicatorPlacement="right"
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      height="100vh"
      runtimeId={agentName}
      historyEndpoint={
        inBrowser ? undefined : `${baseUrl}/api/v1/history`
      }
      suggestions={[
        {
          title: 'Hello',
          message: 'Hello, what can you do?',
        },
        {
          title: 'Help',
          message: 'What tools do you have available?',
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentRuntimeChatExample;
