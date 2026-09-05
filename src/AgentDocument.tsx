/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentDocument
 *
 * Standalone Lexical editor + chat interface served at /static/agent-document.html.
 * Connects to the agent-runtimes AG-UI endpoint and provides a Lexical
 * rich-text editor alongside the Chat component with lexical tools registered.
 *
 * The page is opened by codeai with a URL like:
 *   http://127.0.0.1:<port>/static/agent-document.html?agentId=<id>
 *
 * Query parameters:
 *   - agentId: the agent identifier (required, set by codeai)
 *   - jupyterBaseUrl: base URL for the Jupyter server (optional, falls back to jupyter-config-data)
 *   - jupyterToken: token for the Jupyter server (optional, falls back to jupyter-config-data)
 */

import '@datalayer/jupyter-react/lib/css/PrismCss';

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
import {
  AppearanceControlsWithStore,
  Box,
  createThemeStore,
  DatalayerThemeProvider,
  setupPrimerPortals,
  themeConfigs,
  useSystemColorMode,
} from '@datalayer/primer-addons';
import {
  JupyterReactTheme,
  disposeServiceManager,
  loadJupyterConfig,
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
import { ServiceManager, ServerConnection } from '@jupyterlab/services';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import { Chat } from './chat';
import { ChatInlinePlugin } from './lexical/ChatInlinePlugin';
import { useChatInlineToolbarItems } from './lexical/useChatInlineToolbarItems';
import { useLexicalTools } from './tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './examples/lexical/editorConfig';
import { DEFAULT_MODEL } from './specs';

import '@datalayer/jupyter-lexical/style/index.css';
import './examples/lexical/lexical-theme.css';
import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;
const DOCUMENT_ID = 'agent-document';
const DOCUMENT_THEME_STORAGE_KEY = 'agent-runtimes-agent-document-theme';

const useAgentDocumentThemeStore = createThemeStore(
  DOCUMENT_THEME_STORAGE_KEY,
  {
    colorMode: 'auto',
    theme: 'earth',
  },
);

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function getAgentId(): string {
  return getQueryParam('agentId') || 'default';
}

function getKernelId(): string | undefined {
  const kernelId = getQueryParam('kernelId') || getQueryParam('kernel_id');
  return kernelId || undefined;
}

interface ResolvedJupyterConfig {
  baseUrl: string;
  token: string;
}

async function fetchStartupKernelId(): Promise<string | undefined> {
  try {
    const resp = await fetch(`${BASE_URL}/health/startup`);
    if (!resp.ok) {
      return undefined;
    }
    const payload = await resp.json();
    const sandbox = payload?.sandbox;
    if (sandbox?.variant !== 'jupyter-server') {
      return undefined;
    }
    const kernelId = sandbox?.kernel_id;
    return typeof kernelId === 'string' && kernelId.length > 0
      ? kernelId
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initialise Jupyter configuration.
 *
 * Priority:
 *   1. Query parameters (jupyterBaseUrl / jupyterToken)
 *   2. <script id="jupyter-config-data"> block in the HTML page
 */
function initJupyterConfig(): ResolvedJupyterConfig {
  loadJupyterConfig();

  const qBaseUrl = getQueryParam('jupyterBaseUrl');
  const qToken = getQueryParam('jupyterToken') || getQueryParam('token');

  if (qBaseUrl) setJupyterServerUrl(qBaseUrl);
  if (qToken) setJupyterServerToken(qToken);

  let resolvedBaseUrl = qBaseUrl || getJupyterServerUrl();
  let resolvedToken = qToken || getJupyterServerToken();

  const el = document.getElementById('jupyter-config-data');
  if (el?.textContent) {
    try {
      const cfg = JSON.parse(el.textContent);
      if (!qBaseUrl && cfg.baseUrl) {
        setJupyterServerUrl(cfg.baseUrl);
        resolvedBaseUrl = cfg.baseUrl;
      }
      if (!qToken && cfg.token) {
        setJupyterServerToken(cfg.token);
        resolvedToken = cfg.token;
      }
    } catch {
      // ignore
    }
  }

  return {
    baseUrl: resolvedBaseUrl,
    token: resolvedToken,
  };
}

function buildServerSettings(
  baseUrl: string,
  token: string,
): ServerConnection.ISettings {
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const authenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!token) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers || undefined);
    headers.set('Authorization', `token ${token}`);
    return fetch(input, { ...init, headers });
  };

  return ServerConnection.makeSettings({
    baseUrl,
    wsUrl,
    token,
    appendToken: !!token,
    fetch: authenticatedFetch,
  });
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

function KernelPluginsInner({
  serviceManager,
  kernelId,
  onKernelReady,
}: {
  serviceManager: ServiceManager.IManager;
  kernelId?: string;
  onKernelReady?: (kernel: IKernelConnection | null) => void;
}) {
  const { defaultKernel } = useJupyter({
    serviceManager,
    useRunningKernelId: kernelId,
    startDefaultKernel: !kernelId,
  });

  // Lift the live kernel connection of the document's sandbox up so the chat
  // header's kernel indicator reflects it. `defaultKernel` is created
  // asynchronously and can change on restart.
  useEffect(() => {
    onKernelReady?.(defaultKernel?.connection ?? null);
  }, [defaultKernel, onKernelReady]);

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
  const tools = useLexicalTools(DOCUMENT_ID);

  useEffect(() => {
    onToolsReady(tools);
  }, [tools, onToolsReady]);

  return null;
}

// ─── Lexical panel ──────────────────────────────────────────────────────────

interface LexicalPanelProps {
  serviceManager: ServiceManager.IManager;
  kernelId?: string;
  colormode: 'light' | 'dark';
  backgroundColor?: string;
  onToolsReady: (tools: ReturnType<typeof useLexicalTools>) => void;
  onKernelReady: (kernel: IKernelConnection | null) => void;
}

const LexicalPanel = React.memo(function LexicalPanel({
  serviceManager,
  kernelId,
  colormode,
  backgroundColor,
  onToolsReady,
  onKernelReady,
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
          lexicalId={DOCUMENT_ID}
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
              <JupyterReactTheme
                colormode={colormode}
                backgroundColor={backgroundColor}
              >
                <KernelPluginsInner
                  serviceManager={serviceManager}
                  kernelId={kernelId}
                  onKernelReady={onKernelReady}
                />
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
  kernel?: IKernelConnection | null;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ agentId, tools, kernel }) => {
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
        protocol="ag-ui"
        baseUrl={BASE_URL}
        agentId={agentId}
        title="Agent Document"
        placeholder="Ask about the document..."
        description="Chat with the agent to manipulate the document"
        showHeader={true}
        height="100%"
        showModelSelector={true}
        showToolsMenu={true}
        showSkillsMenu={true}
        showTokenUsage={true}
        showInformation={true}
        disableInternalJupyterTheme={true}
        frontendTools={tools}
        autoFocus
        runtimeId={agentId}
        kernel={kernel}
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

export const AgentDocument: React.FC = () => {
  const [agentId] = useState(getAgentId);
  const [kernelId, setKernelId] = useState<string | undefined>(getKernelId);
  const [kernelResolved, setKernelResolved] = useState<boolean>(() =>
    Boolean(getKernelId()),
  );
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceManager, setServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  const [tools, setTools] = useState<ReturnType<typeof useLexicalTools>>([]);
  const [documentKernel, setDocumentKernel] =
    useState<IKernelConnection | null>(null);
  const { colorMode, theme } = useAgentDocumentThemeStore();
  const themeConfig = themeConfigs[theme];
  const systemMode = useSystemColorMode();
  const resolvedMode = colorMode === 'auto' ? systemMode : colorMode;
  const modeStyles =
    resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light;
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';

  const handleToolsReady = useCallback(
    (newTools: ReturnType<typeof useLexicalTools>) => {
      setTools(newTools);
    },
    [],
  );

  const handleKernelReady = useCallback((kernel: IKernelConnection | null) => {
    setDocumentKernel(prev => (prev?.id === kernel?.id ? prev : kernel));
  }, []);

  // Verify the agent exists AND initialise the Jupyter service manager
  useEffect(() => {
    let cancelled = false;
    let managerForCleanup: ServiceManager.IManager | null = null;

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
              description: 'Agent created by Agent Document page',
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
        const jupyterConfig = initJupyterConfig();
        const serverSettings = buildServerSettings(
          jupyterConfig.baseUrl,
          jupyterConfig.token,
        );
        const manager = new ServiceManager({ serverSettings });
        managerForCleanup = manager;
        await manager.ready;

        if (!cancelled) {
          setServiceManager(manager);
          setIsReady(true);
        } else {
          disposeServiceManager(manager);
          managerForCleanup = null;
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
      if (managerForCleanup) {
        disposeServiceManager(managerForCleanup);
        managerForCleanup = null;
      }
    };
  }, [agentId]);

  // If kernelId is not provided via URL, reuse the startup sandbox kernel when
  // available so lexical cells run in the same code sandbox as the agent.
  useEffect(() => {
    if (kernelId) {
      setKernelResolved(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const startupKernelId = await fetchStartupKernelId();
      if (cancelled) {
        return;
      }
      if (startupKernelId) {
        setKernelId(startupKernelId);
      }
      // Mark resolution complete even when no sandbox kernel exists so the
      // editor can fall back to a default kernel instead of hanging.
      setKernelResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kernelId]);

  // Loading
  if (!isReady && !error) {
    return (
      <DatalayerThemeProvider
        colorMode={colorMode}
        theme={themeConfig.primerTheme}
        themeStyles={themeConfig.themeStyles}
      >
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
      <DatalayerThemeProvider
        colorMode={colorMode}
        theme={themeConfig.primerTheme}
        themeStyles={themeConfig.themeStyles}
      >
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
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={themeConfig.primerTheme}
      themeStyles={themeConfig.themeStyles}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          bg: 'canvas.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            flexShrink: 0,
          }}
        >
          <AppearanceControlsWithStore useStore={useAgentDocumentThemeStore} />
        </Box>
        <Box
          sx={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {serviceManager && kernelResolved && (
            <LexicalPanel
              serviceManager={serviceManager}
              kernelId={kernelId}
              colormode={resolvedMode}
              backgroundColor={themeBackground}
              onToolsReady={handleToolsReady}
              onKernelReady={handleKernelReady}
            />
          )}
          <ChatPanel agentId={agentId} tools={tools} kernel={documentKernel} />
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentDocument;
