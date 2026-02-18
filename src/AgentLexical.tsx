/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentLexical
 *
 * Standalone Lexical editor + chat interface served at /static/agent-lexical.html.
 * Connects to the agent-runtimes AG-UI endpoint and provides a Lexical
 * rich-text editor alongside the Chat component with lexical tools registered.
 *
 * The page is opened by codeai with a URL like:
 *   http://127.0.0.1:<port>/static/agent-lexical.html?agentId=<id>
 *
 * Query parameters:
 *   - agentId: the agent identifier (required, set by codeai)
 *   - jupyterBaseUrl: base URL for the Jupyter server (optional, falls back to jupyter-config-data)
 *   - jupyterToken: token for the Jupyter server (optional, falls back to jupyter-config-data)
 */

import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { $getRoot, $createParagraphNode, EditorState } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { registerCodeHighlighting } from '@lexical/code';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { Text, Spinner } from '@primer/react';
import { AlertIcon } from '@primer/octicons-react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import {
  JupyterReactTheme,
  loadJupyterConfig,
  createServerSettings,
  getJupyterServerUrl,
  getJupyterServerToken,
  setJupyterServerUrl,
  setJupyterServerToken,
  useJupyter,
} from '@datalayer/jupyter-react';
import {
  ComponentPickerMenuPlugin,
  JupyterCellPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  ImagesPlugin,
  HorizontalRulePlugin,
  EquationsPlugin,
  YouTubePlugin,
  ExcalidrawPlugin,
  CollapsiblePlugin,
  AutoLinkPlugin,
  AutoEmbedPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  FloatingTextFormatToolbarPlugin,
  CodeActionMenuPlugin,
  ListMaxIndentLevelPlugin,
  TableCellResizerPlugin,
  TablePlugin,
} from '@datalayer/jupyter-lexical';
import { ServiceManager } from '@jupyterlab/services';
import { Chat } from './components/chat';
import { ChatInlinePlugin } from './lexical/ChatInlinePlugin';
import { useChatInlineToolbarItems } from './lexical/useChatInlineToolbarItems';
import { useLexicalTools } from './tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './examples/lexical/editorConfig';
import { DEFAULT_MODEL } from './specs';

import '@datalayer/jupyter-lexical/style/index.css';
import './examples/lexical/lexical-theme.css';
import '@datalayer/jupyter-lexical/style/modal-overrides.css';
import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;
const LEXICAL_ID = 'agent-lexical';

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function getAgentId(): string {
  return getQueryParam('agentId') || 'default';
}

/**
 * Initialise Jupyter configuration.
 *
 * Priority:
 *   1. Query parameters (jupyterBaseUrl / jupyterToken)
 *   2. <script id="jupyter-config-data"> block in the HTML page
 */
function initJupyterConfig() {
  loadJupyterConfig();

  const qBaseUrl = getQueryParam('jupyterBaseUrl');
  const qToken = getQueryParam('jupyterToken');

  if (qBaseUrl) setJupyterServerUrl(qBaseUrl);
  if (qToken) setJupyterServerToken(qToken);

  const el = document.getElementById('jupyter-config-data');
  if (el?.textContent) {
    try {
      const cfg = JSON.parse(el.textContent);
      if (!qBaseUrl && cfg.baseUrl) setJupyterServerUrl(cfg.baseUrl);
      if (!qToken && cfg.token) setJupyterServerToken(cfg.token);
    } catch {
      // ignore
    }
  }
}

// ─── Lexical plugins ────────────────────────────────────────────────────────

/**
 * Lexical plugin for loading initial content into the editor.
 */
function LoadContentPlugin({ content }: { content?: string }) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!content || !isFirstRender.current) {
      return;
    }

    isFirstRender.current = false;
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && parsed.root) {
        const editorState = editor.parseEditorState(content);
        editor.setEditorState(editorState, { tag: 'history-merge' });
      } else {
        throw new Error('Invalid Lexical editor state format');
      }
    } catch {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        },
        { tag: 'history-merge' },
      );
    }
  }, [content, editor]);

  return null;
}

function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

function KernelPluginsInner() {
  const { defaultKernel } = useJupyter();

  return (
    <>
      <ComponentPickerMenuPlugin kernel={defaultKernel} />
      <JupyterInputOutputPlugin kernel={defaultKernel} />
    </>
  );
}

/**
 * Plugin that captures lexical tools and passes them to parent.
 * Must be rendered inside LexicalConfigProvider context.
 */
function LexicalToolsPlugin({
  onToolsReady,
}: {
  onToolsReady: (tools: ReturnType<typeof useLexicalTools>) => void;
}) {
  const tools = useLexicalTools(LEXICAL_ID);

  useEffect(() => {
    onToolsReady(tools);
  }, [tools, onToolsReady]);

  return null;
}

// ─── Lexical panel ──────────────────────────────────────────────────────────

interface LexicalPanelProps {
  serviceManager: ServiceManager.IManager;
  onToolsReady: (tools: ReturnType<typeof useLexicalTools>) => void;
}

