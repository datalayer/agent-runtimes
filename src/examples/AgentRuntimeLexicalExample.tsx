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
 * @module examples/AgentRuntimeLexicalExample
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
import type { ServiceManager } from '@jupyterlab/services';
import { Box } from '@datalayer/primer-addons';
import { JupyterReactTheme, useJupyter } from '@datalayer/jupyter-react';
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
import { ChatFloating } from '../components/chat';
import { ChatInlinePlugin } from '../lexical/ChatInlinePlugin';
import { useChatInlineToolbarItems } from '../lexical/useChatInlineToolbarItems';
import { useLexicalTools } from '../tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';

import '@datalayer/jupyter-lexical/style/index.css';

import './lexical/lexical-theme.css';
import '@datalayer/jupyter-lexical/style/modal-overrides.css';

// Fixed lexical document ID
const LEXICAL_ID = 'agui-lexical-example';

// Base URL for agent-runtimes server
const BASE_URL = 'http://localhost:8765';
const AGENT_ID = 'lexical-agent-runtime-example';

// AG-UI endpoint for lexical operations (trailing slash required for mounted Starlette apps)
const AG_UI_ENDPOINT = `${BASE_URL}/api/v1/ag-ui/${AGENT_ID}/`;

/**
 * Hook to ensure the demo-agent exists on the server.
 * Creates it if it doesn't exist.
 */
function useEnsureAgent(
  agentId: string,
  baseUrl: string,
): {
  isReady: boolean;
  error: string | null;
} {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureAgent() {
      try {
        // Try to create the agent (will fail if already exists, which is fine)
        const response = await fetch(`${baseUrl}/api/v1/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: agentId,
            description: 'Demo agent for lexical example',
            agent_library: 'pydantic-ai',
            transport: 'ag-ui',
            model: 'openai:gpt-4o-mini',
            system_prompt:
              'You are a helpful AI assistant that helps users work with documents. You can help with writing, editing, and formatting content.',
          }),
        });

        if (mounted) {
          if (response.ok) {
            console.log(
              `[AgentRuntimeLexicalExample] Created agent: ${agentId}`,
            );
            setIsReady(true);
          } else if (response.status === 400) {
            // Agent already exists, which is fine
            console.log(
              `[AgentRuntimeLexicalExample] Agent already exists: ${agentId}`,
            );
            setIsReady(true);
          } else {
            const errorData = await response.json().catch(() => ({}));
            setError(
              errorData.detail || `Failed to create agent: ${response.status}`,
            );
          }
        }
      } catch (err) {
        if (mounted) {
          console.error(
            '[AgentRuntimeLexicalExample] Error creating agent:',
            err,
          );
          setError(
            err instanceof Error ? err.message : 'Failed to connect to server',
          );
        }
      }
    }

    ensureAgent();

    return () => {
      mounted = false;
    };
  }, [agentId, baseUrl]);

  return { isReady, error };
}

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
 */
function SimpleKernelPluginsInner() {
  const { defaultKernel } = useJupyter();

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
  serviceManager?: any;
  onToolsReady: (tools: ReturnType<typeof useLexicalTools>) => void;
}

const LexicalUI = React.memo(function LexicalUI({
  content = INITIAL_CONTENT,
  serviceManager,
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
              <JupyterReactTheme>
                <SimpleKernelPluginsInner />
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
              {/* AI Inline Chat Plugin - controlled by useChatInlineToolbarItems */}
              <ChatInlinePlugin
                protocol={{
                  type: 'ag-ui',
                  endpoint: AG_UI_ENDPOINT,
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
  // Ensure the agent exists before rendering chat
  const { isReady, error } = useEnsureAgent(AGENT_ID, BASE_URL);

  // State to hold tools - populated by LexicalToolsPlugin inside the context
  const [tools, setTools] = useState<ReturnType<typeof useLexicalTools>>([]);
  const [toolsKey, setToolsKey] = useState(0);

  // Stable callback for receiving tools from LexicalToolsPlugin
  const handleToolsReady = useCallback(
    (newTools: ReturnType<typeof useLexicalTools>) => {
      console.log('[LexicalWithChat] 🔄 Tools received, updating state');
      setTools(newTools);
      setToolsKey(prev => prev + 1); // Force ChatFloating to see new tools
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

      {isReady && (
        <ChatFloating
          key={`chat-${toolsKey}`}
          endpoint={AG_UI_ENDPOINT}
          title="Lexical AI Agent Runtime"
          description="Hi! I can help you edit documents. Try: 'Insert a heading', 'Add a code block', or 'Create a list'"
          defaultOpen={true}
          defaultViewMode="panel"
          position="bottom-right"
          brandColor="#7c3aed"
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
          ]}
        />
      )}
    </Box>
  );
}

/**
 * Main Agent Runtime lexical example component
 */
interface AgentRuntimeLexicalExampleProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
}

function AgentRuntimeLexicalExample({
  content,
  serviceManager,
}: AgentRuntimeLexicalExampleProps): JSX.Element {
  return <LexicalWithChat content={content} serviceManager={serviceManager} />;
}

export default AgentRuntimeLexicalExample;
