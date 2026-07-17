/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * EphemeralDocument — an in-memory Lexical rich-text document rendered next to
 * the chat.
 *
 * This is the document analogue of {@link EphemeralNotebook}. The Lexical
 * editor state lives purely in memory and is mirrored into the agent-runtime
 * Zustand store (`ephemeralDocumentModels`) so the document survives navigating
 * away from and back to the same runtime page. While mounted, its lexical
 * frontend tools are reported upward via `onToolsReady` so the agent can drive
 * the document blocks (insert / update / delete / read).
 *
 * IMPORTANT: this module statically imports `@datalayer/jupyter-lexical`, which
 * initialises Lumino-backed nodes on load. It is therefore lazy-loaded by
 * `ChatBase` (via `React.lazy`) so notebook-only chats never pull in lexical.
 *
 * @module chat/document/EphemeralDocument
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  $getRoot,
  $createParagraphNode,
  EditorState,
  type LexicalEditor,
} from 'lexical';
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
import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import {
  Box,
  DatalayerThemeProvider,
  getThemeConfig,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import {
  JupyterReactTheme,
  Kernel,
  disposeServiceManager,
} from '@datalayer/jupyter-react';
import {
  ComponentPickerMenuPlugin,
  JupyterCellPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  ImagesPlugin,
  ExcalidrawPlugin,
  TablePlugin,
  TableCellResizerPlugin,
  TableActionMenuPlugin,
  TableHoverActionsV2Plugin,
  CollapsiblePlugin,
  HorizontalRulePlugin,
  EquationsPlugin,
  YouTubePlugin,
  AutoLinkPlugin,
  AutoEmbedPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  FloatingTextFormatToolbarPlugin,
  CodeActionMenuPlugin,
  ListMaxIndentLevelPlugin,
  ToolbarPlugin,
  ToolbarContext,
  CommentsProvider,
  commentTheme,
} from '@datalayer/jupyter-lexical';
import { editorConfig } from '../../examples/lexical/editorConfig';
import { useLexicalTools } from '../../tools/adapters/agent-runtimes/lexicalHooks';
import { useAgentsRuntimes } from '../../hooks/useAgentRuntimes';
import { useProgressTask } from '../../hooks/useProgressTask';
import type { FrontendToolDefinition } from '../../types/tools';

import '@datalayer/jupyter-react/lib/css/PrismCss';
import '@datalayer/jupyter-lexical/style/index.css';

export interface EphemeralDocumentProps {
  /**
   * Document identifier. Must match the id passed to `useLexicalTools` so the
   * agent's lexical frontend tools operate on this document instance.
   */
  documentId: string;
  /** Preferred runtime pod name to bind the document kernel to. */
  runtimePodName?: string;
  /** Optional persisted Lexical editor state (JSON string) to restore. */
  content?: string;
  /** Callback fired when the document's editor state changes. */
  onContentChange?: (content: string) => void;
  /** Reports the lexical frontend tools so the parent can pass them to the agent. */
  onToolsReady?: (tools: FrontendToolDefinition[]) => void;
}

/**
 * Lexical plugin that loads the initial (restored) editor state exactly once.
 */
function LoadContentPlugin({ content }: { content?: string }) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!isFirstRender.current) {
      return;
    }
    isFirstRender.current = false;
    if (!content) {
      editor.update(
        () => {
          const root = $getRoot();
          if (root.getChildrenSize() === 0) {
            root.append($createParagraphNode());
          }
        },
        { tag: 'history-merge' },
      );
      return;
    }
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
          root.append($createParagraphNode());
        },
        { tag: 'history-merge' },
      );
    }
  }, [content, editor]);

  return null;
}

/** Registers code syntax highlighting for code blocks. */
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
}

/**
 * Top document toolbar mirroring the notebook/document editor toolbar. Reads
 * the active editor from the Lexical composer context and drives the shared
 * {@link ToolbarPlugin} (block type, formatting, insert menu, …).
 */
function DocumentToolbar({
  setIsLinkEditMode,
}: {
  setIsLinkEditMode: Dispatch<SetStateAction<boolean>>;
}) {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState<LexicalEditor>(editor);
  return (
    <ToolbarPlugin
      editor={editor}
      activeEditor={activeEditor}
      setActiveEditor={setActiveEditor}
      setIsLinkEditMode={setIsLinkEditMode}
    />
  );
}