const LexicalPanel = React.memo(function LexicalPanel({
  serviceManager,
  onToolsReady,
}: LexicalPanelProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

  const { toolbarItems, isAiOpen, pendingPrompt, clearPendingPrompt, closeAi } =
    useChatInlineToolbarItems();

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const handleChange = useCallback((_editorState: EditorState) => {
    // onChange handler
  }, []);

  const agentId = getAgentId();
  const agUiEndpoint = `${BASE_URL}/api/v1/ag-ui/${encodeURIComponent(agentId)}/`;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        borderRight: '1px solid',
        borderColor: 'border.default',
      }}
    >
      <Box sx={{ padding: 3 }}>
        <LexicalConfigProvider
          lexicalId={LEXICAL_ID}
          serviceManager={serviceManager}
        >
          <LexicalToolsPlugin onToolsReady={onToolsReady} />
          <LexicalComposer initialConfig={editorConfig}>
            <div className="lexical-editor-inner" ref={onRef}>
              <LexicalStatePlugin />
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className="lexical-editor-content"
                    aria-label="Lexical Editor"
                  />
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <OnChangePlugin onChange={handleChange} />
              <HistoryPlugin />
              <AutoFocusPlugin />
              <ListPlugin />
              <CheckListPlugin />
              <LinkPlugin />
              <AutoLinkPlugin />
              <ListMaxIndentLevelPlugin maxDepth={7} />
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
              <LoadContentPlugin />
              <CodeHighlightPlugin />
              <ImagesPlugin captionsEnabled={false} />
              <HorizontalRulePlugin />
              <EquationsPlugin />
              <YouTubePlugin />
              <ExcalidrawPlugin />
              <CollapsiblePlugin />
              <AutoEmbedPlugin />
              <TablePlugin />
              <TableCellResizerPlugin />
              <JupyterCellPlugin />
              {/* Wrap kernel plugins with Jupyter provider */}
              <JupyterReactTheme>
                <KernelPluginsInner />
              </JupyterReactTheme>
              {floatingAnchorElem && (
                <>
                  <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
                  <FloatingTextFormatToolbarPlugin
                    anchorElem={floatingAnchorElem}
                    setIsLinkEditMode={setIsLinkEditMode}
                    extraItems={toolbarItems}
                  />
                  <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
                </>
              )}
              <ChatInlinePlugin
                protocol={{
                  type: 'ag-ui',
                  endpoint: agUiEndpoint,
                }}
                isOpen={isAiOpen}
                onClose={closeAi}
                pendingPrompt={pendingPrompt}
                onPendingPromptConsumed={clearPendingPrompt}
              />
            </div>
          </LexicalComposer>
        </LexicalConfigProvider>
      </Box>
    </Box>
  );
});

// ─── Chat panel with lexical tools ──────────────────────────────────────────

interface ChatPanelProps {
  agentId: string;
  tools: ReturnType<typeof useLexicalTools>;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ agentId, tools }) => {
  return (
    <Box
      sx={{
        width: '420px',
        minWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Chat
        transport="ag-ui"
        baseUrl={BASE_URL}
        agentId={agentId}
        title="Agent Lexical"
        placeholder="Ask about the document..."
        description="Chat with the agent to manipulate the document"
        showHeader={true}
        height="100vh"
        showModelSelector={true}
        showToolsMenu={true}
        showSkillsMenu={true}
        showTokenUsage={true}
        showInformation={true}
        frontendTools={tools}
        autoFocus
        runtimeId={agentId}
        historyEndpoint={`${BASE_URL}/api/v1/history`}
        suggestions={[
          {
            title: 'Insert heading',
            message: 'Insert a heading that says "Welcome"',
          },
          {
            title: 'Add code block',
            message: 'Add a Python code block with a hello world example',
          },
          {
            title: 'Create list',
            message: 'Create a bullet list with three items about Jupyter',
          },
        ]}
        submitOnSuggestionClick
      />
    </Box>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────

export const AgentLexical: React.FC = () => {
  const [agentId] = useState(getAgentId);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [tools, setTools] = useState<ReturnType<typeof useLexicalTools>>([]);

  const handleToolsReady = useCallback(
    (newTools: ReturnType<typeof useLexicalTools>) => {
      setTools(newTools);
    },
    [],
  );

  // Verify the agent exists AND initialise the Jupyter service manager
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // 1. Ensure agent exists — create if missing
        const getResp = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`,
        );
        if (!getResp.ok) {
          const createResp = await fetch(`${BASE_URL}/api/v1/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: agentId,
              description: 'Agent created by Agent Lexical page',
              agent_library: 'pydantic-ai',
              transport: 'ag-ui',
              model: DEFAULT_MODEL,
              system_prompt:
                'You are a helpful AI assistant that helps users work with documents. You can help with writing, editing, and formatting content.',
            }),
          });
          if (!createResp.ok && createResp.status !== 400) {
            const d = await createResp.json().catch(() => ({}));
            throw new Error(
              d.detail || `Failed to create agent: ${createResp.status}`,
            );
          }
        }

        // 2. Initialise Jupyter
        initJupyterConfig();

        const serverSettings = createServerSettings(
          getJupyterServerUrl(),
          getJupyterServerToken(),
        );
        const manager = new ServiceManager({ serverSettings });
        await manager.ready;

        if (!cancelled) {
          setServiceManager(manager);
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialise');
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Loading
  if (!isReady && !error) {
    return (
      <DatalayerThemeProvider>
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
          <Text sx={{ color: 'fg.muted' }}>Connecting to agent {agentId}…</Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Error
  if (error) {
    return (
      <DatalayerThemeProvider>
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
          <AlertIcon size={48} />
          <Text sx={{ color: 'danger.fg', fontSize: 2 }}>
            Failed to connect
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{error}</Text>
        </Box>
      </DatalayerThemeProvider>
    );
  }

  // Ready — lexical editor + chat side-by-side
  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          bg: 'canvas.default',
        }}
      >
        {serviceManager && (
          <LexicalPanel
            serviceManager={serviceManager}
            onToolsReady={handleToolsReady}
          />
        )}
        <ChatPanel agentId={agentId} tools={tools} />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentLexical;
