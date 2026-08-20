/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Runtime Lexical Example with Agent-Runtimes Integration.
 *
 * This example demonstrates using the agent-runtimes ChatFloating component
 * with lexical tools for AI-assisted document editing.
 *
 * To run this example:
 * 1. Start the agent-runtimes server: `npm run start:server`
 * 2. Start the frontend: `npm run dev`
 *
 * @module examples/LexicalAgentExample
 */

import '@datalayer/jupyter-react/lib/css/PrismCss';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import type { ServiceManager } from '@jupyterlab/services';
import { Box } from '@datalayer/primer-addons';
import { useJupyter } from '@datalayer/jupyter-react';
import { ThemedJupyterProvider } from './utils/themedProvider';
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

// Agent-runtimes imports
import { ChatFloating } from '../chat';
import { ChatInlinePlugin } from '../lexical/ChatInlinePlugin';
import { useChatInlineToolbarItems } from '../lexical/useChatInlineToolbarItems';
import { useLexicalTools } from '../tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';

import { DEFAULT_MODEL } from '../specs';

import '@datalayer/jupyter-lexical/style/index.css';
import './lexical/lexical-theme.css';

// Fixed lexical document ID
const LEXICAL_ID = 'agui-lexical-example';

const AGENT_ID = 'lexical-agent-runtime-example';

function getJupyterSandboxUrl(
  serviceManager?: ServiceManager.IManager,
): string | undefined {
  const envUrl = import.meta.env.VITE_JUPYTER_SANDBOX_URL;
  if (envUrl) {
    return envUrl;
  }

  const baseUrl = serviceManager?.serverSettings?.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) {
    return undefined;
  }

  if (baseUrl.includes('token=')) {
    return baseUrl;
  }

  const token = serviceManager?.serverSettings?.token;
  if (!token) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Hook to ensure the example-agent exists on the server.
 * Creates it if it doesn't exist.
 */
// import contentLexical from './lexicals/vscode.lexical';
// const INITIAL_CONTENT = JSON.stringify(contentLexical);
const INITIAL_CONTENT = undefined; // Use default empty document

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
        editor.setEditorState(editorState, {
          tag: 'history-merge',
        });
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
        {
          tag: 'history-merge',
        },
      );
    }
  }, [content, editor]);

  return null;
}

/**
 * Lexical plugin for Simple code syntax highlighting.
 */
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

/**
 * Wrapper component for kernel-dependent Simple plugins.
 * Accepts a serviceManager so it can initialise a Jupyter kernel
 * (mirrors how the Notebook component bootstraps its runtime).
 */
function SimpleKernelPluginsInner({
  serviceManager,
}: {
  serviceManager?: ServiceManager.IManager;
}) {
  const { defaultKernel } = useJupyter({
    serviceManager,
    startDefaultKernel: !!serviceManager,
  });

  return (
    <>
      <ComponentPickerMenuPlugin kernel={defaultKernel} />
      <JupyterInputOutputPlugin kernel={defaultKernel} />
    </>
  );
}

/**
 * Plugin component that captures lexical tools and passes them to parent.
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

/**
 * Lexical UI component with full LexicalComposer setup.
 * Accepts onToolsReady callback to provide tools to parent component.
 */
interface LexicalUIProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
  endpoint: string;
  onToolsReady: (tools: ReturnType<typeof useLexicalTools>) => void;
}

