/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * CopilotKit Lexical Example with CopilotKit Integration.
 *
 * To run this example, create a .env file in the core directory with:
 * - VITE_DATALAYER_API_TOKEN: Get from https://datalayer.app/settings/iam/tokens
 * - VITE_COPILOT_KIT_API_KEY: Get from https://cloud.copilotkit.ai/dashboard
 *
 * You also will need to connect copilot kit to some sort of LLM Add LLM Provider API Key.
 *
 * https://docs.copilotkit.ai/reference/hooks/useFrontendTool
 *
 * @module examples/CopilotKitLexicalExample
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
import { CopilotKit, useFrontendTool } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
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
import {
  ActionRegistrar,
  useLexicalToolActions,
} from '../tools/adapters/copilotkit/lexicalHooks';
import { editorConfig } from './lexical/editorConfig';

import '@datalayer/jupyter-lexical/style/index.css';
import '@copilotkit/react-ui/styles.css';

import '@datalayer/jupyter-lexical/style/modal-overrides.css';
import './lexical/lexical-theme.css';

// Fixed lexical document ID
const LEXICAL_ID = 'agui-lexical-example';

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
 * Lexical UI component with full LexicalComposer setup
 */
interface LexicalUIProps {
  content?: string;
  serviceManager?: any;
}

const LexicalUI = React.memo(function LexicalUI({
  content = INITIAL_CONTENT,
  serviceManager,
}: LexicalUIProps): JSX.Element {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

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
        height: '100vh',
        width: '100vw',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
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
          <h1>CopilotKit Lexical Example</h1>
          <p>
            Platform-agnostic tool usage with CopilotKit integration. Use the AI
            copilot to manipulate the document.
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
                <TablePlugin />
                <TableCellResizerPlugin />
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
                    />
                    <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
                  </>
                )}
              </div>
            </LexicalComposer>
          </LexicalConfigProvider>
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Component that renders the Lexical UI with CopilotKit tool registration.
 * MUST be inside CopilotKit context for tool registration to work.
 */
interface LexicalWithToolsProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
}

function LexicalWithTools({
  content,
  serviceManager,
}: LexicalWithToolsProps): JSX.Element {
  // Get all actions for this lexical document
  const actions = useLexicalToolActions(LEXICAL_ID);

  return (
    <>
      {/* Register each action using a loop with ActionRegistrar component */}
      {actions.map((action, i) => (
        <ActionRegistrar
          key={action.name || i}
          action={action}
          useFrontendTool={useFrontendTool}
        />
      ))}
      <LexicalUI content={content} serviceManager={serviceManager} />
    </>
  );
}

/**
 * Main CopilotKit lexical example component
 */
interface CopilotKitLexicalExampleProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
}

function CopilotKitLexicalExample({
  content,
  serviceManager,
}: CopilotKitLexicalExampleProps): JSX.Element {
  return (
    <CopilotKit
      showDevConsole={true}
      publicApiKey={import.meta.env.VITE_COPILOT_KIT_API_KEY}
    >
      <CopilotSidebar
        defaultOpen={true}
        labels={{
          title: 'Lexical AI Copilot',
          initial:
            'Hi! I can help you edit lexical documents. Try: "Insert a heading", "Add a code block", or "Create a list"',
        }}
      >
        <LexicalWithTools content={content} serviceManager={serviceManager} />
      </CopilotSidebar>
    </CopilotKit>
  );
}

export default CopilotKitLexicalExample;
