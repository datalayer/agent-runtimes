/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat Lexical Example - Floating popup chat with Lexical editor.
 *
 * This example demonstrates using the chat popup component with:
 * - Floating popup window that appears in a corner
 * - Lexical editor integration
 * - Frontend tool execution
 * - Escape to close, click outside to close
 * - Keyboard shortcuts
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
import { Text } from '@primer/react';
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
  TableCellResizerPlugin,
  TablePlugin,
} from '@datalayer/jupyter-lexical';

// Import Chat components
import {
  ChatFloating,
  useChatStore,
  useFrontendTool,
  DatalayerInferenceProvider,
  type ChatConfig,
} from '../components/chat';
import {
  useLexicalToolActions,
  ActionRegistrar,
} from '../tools/adapters/copilotkit/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';

import '@datalayer/jupyter-lexical/style/index.css';
import '@datalayer/jupyter-lexical/style/modal-overrides.css';
import './lexical/lexical-theme.css';

// Fixed lexical document ID
const LEXICAL_ID = 'chat-popup-lexical-example';

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
 * Tool registration component - registers Lexical tools with Chat
 */
function LexicalToolRegistrar() {
  // Get Lexical tool actions (compatible with ActionRegistrar pattern)
  const lexicalTools = useLexicalToolActions(LEXICAL_ID);

  // Register each tool with Chat
  return (
    <>
      {lexicalTools.map((action, i) => (
        <ActionRegistrar
          key={action.name || i}
          action={action}
          useFrontendTool={useFrontendTool}
        />
      ))}
    </>
  );
}

/**
 * Custom tools for demonstration
 */
function CustomToolsRegistrar() {
  // Simple greeting tool
  useFrontendTool({
    name: 'greet_user',
    description: 'Greet a user by name',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Name of the user',
        required: true,
      },
    ],
    handler: async ({ name }: { name: string }) => {
      return {
        greeting: `Hello, ${name}! Welcome to Agent Runtime Lexical Example.`,
      };
    },
  });

  // Get current date/time tool
  useFrontendTool({
    name: 'get_current_time',
    description: 'Get the current date and time',
    parameters: [],
    handler: async () => {
      return {
        datetime: new Date().toISOString(),
        formatted: new Date().toLocaleString(),
      };
    },
  });

  // Document info tool
  useFrontendTool({
    name: 'get_document_info',
    description: 'Get information about the current document',
    parameters: [],
    handler: async () => {
      return {
        documentId: LEXICAL_ID,
        timestamp: new Date().toISOString(),
        message: 'This is a Lexical document with Simple integration',
      };
    },
  });

  return null;
}

/**
 * Main Lexical editor component
 */
interface LexicalEditorProps {
  serviceManager?: ServiceManager.IManager;
}

function LexicalEditor({
  serviceManager: _serviceManager,
}: LexicalEditorProps) {
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
    <LexicalComposer initialConfig={editorConfig}>
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
              Start typing or click the chat button to open the AI assistant...
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

        {/* Jupyter Lexical plugins */}
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
        <TablePlugin />
        <TableCellResizerPlugin />
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
  );
}

/**
 * Chat Lexical Example with Simple integration
 */
interface ChatLexicalExampleProps {
  serviceManager?: ServiceManager.IManager;
}

export function ChatLexicalExampleInner({
  serviceManager,
}: ChatLexicalExampleProps) {
  // Chat configuration - set up the inference provider in the store
  useEffect(() => {
    const config: ChatConfig = {
      defaultProvider: 'datalayer',
      apiBaseUrl:
        import.meta.env.VITE_DATALAYER_API_URL ||
        'https://oss.datalayer.run/api',
      apiKey: import.meta.env.VITE_DATALAYER_API_TOKEN,
      defaultModel: 'claude-sonnet-4-20250514',
      enableStreaming: true,
      requireToolApproval: false,
      debug: import.meta.env.DEV,
    };

    // Set config in store
    useChatStore.getState().setConfig(config);

    // Create and set inference provider
    const provider = new DatalayerInferenceProvider({
      apiKey: config.apiKey ?? '',
      baseUrl: config.apiBaseUrl,
      model: config.defaultModel,
    });
    useChatStore.getState().setInferenceProvider(provider);

    // Cleanup on unmount
    return () => {
      useChatStore.getState().setInferenceProvider(null);
    };
  }, []);

  return (
    <>
      {/* Register tools */}
      <LexicalToolRegistrar />
      <CustomToolsRegistrar />

      <Box
        sx={{
          height: '100vh',
          width: '100vw',
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
              Chat Lexical Example
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--fgColor-muted)' }}>
              Sidebar popup chat with Lexical editor integration.
            </p>
          </div>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Press{' '}
              <kbd
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bgColor-neutral-muted)',
                  border: '1px solid var(--borderColor-default)',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              >
                ⌘/
              </kbd>{' '}
              or click the button to open chat
            </Text>
          </Box>
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

      {/* Floating Chat */}
      <ChatFloating
        useStore={true}
        title="AI Assistant"
        position="bottom-right"
        width={400}
        height={550}
        defaultOpen={false}
        showNewChatButton={true}
        showClearButton={true}
        showSettingsButton={false}
        clickOutsideToClose={true}
        escapeToClose={true}
        enableKeyboardShortcuts={true}
        toggleShortcut="/"
        buttonTooltip="Open AI Assistant"
        showPoweredBy={true}
        poweredByProps={{
          brandName: 'Datalayer',
          brandUrl: 'https://datalayer.ai',
        }}
        onOpen={() => {
          // opened
        }}
        onClose={() => {
          // closed
        }}
        onNewChat={() => {
          // New chat started
        }}
      />
    </>
  );
}

/**
 * Main example component with Simple wrapper
 */
export function AgentRuntimePopupLexicalExample() {
  return (
    <JupyterReactTheme>
      <JupyterWrapper />
    </JupyterReactTheme>
  );
}

function JupyterWrapper() {
  const { serviceManager } = useJupyter();
  return <ChatLexicalExampleInner serviceManager={serviceManager} />;
}

export default AgentRuntimePopupLexicalExample;
