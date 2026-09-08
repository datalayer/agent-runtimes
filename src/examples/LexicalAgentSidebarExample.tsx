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
import { ThemedProvider } from './utils/themedProvider';
import { useExampleThemeStore } from './utils/themeStore';
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
  LexicalPrimerThemeProvider,
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

/** The agentspec this example's agent is built from. */
const AGENTSPEC_ID = 'example-document-agent-sidebar';

/**
 * The plugins that need a kernel, and the kernel they need.
 *
 * `ComponentPickerMenuPlugin` and `JupyterInputOutputPlugin` both take a
 * `kernel` prop, and both were mounted here without one — so a Jupyter cell in
 * the document had nothing to run on and said "No runtime connected" however
 * healthy the sandbox was. `LexicalAgentExample` had this right all along;
 * this is the same component.
 *
 * The service manager is passed explicitly rather than left ambient. A bare
 * `useJupyter()` builds its own from the page config, which is the cloud —
 * see the note on `AgentRuntimeLexicalAgentSidebarExample`.
 */
function DocumentKernelPlugins({
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

  /*
   * The editor's own theme scope.
   *
   * `LexicalPrimerThemeProvider` is what the platform's document editor uses,
   * and it carries the two halves this example was missing: the resolved
   * `colormode` and canvas background handed to `JupyterReactTheme`, so the
   * `--jp-*` variables the editor's stylesheet reads follow the picker; and a
   * `ThemeContext`, which is where `ExcalidrawModal` and `ExcalidrawImage`
   * read light-or-dark from. Without it a drawing rendered light on a dark
   * document, and the editor surface kept Primer's stock palette.
   *
   * Only the editor is wrapped. `JupyterReactTheme` nests a Primer theme of
   * its own, and putting the header, the chat sidebar and the error panel
   * inside it is what made them read `canvas.default` from the stock light
   * palette — the same trap `NotebookAgentSidebarExample` documents.
   */
  return (
    <LexicalPrimerThemeProvider useStore={useExampleThemeStore}>
      <LexicalConfigProvider
        lexicalId={LEXICAL_ID}
        serviceManager={serviceManager}
      >
        <LexicalComposer initialConfig={editorConfig}>
          {/* CRITICAL: LexicalStatePlugin registers the adapter in the store */}
          <LexicalStatePlugin />
          {/*
           * Natural height, and the scrollbar lives further out.
           *
           * This used to be a `flex: 1` column with `overflow: hidden`, holding
           * a `flex: 1` `ContentEditable` with `overflow: auto`. None of it
           * could work: between this and the sizing container sit
           * `DatalayerThemeProvider`'s BaseStyles, `JupyterReactTheme`'s div
           * and the theme provider's own Box, none of which has a height — so
           * `flex: 1` resolved against `auto`, the box grew to fit its content
           * instead of bounding it, and `overflow: auto` never had an overflow
           * to act on. The document simply ran off the bottom of the page with
           * no way back up.
           *
           * `LexicalAgentExample` never had the bug because it does not try:
           * the scrolling element is the wrapper *above* the theme providers,
           * and the editor below them is content of natural height. Same shape
           * here — see the editor's container in
           * `ChatLexicalAgentExampleInner`.
           */}
          <Box sx={{ position: 'relative', width: '100%' }}>
            <RichTextPlugin
              contentEditable={
                <div ref={onRef}>
                  <ContentEditable
                    className="lexical-editor-content"
                    aria-label="Lexical Editor"
                    style={{ padding: '24px', outline: 'none' }}
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
            <DocumentKernelPlugins serviceManager={serviceManager} />
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
    </LexicalPrimerThemeProvider>
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
    specId: AGENTSPEC_ID,
    description: 'Demo agent for lexical sidebar example',
    systemPrompt:
      'You are a helpful AI assistant that helps users work with lexical documents. For document operations, always use the lexical frontend tools so actions happen in the live document UI. Diagrams are documents too: this editor mounts the Excalidraw plugin, so draw with the excalidraw* tools rather than describing a picture in prose or writing it as ASCII art — excalidrawInsertNode to make one, excalidrawListDrawings then excalidrawReadScene to find and read an existing one before changing it. Use executeCodeInDocument only for temporary inspection code that should not modify persisted document content.',
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
              Next generation chat with Lexical editor integration
            </p>
          </Box>

          {/* Editor. This is the element that scrolls — see the note on the
              editor's own Box for why it cannot be one further in. */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
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
              // Two of these exercise the drawing tools the mounted
              // `ExcalidrawPlugin` contributes, because a suggestion is how
              // anyone finds out a tool exists.
              suggestions: [
                {
                  title: '✍️ Help me write',
                  message: 'Can you help me write a document?',
                },
                {
                  title: '📊 Draw a diagram',
                  message:
                    'Draw a flowchart of a three-stage data pipeline — ingest, transform, publish — with labelled arrows between the stages.',
                },
                {
                  title: '🎨 Edit the drawing',
                  message:
                    'Read the drawing in this document and add a box for a validation step between ingest and transform, wired into the existing arrows.',
                },
                {
                  title: '📝 Summarize text',
                  message: 'Can you summarize the content in the editor?',
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
 * The example, in the app's theme, on the shell's runtime.
 *
 * The service manager comes from the shell, as it does in every other
 * example. Reading it from an ambient `useJupyter()` instead — which is what
 * this example used to do — did not merely risk showing a document on a
 * different runtime than the picker says: with no `<Jupyter>` provider above
 * it there was nothing ambient to read, so the hook fell back to
 * `DEFAULT_JUPYTER_SERVER_URL` (`prod1.datalayer.run/api/jupyter-server`).
 * That URL is what the example then handed the agent runtime as its sandbox,
 * and validating it is what came back as "Failed to connect to Jupyter
 * sandbox: Jupyter server returned HTTP 404" — a server that was running all
 * along, just not the one being asked.
 */
export function AgentRuntimeLexicalAgentSidebarExample({
  serviceManager,
}: ChatLexicalAgentExampleProps) {
  return (
    <ThemedProvider>
      <ChatLexicalAgentExampleInner serviceManager={serviceManager} />
    </ThemedProvider>
  );
}

export default AgentRuntimeLexicalAgentSidebarExample;
