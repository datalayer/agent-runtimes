/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Runtime Lexical Example - Next generation chat with Lexical editor.
 *
 * This example demonstrates using the chat component with:
 * - Lexical editor integration
 * - Frontend tool execution
 * - Multiple protocol support (AG-UI, A2A)
 * - Middleware and extensions
 *
 * To run this example, create a .env file with:
 * - VITE_DATALAYER_API_TOKEN: Get from https://datalayer.app/settings/iam/tokens
 *
 * @module examples/ChatLexicalExample
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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  FloatingTextFormatToolbarPlugin,
  CodeActionMenuPlugin,
  ListMaxIndentLevelPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  TableCellResizerPlugin,
  TablePlugin,
} from '@datalayer/jupyter-lexical';

// Import Chat components
import {
  ChatSidebar,
  type ProtocolConfig,
  type FrontendToolDefinition,
} from '../components/chat';
import { useLexicalTools } from '../tools/adapters/agent-runtimes/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';

import '@datalayer/jupyter-lexical/style/index.css';
import '@datalayer/jupyter-lexical/style/modal-overrides.css';
import './lexical/lexical-theme.css';

// Fixed lexical document ID
const LEXICAL_ID = 'chat-lexical-example';

// Default configuration
const DEFAULT_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_AGENT_ID = import.meta.env.VITE_AGENT_ID || 'agentic_chat';

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
}

function LexicalEditor({ serviceManager }: LexicalEditorProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

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
              />
              <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
            </>
          )}
        </Box>
      </LexicalComposer>
    </LexicalConfigProvider>
  );
}

/**
 * Agent Runtime Lexical Sidebar Example with Simple integration
 */
interface ChatLexicalExampleProps {
  serviceManager?: ServiceManager.IManager;
}

export function ChatLexicalExampleInner({
  serviceManager,
}: ChatLexicalExampleProps) {
  // Get lexical tools for ChatSidebar
  const tools = useLexicalTools(LEXICAL_ID);

  // Build AG-UI protocol config
  const protocolConfig = useMemo((): ProtocolConfig => {
    return {
      type: 'ag-ui',
      endpoint: `${DEFAULT_BASE_URL}/api/v1/examples/${DEFAULT_AGENT_ID}/`,
      agentId: DEFAULT_AGENT_ID,
    };
  }, []);

  return (
    <>
      <Box
        sx={{
          height: '100vh',
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
              bg: 'canvas.subtle',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
              Agent Runtime Lexical Sidebar Example
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
            <LexicalEditor serviceManager={serviceManager} />
          </Box>
        </Box>

        {/* Chat sidebar */}
        <ChatSidebar
          title="AI Assistant"
          position="right"
          width={400}
          showNewChatButton={true}
          showClearButton={true}
          showSettingsButton={true}
          defaultOpen={true}
          panelProps={{
            protocol: protocolConfig,
            frontendTools: tools as unknown as FrontendToolDefinition[],
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
      </Box>
    </>
  );
}

/**
 * Main example component with Simple wrapper
 */
export function AgentRuntimeLexicalSidebarExample() {
  return (
    <JupyterReactTheme>
      <SimpleWrapper />
    </JupyterReactTheme>
  );
}

function SimpleWrapper() {
  const { serviceManager } = useJupyter();
  return <ChatLexicalExampleInner serviceManager={serviceManager} />;
}

export default AgentRuntimeLexicalSidebarExample;