/**
 * Renders an in-memory Lexical document backed by a sandbox kernel.
 */
export function EphemeralDocument({
  documentId,
  runtimePodName,
  content,
  onContentChange,
  onToolsReady,
}: EphemeralDocumentProps) {
  // Capture the restore seed ONCE per documentId so parent re-renders don't
  // remount the composer (which reads `initialConfig` a single time).
  const initialContentRef = useRef<string | undefined>(content);
  const initialDocumentIdRef = useRef<string>(documentId);
  if (initialDocumentIdRef.current !== documentId) {
    initialDocumentIdRef.current = documentId;
    initialContentRef.current = content;
  }
  const initialContent = initialContentRef.current;

  // Hash of the last content we persisted, so onChange only writes on change.
  const lastSavedHashRef = useRef<string>(initialContent ?? '');

  // Lexical frontend tools scoped to this document. Reported upward so the
  // agent can drive the document while it is visible.
  const lexicalTools = useLexicalTools(documentId);
  useEffect(() => {
    onToolsReady?.(lexicalTools);
  }, [lexicalTools, onToolsReady]);

  // Resolve the runtime sandbox strictly by its assigned pod name. There is
  // deliberately NO local fallback kernel: the ephemeral document executes on
  // exactly the runtime assigned to this agent, or shows a waiting state.
  const { runtimes } = useAgentsRuntimes();
  const selectedRuntime = useMemo(() => {
    const preferredPod = String(runtimePodName || '').trim();
    if (!preferredPod) {
      return undefined;
    }
    return runtimes.find(rt => String(rt?.pod_name || '') === preferredPod);
  }, [runtimePodName, runtimes]);

  const [runtimeServiceManager, setRuntimeServiceManager] =
    useState<ServiceManager.IManager | null>(null);
  // Kernel started inside the agent runtime sandbox and threaded into the
  // Jupyter cell plugins, mirroring how the document editor wires its kernel.
  const [documentKernel, setDocumentKernel] = useState<Kernel | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    let manager: ServiceManager | null = null;

    const connectRuntime = async () => {
      const baseUrl = String(selectedRuntime?.url || '').trim();
      if (!baseUrl) {
        if (!cancelled) {
          setRuntimeServiceManager(null);
          setDocumentKernel(undefined);
        }
        return;
      }
      try {
        const token = String(selectedRuntime?.token || '').trim();
        const serverSettings = ServerConnection.makeSettings({
          baseUrl,
          wsUrl: baseUrl.replace(/^http/, 'ws'),
          token,
          appendToken: true,
        });
        manager = new ServiceManager({ serverSettings });
        await manager.ready;
        const kernelConnection = await manager.kernels.startNew();
        if (!cancelled) {
          const kernel = new Kernel({
            kernelName: kernelConnection.model.name,
            kernelSpecName: kernelConnection.model.name,
            kernelModel: kernelConnection.model,
            kernelManager: manager.kernels,
            kernelspecsManager: manager.kernelspecs,
            sessionManager: manager.sessions,
          });
          setRuntimeServiceManager(manager);
          setDocumentKernel(kernel);
        }
      } catch {
        if (!cancelled) {
          setRuntimeServiceManager(null);
          setDocumentKernel(undefined);
        }
      }
    };

    connectRuntime();

    return () => {
      cancelled = true;
      if (manager) {
        disposeServiceManager(manager);
      }
    };
  }, [selectedRuntime?.pod_name, selectedRuntime?.url, selectedRuntime?.token]);

  const activeServiceManager = runtimeServiceManager;
  const isRuntimeStarting = Boolean(
    String(runtimePodName || '').trim() && !activeServiceManager,
  );
  useProgressTask(`ephemeral-document-start-${documentId}`, isRuntimeStarting);

  // Build the initial config once per documentId, without the demo content so
  // the document starts empty and is either restored or filled by the agent.
  const initialConfig = useMemo(() => {
    // Drop the demo `editorState` and the examples `lexicalTheme`. Use the
    // shared `commentTheme` (same as the document editor) so the Jupyter cell
    // and rich-text nodes get the class names styled by jupyter-lexical CSS.
    const { editorState: _ignored, theme: _theme, ...rest } = editorConfig;
    return {
      ...rest,
      theme: commentTheme,
      namespace: `ephemeral-document-${documentId}`,
    };
  }, [documentId]);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      if (!onContentChange) {
        return;
      }
      const json = JSON.stringify(editorState.toJSON());
      if (json === lastSavedHashRef.current) {
        return;
      }
      lastSavedHashRef.current = json;
      onContentChange(json);
    },
    [onContentChange],
  );

  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [, setIsLinkEditMode] = useState(false);
  const onAnchorRef = (elem: HTMLDivElement) => {
    if (elem !== null) {
      setFloatingAnchorElem(elem);
    }
  };

  // Resolve the active theme/color-mode exactly like the notebook editor so
  // the document honours dark / branded themes instead of always rendering
  // light.
  const { colorMode, theme: themeVariant } = useThemeStore();
  const systemMode = useSystemColorMode();
  const themeConfig = getThemeConfig(themeVariant);
  const resolvedMode = colorMode === 'auto' ? systemMode : colorMode;
  const modeStyles =
    resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light;
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        bg: 'canvas.default',
      }}
    >
      {activeServiceManager ? (
        <DatalayerThemeProvider
          colorMode={colorMode}
          theme={themeConfig.primerTheme}
          themeStyles={themeConfig.themeStyles}
        >
          <JupyterReactTheme
            colormode={resolvedMode}
            backgroundColor={themeBackground}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'auto',
                overscrollBehaviorY: 'contain',
                padding: 2,
                '& .editor-shell': {
                  backgroundColor: themeBackground,
                  borderRadius: 2,
                },
                '& .editor-container': { backgroundColor: themeBackground },
                '& .editor-inner': { backgroundColor: themeBackground },
                '& .editor-input': { backgroundColor: themeBackground },
                '& [role="toolbar"][aria-label="Editor toolbar"]': {
                  backgroundColor: themeBackground,
                },
              }}
            >
              <LexicalConfigProvider
                lexicalId={documentId}
                serviceManager={activeServiceManager}
              >
                <LexicalComposer initialConfig={initialConfig}>
                  <CommentsProvider>
                    <ToolbarContext>
                      <div className="editor-shell">
                        <DocumentToolbar
                          setIsLinkEditMode={setIsLinkEditMode}
                        />
                        <div className="editor-container">
                          <div className="editor-inner">
                            <LexicalStatePlugin />
                            <RichTextPlugin
                              contentEditable={
                                <div className="editor-scroller">
                                  <div className="editor" ref={onAnchorRef}>
                                    <ContentEditable
                                      className="editor-input"
                                      aria-label="Ephemeral document editor"
                                    />
                                  </div>
                                </div>
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
                            <MarkdownShortcutPlugin
                              transformers={TRANSFORMERS}
                            />
                            <LoadContentPlugin content={initialContent} />
                            <CodeHighlightPlugin />
                            <ImagesPlugin captionsEnabled={false} />
                            <ExcalidrawPlugin />
                            <TablePlugin />
                            <TableCellResizerPlugin />
                            <TableActionMenuPlugin />
                            <TableHoverActionsV2Plugin />
                            <CollapsiblePlugin />
                            <HorizontalRulePlugin />
                            <EquationsPlugin />
                            <YouTubePlugin />
                            <AutoEmbedPlugin />
                            <JupyterCellPlugin />
                            <ComponentPickerMenuPlugin
                              kernel={documentKernel}
                            />
                            <JupyterInputOutputPlugin kernel={documentKernel} />
                            {floatingAnchorElem && (
                              <>
                                <DraggableBlockPlugin
                                  anchorElem={floatingAnchorElem}
                                />
                                <FloatingTextFormatToolbarPlugin
                                  anchorElem={floatingAnchorElem}
                                  setIsLinkEditMode={setIsLinkEditMode}
                                />
                                <CodeActionMenuPlugin
                                  anchorElem={floatingAnchorElem}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </ToolbarContext>
                  </CommentsProvider>
                </LexicalComposer>
              </LexicalConfigProvider>
            </Box>
          </JupyterReactTheme>
        </DatalayerThemeProvider>
      ) : null}
    </Box>
  );
}

export default EphemeralDocument;