const LexicalUI = React.memo(function LexicalUI({
  content = INITIAL_CONTENT,
  serviceManager,
  endpoint,
  onToolsReady,
}: LexicalUIProps): JSX.Element {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

  // AI actions registered as toolbar items via the primer-addons toolbar extensibility
  const { toolbarItems, isAiOpen, pendingPrompt, clearPendingPrompt, closeAi } =
    useChatInlineToolbarItems();

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const handleChange = useCallback((_editorState: EditorState) => {
    // onChange handler - can be used for tracking changes
  }, []);

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
        <h1>Agent Runtime Lexical Example</h1>
        <p>
          Platform-agnostic tool usage with agent-runtimes integration. Use the
          AI copilot to manipulate the document.
        </p>
      </Box>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          padding: 3,
          backgroundColor: 'canvas.default',
          minHeight: '600px',
        }}
      >
        <LexicalConfigProvider
          lexicalId={LEXICAL_ID}
          serviceManager={serviceManager}
        >
          {/* LexicalToolsPlugin captures tools from context and passes to parent */}
          <LexicalToolsPlugin onToolsReady={onToolsReady} />
          <LexicalComposer initialConfig={editorConfig}>
            <div className="lexical-editor-inner" ref={onRef}>
              {/* CRITICAL: LexicalStatePlugin registers the adapter in the store */}
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
              <LoadContentPlugin content={content} />
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
              {/* Wrap kernel plugins with Simple provider */}
              <ThemedJupyterProvider>
                <SimpleKernelPluginsInner serviceManager={serviceManager} />
              </ThemedJupyterProvider>
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
              {/* AI Inline Chat Plugin - controlled by useChatInlineToolbarItems */}
              <ChatInlinePlugin
                protocol={{
                  type: 'vercel-ai',
                  endpoint,
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

/**
 * Component that renders the Lexical UI with ChatFloating and tool registration.
 */
interface LexicalWithChatProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
}

function LexicalWithChat({
  content,
  serviceManager,
}: LexicalWithChatProps): JSX.Element {
  const baseUrl = useExampleAgentRuntimesUrl();
  const vercelAiEndpoint = `${baseUrl}/api/v1/vercel-ai/${AGENT_ID}`;
  const [createRequested, setCreateRequested] = useState(false);
  const jupyterSandboxUrl = useMemo(
    () => getJupyterSandboxUrl(serviceManager),
    [serviceManager],
  );
  const { agentId, isReady, status, error, createAgent } =
    useExampleAgentRuntime({
      exampleId: 'LexicalAgentExample',
      agentName: AGENT_ID,
      autoCreateAgent: false,
      agentConfig: {
        name: AGENT_ID,
        description: 'Demo agent for lexical example',
        protocol: 'vercel-ai',
        model: DEFAULT_MODEL,
        systemPrompt:
          'You are a helpful AI assistant that helps users work with documents. You can help with writing, editing, and formatting content.',
        enableCodemode: false,
        sandboxVariant: 'jupyter-server',
        jupyterSandbox: jupyterSandboxUrl,
      },
    });

  useEffect(() => {
    if (!jupyterSandboxUrl || createRequested || agentId) {
      return;
    }
    setCreateRequested(true);
    void createAgent({
      name: AGENT_ID,
      description: 'Demo agent for lexical example',
      protocol: 'vercel-ai',
      model: DEFAULT_MODEL,
      systemPrompt:
        'You are a helpful AI assistant that helps users work with documents. You can help with writing, editing, and formatting content.',
      enableCodemode: false,
      sandboxVariant: 'jupyter-server',
      jupyterSandbox: jupyterSandboxUrl,
    }).catch(() => {
      setCreateRequested(false);
    });
  }, [jupyterSandboxUrl, createRequested, agentId, createAgent]);
  const effectiveReady = isReady || status === 'ready';

  // State to hold tools - populated by LexicalToolsPlugin inside the context
  const [tools, setTools] = useState<ReturnType<typeof useLexicalTools>>([]);

  // Stable callback for receiving tools from LexicalToolsPlugin
  // NOTE: Do NOT use a key={...} on ChatFloating to force re-render on tool changes.
  // Changing the key remounts the entire chat component, resetting all state (including isLoading),
  // which causes the run/pause button to flip to "send" mid-conversation.
  // React will naturally pass updated frontendTools prop without remounting.
  const handleToolsReady = useCallback(
    (newTools: ReturnType<typeof useLexicalTools>) => {
      console.log('[LexicalWithChat] 🔄 Tools received, updating state');
      setTools(newTools);
    },
    [],
  );

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <LexicalUI
        content={content}
        serviceManager={serviceManager}
        endpoint={vercelAiEndpoint}
        onToolsReady={handleToolsReady}
      />

      {error && (
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
          <strong>Error:</strong> {error}
        </Box>
      )}

      {effectiveReady && (
        <ChatFloating
          kernelIndicatorPlacement="right"
          protocol="vercel-ai"
          endpoint={vercelAiEndpoint}
          title="Lexical AI Agent Runtime"
          description="Hi! I can help you edit documents. Try: 'Insert a heading', 'Add a code block', or 'Create a list'"
          defaultOpen={true}
          defaultViewMode="panel"
          position="bottom-right"
          frontendTools={tools}
          useStore={false}
          showModelSelector={true}
          showToolsMenu={true}
          showSkillsMenu={true}
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
 * Main Agent Runtime lexical example component
 */
interface AgentRuntimeLexicalAgentExampleProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
}

function AgentRuntimeLexicalAgentExample({
  content,
  serviceManager,
}: AgentRuntimeLexicalAgentExampleProps): JSX.Element {
  return <LexicalWithChat content={content} serviceManager={serviceManager} />;
}

export default AgentRuntimeLexicalAgentExample;
