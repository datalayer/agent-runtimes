/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Notebook Agent with Agent-Runtimes Integration
 *
 * This example demonstrates using the agent-runtimes ChatFloating component
 * with notebook tools for AI-assisted notebook editing.
 *
 * To run this example:
 * 1. Start the agent-runtimes server: `npm run start:server`
 * 2. Start the frontend: `npm run dev`
 *
 * @module examples/NotebookAgentExample
 */

import type { JSX } from 'react';
import React, { useCallback, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager, Session } from '@jupyterlab/services';
import { Notebook, OnSessionConnection } from '@datalayer/jupyter-react';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import { ThemedJupyterProvider } from './utils/themedProvider';

// Agent-runtimes imports
import { ChatFloating } from '../chat';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { useExampleJupyterAgent } from './hooks/useExampleJupyterAgent';

// Import Matplotlib notebook
import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';

import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';

// Fixed notebook ID
const NOTEBOOK_ID = 'agui-notebook-example';

// Use the imported Matplotlib notebook
const NOTEBOOK_CONTENT = MatplotlibNotebook;

const AGENT_ID = 'notebook-agent-runtime-example';

/**
 * Notebook UI component (without tool registration)
 */
interface NotebookUIProps {
  serviceManager?: ServiceManager.IManager;
  onSessionConnection?: OnSessionConnection;
}

const NotebookUI = React.memo(function NotebookUI({
  serviceManager,
  onSessionConnection,
}: NotebookUIProps): JSX.Element {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: 3,
      }}
    >
      <Box
        sx={{
          marginBottom: 3,
          paddingBottom: 3,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Box as="h1" sx={{ margin: 0 }}>
          Notebook Agent Example
        </Box>
        <p>
          Platform-agnostic usage with agent-runtimes integration. Use the AI
          Agent to manipulate the Notebook.
        </p>
      </Box>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          padding: 3,
          backgroundColor: 'canvas.default',
        }}
      >
        {serviceManager ? (
          <ThemedJupyterProvider>
            <Notebook
              nbformat={NOTEBOOK_CONTENT}
              id={NOTEBOOK_ID}
              Toolbar={ExampleNotebookToolbar}
              serviceManager={serviceManager}
              onSessionConnection={onSessionConnection}
              height="calc(100vh - 300px)"
              cellSidebarMargin={120}
              startDefaultKernel={true}
            />
          </ThemedJupyterProvider>
        ) : (
          <Box sx={{ padding: 3 }}>
            <p>Loading service manager...</p>
          </Box>
        )}
      </Box>
    </Box>
  );
});

/**
 * Component that renders the Notebook UI with ChatFloating and tool registration.
 */
interface NotebookWithChatProps {
  serviceManager?: ServiceManager.IManager;
}

function NotebookWithChat({
  serviceManager,
}: NotebookWithChatProps): JSX.Element {
  const [notebookKernel, setNotebookKernel] =
    useState<IKernelConnection | null>(null);

  // Get notebook tools. Which of the chat and the harness runs them depends on
  // where the loop turns, and the hook decides that.
  const frontendTools = useNotebookTools(NOTEBOOK_ID);

  const {
    agentReady,
    protocol: protocolConfig,
    chatFrontendTools,
    error,
    unavailableReason,
  } = useExampleJupyterAgent({
    exampleId: 'NotebookAgentExample',
    agentName: AGENT_ID,
    description: 'Demo agent for notebook example',
    systemPrompt:
      'You are a helpful AI assistant that helps users work with Jupyter notebooks. For notebook operations, always use the notebook frontend tools (runCell, readAllCells, readCell, insertCell, updateCell, deleteCells) so actions happen in the live notebook UI. Use executeCodeInNotebook only for temporary inspection code that should not modify notebook cells.',
    serviceManager,
    frontendTools,
  });

  // The example's own agent, not merely the runtime: on the cloud target the
  // runtime is ready before this agent has been registered on it.
  const effectiveReady = agentReady;
  // One failed attempt is reported, not retried — see `useExampleJupyterAgent`.
  const chatError = error || unavailableReason;

  const handleSessionConnection = useCallback(
    (session: Session.ISessionConnection | undefined) => {
      setNotebookKernel(session?.kernel ?? null);
    },
    [],
  );

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <NotebookUI
        serviceManager={serviceManager}
        onSessionConnection={handleSessionConnection}
      />

      {chatError && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            padding: 3,
            backgroundColor: 'danger.subtle',
            color: 'danger.fg',
            borderRadius: 2,
            maxWidth: 300,
          }}
        >
          <strong>Error:</strong> {chatError}
        </Box>
      )}

      {effectiveReady && (
        <ChatFloating
          protocol={protocolConfig}
          title="Notebook AI Agent Runtime"
          description="Hi! I can help you edit notebook cells. Try: 'Add a new code cell', 'Run cell 1', or 'Delete the last cell'"
          defaultOpen={true}
          defaultViewMode="panel"
          position="bottom-right"
          frontendTools={chatFrontendTools}
          useStore={false}
          /*
            Every control this chat has, which is what an example is for.

            The menus draw themselves only where there is something behind
            them: on a remote agent the config request answers and all three
            appear, while an in-page agent has no config endpoint to ask, so
            tools and skills are simply absent rather than pending. That used
            to read as "Loading controls..." for ever.
          */
          showModelSelector={true}
          showToolsMenu={true}
          showSkillsMenu={true}
          showTokenUsage={true}
          // The ring, here of all places: an agent working through a notebook
          // is the case that actually fills a context window, so how it is
          // being spent is worth a picture rather than two numbers.
          showContextRing={true}
          showInformation={true}
          showHeader={true}
          // The Lexical editor, which is the one with the `@` menu.
          promptVariant="lexical"
          panelProps={{
            kernel: notebookKernel,
          }}
          suggestions={[
            {
              title: 'Add a cell',
              message: 'Insert a random cell to the notebook',
            },
            {
              title: 'Run the first cell',
              message: 'Run the first cell in the notebook',
            },
            {
              title: 'Show cells',
              message:
                'Show the notebook cells content and compute the number of cells',
            },
            {
              title: 'Analyze Titanic',
              message:
                'Analyze the Titanic dataset and provide insights about the passengers and survival rates',
            },
          ]}
        />
      )}
    </Box>
  );
}

/**
 * Main Agent Runtime notebook example component
 */
interface AgentRuntimeNotebookExampleProps {
  serviceManager?: ServiceManager.IManager;
}

function AgentRuntimeNotebookExample({
  serviceManager,
}: AgentRuntimeNotebookExampleProps): JSX.Element {
  return <NotebookWithChat serviceManager={serviceManager} />;
}

export default AgentRuntimeNotebookExample;
