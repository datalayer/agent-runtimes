/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageLayout, IconButton } from '@primer/react';
import { SidebarCollapseIcon, SidebarExpandIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { Blankslate } from '@primer/react/experimental';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { datalayerTheme, DatalayerThemeProvider } from '@datalayer/core';
import { Chat } from '../components/chat';
import type { Transport, Extension } from '../components/chat';
import { useAgentsStore } from './stores/examplesStore';
import {
  MockFileBrowser,
  MainContent,
  Header,
  FooterMetrics,
  AgentConfiguration,
  type AgentLibrary,
} from './components';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Default configuration - use environment variable if available
// Note: Vercel AI connects to Jupyter server (8888), other protocols connect to agent-runtimes server (8765)
const DEFAULT_WS_URL =
  import.meta.env.VITE_ACP_WS_URL || 'ws://localhost:8765/api/v1/acp/ws';
const DEFAULT_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_AGENT_ID = 'demo-agent';

/**
 * Agent Runtime Example Component
 *
 * Demonstrates the multi-transport, multi-agent architecture of agent-runtimes.
 *
 * Features:
 * - Agent library selection (Pydantic AI, LangChain, Simple AI)
 * - Transport selection (ACP, AG-UI, A2A)
 * - Configurable WebSocket URL and Agent ID
 * - Real-time streaming responses
 * - Permission request handling
 * - Connection state management
 *
 * Usage:
 * 1. Start the agent-runtimes server: `npm run start:acp`
 * 2. The UI will automatically connect to the ACP server
 * 3. Select your agent library and transport
 * 4. Enter the WebSocket URL and Agent ID (or use defaults)
 * 5. Click Connect and start chatting!
 */
type AgentSpaceFormExampleProps = {
  initialWsUrl?: string;
  initialBaseUrl?: string;
  initialAgentName?: string;
  initialAgentLibrary?: AgentLibrary;
  initialTransport?: Transport;
  initialModel?: string;
  initialEnableCodemode?: boolean;
  initialAllowDirectToolCalls?: boolean;
  initialEnableToolReranker?: boolean;
  initialSelectedMcpServers?: string[];
  autoSelectMcpServers?: boolean;
};

const MOCK_SKILLS = [
  {
    id: 'batch-process',
    name: 'Batch Process Files',
    description: 'Process files in a directory with a reusable workflow.',
  },
  {
    id: 'analyze-csv',
    name: 'Analyze CSV',
    description: 'Summarize rows, columns, and headers from a CSV file.',
  },
  {
    id: 'pdf-extract',
    name: 'PDF Extract',
    description: 'Extract text and tables from PDF documents.',
  },
];

const AgentSpaceFormExample: React.FC<AgentSpaceFormExampleProps> = ({
  initialWsUrl = DEFAULT_WS_URL,
  initialBaseUrl = DEFAULT_BASE_URL,
  initialAgentName = DEFAULT_AGENT_ID,
  initialAgentLibrary = 'pydantic-ai',
  initialTransport = 'ag-ui',
  initialModel = 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  initialEnableCodemode = false,
  initialAllowDirectToolCalls = false,
  initialEnableToolReranker = false,
  initialSelectedMcpServers = [],
  autoSelectMcpServers = false,
}) => {
  const [wsUrl, setWsUrl] = useState(initialWsUrl);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [agentName, setAgentName] = useState(initialAgentName);
  const [selectedAgentId, setSelectedAgentId] = useState('new-agent');
  const [agentLibrary, setAgentLibrary] =
    useState<AgentLibrary>(initialAgentLibrary);
  const [transport, setTransport] = useState<Transport>(initialTransport);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [model, setModel] = useState(initialModel);
  const [isConfigured, setIsConfigured] = useState(false);

  // Agent capabilities state (moved from Header toggles)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [enableCodemode, setEnableCodemode] = useState(initialEnableCodemode);
  const [allowDirectToolCalls, setAllowDirectToolCalls] = useState(
    initialAllowDirectToolCalls,
  );
  const [enableToolReranker, setEnableToolReranker] = useState(
    initialEnableToolReranker,
  );
  const [selectedMcpServers, setSelectedMcpServers] = useState<string[]>(
    initialSelectedMcpServers,
  );
  const autoSelectRef = useRef(false);
  const enableSkills = selectedSkills.length > 0;

  // Handle codemode change - keep MCP server selections to scope codemode tools
  const handleEnableCodemodeChange = (enabled: boolean) => {
    setEnableCodemode(enabled);
    if (!enabled) {
      setAllowDirectToolCalls(false);
      setEnableToolReranker(false);
    }
  };

  // UI state
  const [activeSession, setActiveSession] = useState('session-1');
  const [richEditor, setRichEditor] = useState(false);
  const [durable, setDurable] = useState(true);
  const [codemode, _] = useState(false);
  const [showContextTree, setShowContextTree] = useState(false);
  const [showNotebook] = useState(true);
  const [leftPaneVisible, setLeftPaneVisible] = useState(true);
  const [rightPaneVisible, setRightPaneVisible] = useState(true);
  const [timeTravel, setTimeTravel] = useState(0);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Get agents and current agent from store
  const agents = useAgentsStore(state => state.agents);
  const currentAgent = useAgentsStore(state =>
    state.getAgentById(selectedAgentId),
  );
  const toggleAgentStatus = useAgentsStore(state => state.toggleAgentStatus);

  // Initialize transport from selected agent on mount
  useEffect(() => {
    if (currentAgent) {
      setTransport(currentAgent.transport);
      setAgentName(currentAgent.id);
    }
  }, [currentAgent]);

  // Auto-select MCP servers for codemode when requested
  useEffect(() => {
    if (!autoSelectMcpServers || autoSelectRef.current) return;
    if (!enableCodemode) return;
    if (selectedMcpServers.length > 0) return;
    if (!baseUrl) return;

    const loadServers = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/configure`);
        if (!response.ok) return;
        const data = await response.json();
        const servers = data?.mcpServers || [];
        const available = servers.filter((s: any) => s.isAvailable);
        if (available.length > 0) {
          setSelectedMcpServers([available[0].id]);
          autoSelectRef.current = true;
        }
      } catch {
        // no-op
      }
    };

    void loadServers();
  }, [autoSelectMcpServers, enableCodemode, selectedMcpServers, baseUrl]);

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId);
    setCreateError(null);
    if (agentId === 'new-agent') {
      // Reset to defaults for new agent
      setAgentName(DEFAULT_AGENT_ID);
      setTransport('ag-ui');
    } else {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        setAgentName(agent.id);
        setTransport(agent.transport);
      }
    }
  };

  /**
   * Create a new agent via the API
   */
  const createAgentOnServer = useCallback(async (): Promise<string | null> => {
    setIsCreatingAgent(true);
    setCreateError(null);

    try {
      const response = await fetch(`${baseUrl}/api/v1/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: agentName,
          description: `Agent created via UI (${agentLibrary})`,
          agent_library: agentLibrary,
          transport: transport,
          model: model,
          system_prompt: 'You are a helpful AI assistant.',
          enable_skills: enableSkills,
          enable_codemode: enableCodemode,
          allow_direct_tool_calls: allowDirectToolCalls,
          enable_tool_reranker: enableToolReranker,
          selected_mcp_servers: selectedMcpServers,
          skills: selectedSkills,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          errorData.detail || `Failed to create agent: ${response.status}`,
        );
      }

      const data = await response.json();
      console.log('[AgentRuntimeExample] Agent created:', data);
      return data.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create agent';
      console.error(
        '[AgentRuntimeExample] Error creating agent:',
        errorMessage,
      );
      setCreateError(errorMessage);
      return null;
    } finally {
      setIsCreatingAgent(false);
    }
  }, [
    baseUrl,
    agentName,
    agentLibrary,
    transport,
    model,
    enableSkills,
    enableCodemode,
    allowDirectToolCalls,
    enableToolReranker,
    selectedMcpServers,
    selectedSkills,
  ]);

  /**
   * Delete an agent via the API
   */
  const deleteAgentOnServer = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/agents/${agentId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          console.warn(
            `[AgentRuntimeExample] Failed to delete agent: ${response.status}`,
          );
          return false;
        }

        console.log('[AgentRuntimeExample] Agent deleted:', agentId);
        return true;
      } catch (error) {
        console.warn('[AgentRuntimeExample] Error deleting agent:', error);
        return false;
      }
    },
    [baseUrl],
  );

  const handleConnect = async () => {
    // For existing agents (not new-agent), ensure transport and agentName are set
    if (selectedAgentId !== 'new-agent') {
      const agent = agents.find(a => a.id === selectedAgentId);
      if (agent) {
        setTransport(agent.transport);
        setAgentName(agent.id);
      }
      setIsConfigured(true);
      return;
    }

    // For vercel-ai-jupyter, no server-side agent creation needed
    // It uses Jupyter server's built-in agent endpoint
    if (transport === 'vercel-ai-jupyter') {
      setIsConfigured(true);
      return;
    }

    // For new agents, first create the agent on the server
    if (transport === 'acp' && wsUrl && agentName) {
      const createdAgentId = await createAgentOnServer();
      if (createdAgentId) {
        setAgentName(createdAgentId);
        setIsConfigured(true);
      }
    } else if (
      (transport === 'ag-ui' ||
        transport === 'vercel-ai' ||
        transport === 'a2a') &&
      baseUrl &&
      agentName
    ) {
      const createdAgentId = await createAgentOnServer();
      if (createdAgentId) {
        setAgentName(createdAgentId);
        setIsConfigured(true);
      }
    }
  };

  const handleReset = async () => {
    // Delete the agent from the server if we created it
    if (selectedAgentId === 'new-agent' && agentName) {
      await deleteAgentOnServer(agentName);
    }
    setIsConfigured(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <DatalayerThemeProvider theme={datalayerTheme}>
        <PageLayout containerWidth="full">
          {/* Header - empty content for new agent */}
          <Header
            activeSession={activeSession}
            agentName={
              selectedAgentId === 'new-agent' ? undefined : currentAgent?.name
            }
            agentDescription={
              selectedAgentId === 'new-agent'
                ? undefined
                : currentAgent?.description
            }
            agentStatus={currentAgent?.status}
            richEditor={richEditor}
            durable={durable}
            showContextTree={showContextTree}
            isNewAgent={selectedAgentId === 'new-agent'}
            isConfigured={isConfigured}
            onSessionChange={setActiveSession}
            onRichEditorChange={setRichEditor}
            onDurableChange={setDurable}
            onToggleContextTree={() => setShowContextTree(!showContextTree)}
            onToggleStatus={
              currentAgent
                ? () => toggleAgentStatus(currentAgent.id)
                : undefined
            }
          />

          {/* Pane - Left Panel (File Browser or Blankslate) */}
          {leftPaneVisible ? (
            <>
              <Box
                sx={{
                  position: 'fixed',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 100,
                }}
              >
                <IconButton
                  icon={SidebarCollapseIcon}
                  aria-label="Collapse left pane"
                  size="small"
                  onClick={() => setLeftPaneVisible(false)}
                  sx={{
                    borderRadius: '0 6px 6px 0',
                    bg: 'canvas.default',
                    border: '1px solid',
                    borderLeft: 'none',
                    borderColor: 'border.default',
                  }}
                />
              </Box>
              <PageLayout.Pane
                position="start"
                resizable
                sticky
                width={{ min: '250px', default: '300px', max: '90px' }}
              >
                {selectedAgentId === 'new-agent' ? (
                  <Blankslate border spacious narrow>
                    <Blankslate.Visual>
                      <AiAgentIcon colored size={48} />
                    </Blankslate.Visual>
                    <Blankslate.Heading>New Agent</Blankslate.Heading>
                    <Box sx={{ textAlign: 'center' }}>
                      <Blankslate.Description>
                        Configure your new agent using the settings on the right
                      </Blankslate.Description>
                    </Box>
                  </Blankslate>
                ) : (
                  <MockFileBrowser codemode={codemode} />
                )}
              </PageLayout.Pane>
            </>
          ) : (
            <Box
              sx={{
                position: 'fixed',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
              }}
            >
              <IconButton
                icon={SidebarExpandIcon}
                aria-label="Expand left pane"
                size="small"
                onClick={() => setLeftPaneVisible(true)}
                sx={{
                  borderRadius: '0 6px 6px 0',
                  bg: 'canvas.default',
                  border: '1px solid',
                  borderLeft: 'none',
                  borderColor: 'border.default',
                }}
              />
            </Box>
          )}

          {/* Content - Main area (Notebook or placeholder) */}
          <PageLayout.Content>
            <MainContent
              showNotebook={showNotebook}
              timeTravel={timeTravel}
              onTimeTravelChange={setTimeTravel}
              richEditor={richEditor}
              notebookFile={currentAgent?.notebookFile}
              lexicalFile={currentAgent?.lexicalFile}
              isNewAgent={selectedAgentId === 'new-agent'}
            />
          </PageLayout.Content>

          {/* Right Pane - Agent Configuration & Chat */}
          {rightPaneVisible ? (
            <>
              <Box
                sx={{
                  position: 'fixed',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 100,
                }}
              >
                <IconButton
                  icon={SidebarCollapseIcon}
                  aria-label="Collapse right pane"
                  size="small"
                  onClick={() => setRightPaneVisible(false)}
                  sx={{
                    borderRadius: '6px 0 0 6px',
                    bg: 'canvas.default',
                    border: '1px solid',
                    borderRight: 'none',
                    borderColor: 'border.default',
                  }}
                />
              </Box>
              <PageLayout.Pane position="end" width="large" resizable sticky>
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    p: 2,
                  }}
                >
                  {!isConfigured ? (
                    <AgentConfiguration
                      agentLibrary={agentLibrary}
                      transport={currentAgent?.transport || transport}
                      extensions={extensions}
                      wsUrl={wsUrl}
                      baseUrl={baseUrl}
                      agentName={agentName}
                      model={model}
                      agents={agents}
                      selectedAgentId={selectedAgentId}
                      isCreatingAgent={isCreatingAgent}
                      createError={createError}
                      enableCodemode={enableCodemode}
                      allowDirectToolCalls={allowDirectToolCalls}
                      enableToolReranker={enableToolReranker}
                      availableSkills={MOCK_SKILLS}
                      selectedSkills={selectedSkills}
                      selectedMcpServers={selectedMcpServers}
                      onAgentLibraryChange={setAgentLibrary}
                      onTransportChange={setTransport}
                      onExtensionsChange={setExtensions}
                      onWsUrlChange={setWsUrl}
                      onBaseUrlChange={setBaseUrl}
                      onAgentNameChange={setAgentName}
                      onModelChange={setModel}
                      onAgentSelect={handleAgentSelect}
                      onConnect={handleConnect}
                      onEnableCodemodeChange={handleEnableCodemodeChange}
                      onAllowDirectToolCallsChange={setAllowDirectToolCalls}
                      onEnableToolRerankerChange={setEnableToolReranker}
                      onSelectedSkillsChange={setSelectedSkills}
                      onSelectedMcpServersChange={setSelectedMcpServers}
                    />
                  ) : (
                    /* Chat Interface */
                    <Box sx={{ flex: 1 }}>
                      <Chat
                        transport={currentAgent?.transport || transport}
                        extensions={extensions}
                        wsUrl={wsUrl}
                        baseUrl={baseUrl}
                        agentId={currentAgent?.id || agentName}
                        title={
                          currentAgent?.name || agentName || 'AI Assistant'
                        }
                        autoConnect={true}
                        autoFocus={true}
                        placeholder="Type your message to the agent..."
                        height="calc(100vh - 250px)"
                        showModelSelector={true}
                        showToolsMenu={true}
                        codemodeEnabled={enableCodemode}
                        initialModel={model}
                        initialMcpServers={selectedMcpServers}
                        suggestions={[
                          {
                            title: '👋 Say hello',
                            message: 'Hello! What can you help me with today?',
                          },
                          {
                            title: '💡 Get ideas',
                            message:
                              'Can you suggest some creative project ideas?',
                          },
                          {
                            title: '📝 Explain concepts',
                            message: 'Can you explain how AI agents work?',
                          },
                          {
                            title: '🔧 Help with code',
                            message: 'Can you help me write some Python code?',
                          },
                        ]}
                        onDisconnect={handleReset}
                        onMessageSent={(_content: string) => {
                          // Message sent
                        }}
                        onMessageReceived={(_message: unknown) => {
                          // Message received
                        }}
                      />
                    </Box>
                  )}
                </Box>
              </PageLayout.Pane>
            </>
          ) : (
            <Box
              sx={{
                position: 'fixed',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
              }}
            >
              <IconButton
                icon={SidebarExpandIcon}
                aria-label="Expand right pane"
                size="small"
                onClick={() => setRightPaneVisible(true)}
                sx={{
                  borderRadius: '6px 0 0 6px',
                  bg: 'canvas.default',
                  border: '1px solid',
                  borderRight: 'none',
                  borderColor: 'border.default',
                }}
              />
            </Box>
          )}

          {/* Footer */}
          <PageLayout.Footer
            divider="line"
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              bg: 'canvas.default',
              zIndex: 10,
            }}
          >
            {selectedAgentId !== 'new-agent' && (
              <FooterMetrics tokens={1523552} cost={2.01} />
            )}
          </PageLayout.Footer>
        </PageLayout>
      </DatalayerThemeProvider>
    </QueryClientProvider>
  );
};

export default AgentSpaceFormExample;
