/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lexical Example - Next generation chat with Lexical editor.
 *
 * This example demonstrates using the chat component with:
 * - Lexical editor integration
 * - Frontend tool execution
 * - Multiple protocol support (AG-UI, A2A)
 * - Middleware and extensions
 *
 * To run this example, create a .env file with:
 * - VITE_DATALAYER_API_KEY: Get from https://datalayer.app/settings/iam/tokens
 *
 * @module examples/LexicalAgentSidebarExample
 */

import '@datalayer/jupyter-react/lib/css/PrismCss';

import { useCallback, useEffect, useState } from 'react';
import { EditorState } from 'lexical';
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
  FloatingTextFormatToolbarPlugin,
  CodeActionMenuPlugin,
  ListMaxIndentLevelPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  TableCellResizerPlugin,
  TablePlugin,
} from '@datalayer/jupyter-lexical';
import { ChatSidebar } from '../chat';
import { ChatInlinePlugin } from '../lexical/ChatInlinePlugin';
import { useChatInlineToolbarItems } from '../lexical/useChatInlineToolbarItems';
import { useLexicalTools } from '../tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';
import { useExampleJupyterAgent } from './hooks/useExampleJupyterAgent';

import '@datalayer/jupyter-lexical/style/index.css';
import './lexical/lexical-theme.css';

// Fixed lexical document ID
const LEXICAL_ID = 'chat-lexical-example';

// Default configuration
const DEFAULT_AGENT_ID =
  import.meta.env.VITE_AGENT_ID || 'lexical-sidebar-agent-runtime-example';

/**
 * Lexical plugin for code highlighting
 */
function CodeHighlightingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

/**
 * Main Lexical editor component
 */
interface LexicalEditorProps {
  serviceManager?: ServiceManager.IManager;
  endpoint: string;
}

function LexicalEditor({ serviceManager, endpoint }: LexicalEditorProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

  // AI actions registered as toolbar items
  const { toolbarItems, isAiOpen, pendingPrompt, clearPendingPrompt, closeAi } =
    useChatInlineToolbarItems();

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  // Handle editor changes
  const onChange = useCallback((_editorState: EditorState) => {
    // Could persist state here
  }, []);

  return (
    <LexicalConfigProvider
      lexicalId={LEXICAL_ID}
      serviceManager={serviceManager}
    >
      <LexicalComposer initialConfig={editorConfig}>
        {/* CRITICAL: LexicalStatePlugin registers the adapter in the store */}
        <LexicalStatePlugin />
        <Box
          sx={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <RichTextPlugin
            contentEditable={
              <div
                ref={onRef}
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
              >
                <ContentEditable
                  className="lexical-editor-content"
                  style={{
                    flex: 1,
                    padding: '24px',
                    outline: 'none',
                    overflow: 'auto',
                  }}
                />
              </div>
            }
            placeholder={
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  left: '24px',
                  color: 'var(--fgColor-muted)',
                  pointerEvents: 'none',
                }}
              >
                Start typing or use the chat to create content...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Core plugins */}
          <HistoryPlugin />
          <AutoFocusPlugin />
          <OnChangePlugin onChange={onChange} />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <CodeHighlightingPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <TablePlugin />
          <TableCellResizerPlugin />

          {/* Simple Lexical plugins */}
          <JupyterCellPlugin />
          <JupyterInputOutputPlugin />
          <ImagesPlugin />
          <HorizontalRulePlugin />
          <EquationsPlugin />
          <YouTubePlugin />
          <ExcalidrawPlugin />
          <CollapsiblePlugin />
          <AutoLinkPlugin />
          <AutoEmbedPlugin />
          <ListMaxIndentLevelPlugin maxDepth={7} />

          {/* Toolbar plugins */}
          {floatingAnchorElem && (
            <>
              <ComponentPickerMenuPlugin />
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
        </Box>
      </LexicalComposer>
    </LexicalConfigProvider>
  );
}

/**
 * Lexical Agent Sidebar Example with Simple integration
 */
interface ChatLexicalAgentExampleProps {
  serviceManager?: ServiceManager.IManager;
}

export function ChatLexicalAgentExampleInner({
  serviceManager,
}: ChatLexicalAgentExampleProps) {
  // The tools. Which of the chat and the harness runs them depends on
  // where the loop turns, and the hook decides that.
  const tools = useLexicalTools(LEXICAL_ID);

  const {
    agentReady,
    protocol: protocolConfig,
    chatFrontendTools,
    error,
    unavailableReason,
  } = useExampleJupyterAgent({
    exampleId: 'LexicalAgentSidebarExample',
    agentName: DEFAULT_AGENT_ID,
    description: 'Demo agent for lexical sidebar example',
    systemPrompt:
      'You are a helpful AI assistant that helps users work with lexical documents. For document operations, always use the lexical frontend tools so actions happen in the live document UI. Use executeCode only for temporary inspection code that should not modify persisted document content.',
    serviceManager,
    frontendTools: tools,
  });
  // One failed attempt is reported, not retried — see
  // `useExampleJupyterAgent`.
  const chatError = error || unavailableReason;

  // The example's own agent, not merely the runtime: on the cloud target the
  // runtime is ready before this agent has been registered on it.
  const effectiveReady = agentReady;

  // Get lexical tools for ChatSidebar

  // Build Vercel AI protocol config

  return (
    <>
      <Box
        sx={{
          height: 'calc(100vh - 70px)',
          width: '100vw',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Main content area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.default',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
              Lexical Agent Sidebar Example
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--fgColor-muted)' }}>
              Next generation chat with Lexical editor integration (NO
              Provider!)
            </p>
          </Box>

          {/* Editor */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              bg: 'canvas.default',
            }}
          >
            <LexicalEditor
              serviceManager={serviceManager}
              endpoint={protocolConfig.endpoint}
            />
          </Box>
        </Box>

        {/* Chat sidebar */}
        {effectiveReady && (
          <ChatSidebar
            kernelIndicatorPlacement="right"
            title="AI Assistant"
            protocol={protocolConfig}
            position="right"
            width={400}
            showNewChatButton={true}
            showClearButton={true}
            showSettingsButton={true}
            defaultOpen={true}
            panelProps={{
              protocol: protocolConfig,
              frontendTools: chatFrontendTools,
              useStore: true,
              suggestions: [
                {
                  title: '✍️ Help me write',
                  message: 'Can you help me write a document?',
                },
                {
                  title: '📝 Summarize text',
                  message: 'Can you summarize the content in the editor?',
                },
                {
                  title: '🔍 Proofread',
                  message: 'Can you proofread and improve my text?',
                },
                {
                  title: '💡 Generate ideas',
                  message: 'Can you suggest some ideas for content?',
                },
              ],
            }}
          />
        )}
      </Box>

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
    </>
  );
}

/**
 * Main example component with Simple wrapper
 */
export function AgentRuntimeLexicalAgentSidebarExample() {
  return (
    <ThemedJupyterProvider>
      <SimpleWrapper />
    </ThemedJupyterProvider>
  );
}

function SimpleWrapper() {
  const { serviceManager } = useJupyter();
  return <ChatLexicalAgentExampleInner serviceManager={serviceManager} />;
}

export default AgentRuntimeLexicalAgentSidebarExample;
