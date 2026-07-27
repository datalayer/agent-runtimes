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
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import {
  DatalayerThemeProvider,
  getThemeConfig,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import { Box, Spinner, Text } from '@primer/react';
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
import {
  createWebsocketProvider,
  LoroCollaborationPlugin,
} from '@datalayer/lexical-loro';
import { editorConfig } from '../../examples/lexical/editorConfig';
import { useLexicalTools } from '../../tools/adapters/agent-runtimes/lexicalHooks';
import { useAgentsRuntimes } from '../../hooks/useAgentRuntimes';
import { registerSandboxServiceManager } from '../../services/sandboxServiceManagers';
import { useProgressTask } from '../../hooks/useProgressTask';
import type { FrontendToolDefinition } from '../../types/tools';
import type { EphemeralRuntimeOverride } from '../notebook/EphemeralNotebook';

import '@datalayer/jupyter-react/lib/css/PrismCss';
import '@datalayer/jupyter-lexical/style/index.css';

/**
 * Real-time collaboration configuration for the ephemeral document.
 *
 * When supplied, the Lexical editor state is backed by a shared Loro CRDT
 * document synchronised over a WebSocket (the spacer lexical endpoint) instead
 * of the in-memory / persisted local state. Every peer that joins the same
 * `roomId` edits the same document — this is how an Agent Node and the SaaS UI
 * share a live document. The caller owns the room/identity lifecycle.
 */
export interface EphemeralDocumentCollaboration {
  /**
   * WebSocket URL of the Loro collaboration server, e.g.
   * `wss://…/api/spacer/v1/lexical/ws`.
   */
  websocketUrl: string;
  /** Shared collaboration room / document id joined by all peers. */
  roomId: string;
  /** Optional identity used for collaborative presence (cursors / awareness). */
  identity?: {
    userId?: string;
    handle?: string;
    displayName?: string;
    initials?: string;
    avatarUrl?: string;
    color?: string;
  };
}

export interface EphemeralDocumentProps {
  /**
   * Document identifier. Must match the id passed to `useLexicalTools` so the
   * agent's lexical frontend tools operate on this document instance.
   */
  documentId: string;
  /** Preferred runtime pod name to bind the document kernel to. */
  runtimePodName?: string;
  /** Optional explicit runtime endpoint (agent-node tunnel proxy path). */
  runtimeOverride?: EphemeralRuntimeOverride;
  /** Optional persisted Lexical editor state (JSON string) to restore. */
  content?: string;
  /** Callback fired when the document's editor state changes. */
  onContentChange?: (content: string) => void;
  /** Reports the lexical frontend tools so the parent can pass them to the agent. */
  onToolsReady?: (tools: FrontendToolDefinition[]) => void;
  /**
   * Reports the document's live sandbox kernel connection upward so the chat
   * header can render the same rich kernel indicator (kernel id, client id,
   * status) as the notebook surface. Emits `null` while the kernel is absent.
   */
  onKernelChange?: (kernel: IKernelConnection | null) => void;
  /**
   * Optional real-time collaboration configuration. When supplied the document
   * joins a shared Loro room over WebSocket so its state transits over RTC
   * (e.g. between an Agent Node and the SaaS UI) rather than living purely in
   * local memory.
   */
  collaboration?: EphemeralDocumentCollaboration;
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
  runtimeOverride,
  content,
  onContentChange,
  onToolsReady,
  onKernelChange,
  collaboration,
}: EphemeralDocumentProps) {
  // Real-time collaboration is active only when both a WebSocket endpoint and a
  // room id are supplied. In that mode the shared Loro CRDT is the single source
  // of truth: local content-seeding and undo history are disabled so the local
  // editor never diverges from (or fights) the collaborative document.
  const isCollaborative = Boolean(
    collaboration?.websocketUrl && collaboration?.roomId,
  );
  const collaborationName =
    collaboration?.identity?.displayName ||
    collaboration?.identity?.handle ||
    collaboration?.identity?.userId;
  const collaborationColor = collaboration?.identity?.color;
  const collaborationAwarenessData = useMemo(
    () => ({
      user: {
        id: collaboration?.identity?.userId,
        username:
          collaboration?.identity?.userId ||
          collaboration?.identity?.handle ||
          collaboration?.identity?.displayName,
        name:
          collaboration?.identity?.handle ||
          collaboration?.identity?.displayName,
        display_name:
          collaboration?.identity?.displayName ||
          collaboration?.identity?.handle,
        initials: collaboration?.identity?.initials,
        color: collaboration?.identity?.color,
        avatar_url: collaboration?.identity?.avatarUrl,
        handle: collaboration?.identity?.handle,
      },
    }),
    [collaboration?.identity],
  );
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
  const { runtimes, refetchRuntimes } = useAgentsRuntimes();
  const selectedRuntime = useMemo(() => {
    const overrideBaseUrl = String(runtimeOverride?.baseUrl || '').trim();
    if (overrideBaseUrl) {
      return {
        url: overrideBaseUrl,
        wsUrl: String(runtimeOverride?.wsUrl || '').trim() || undefined,
        token: String(runtimeOverride?.token || '').trim(),
        pod_name:
          String(runtimeOverride?.podName || '').trim() || 'agent-node-proxy',
      };
    }
    const preferredPod = String(runtimePodName || '').trim();
    if (!preferredPod) {
      return undefined;
    }
    return runtimes.find(rt => String(rt?.pod_name || '') === preferredPod);
  }, [runtimeOverride, runtimePodName, runtimes]);

  const needsRuntimeLookup = Boolean(
    !runtimeOverride?.baseUrl &&
      String(runtimePodName || '').trim() &&
      !selectedRuntime,
  );
  useEffect(() => {
    if (!needsRuntimeLookup) {
      return;
    }
    void refetchRuntimes();
    const intervalId = window.setInterval(() => {
      void refetchRuntimes();
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [needsRuntimeLookup, refetchRuntimes]);

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
    let unregisterManager: (() => void) | null = null;

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
        const wsUrl =
          String((selectedRuntime as { wsUrl?: string })?.wsUrl || '').trim() ||
          baseUrl.replace(/^http/, 'ws');
        const serverSettings = ServerConnection.makeSettings({
          baseUrl,
          wsUrl,
          token,
          appendToken: true,
        });
        manager = new ServiceManager({ serverSettings });
        // Central sandbox registry: runtime terminate/pause disposes this
        // manager immediately so its pollers cannot hit the dead pod ingress.
        unregisterManager = registerSandboxServiceManager(
          String(selectedRuntime?.pod_name || ''),
          manager,
        );
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
      unregisterManager?.();
      if (manager) {
        disposeServiceManager(manager);
      }
    };
  }, [selectedRuntime?.pod_name, selectedRuntime?.url, selectedRuntime?.token]);

  // Surface the document's live kernel connection to the parent so the chat
  // header's kernel indicator reflects the real connected kernel instead of
  // the "disconnected"/"no-kernel" placeholder while the document is active.
  useEffect(() => {
    onKernelChange?.(documentKernel?.connection ?? null);
    return () => {
      onKernelChange?.(null);
    };
  }, [documentKernel, onKernelChange]);

  const activeServiceManager = runtimeServiceManager;
  const isRuntimeStarting = Boolean(
    (String(runtimePodName || '').trim() ||
      String(runtimeOverride?.baseUrl || '').trim()) &&
      !activeServiceManager,
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
                minHeight: 0,
                overflow: 'hidden',
                overscrollBehaviorY: 'contain',
                padding: 2,
                '& .editor-shell': {
                  backgroundColor: themeBackground,
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  flex: 1,
                  // The shared lexical stylesheet caps `.editor-shell` at
                  // `max-width: 1100px; margin: 20px auto`, which leaves the
                  // ephemeral document narrow and centered. Take the full
                  // wrapping box width instead (matching the ui LiterateEditor,
                  // whose root is `.editor-container` with no such cap).
                  maxWidth: 'none',
                  width: '100%',
                  margin: 0,
                },
                '& .editor-container': {
                  backgroundColor: themeBackground,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  flex: 1,
                  width: '100%',
                  maxWidth: 'none',
                  margin: 0,
                },
                '& .editor-inner': {
                  backgroundColor: themeBackground,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  flex: 1,
                  width: '100%',
                  maxWidth: 'none',
                },
                '& .editor-scroller': {
                  minHeight: 0,
                  flex: 1,
                  overflow: 'auto',
                  width: '100%',
                  maxWidth: 'none',
                },
                '& .editor': {
                  minHeight: '100%',
                  width: '100%',
                  maxWidth: 'none',
                  margin: 0,
                },
                '& .editor-input': {
                  backgroundColor: themeBackground,
                  width: '100%',
                  maxWidth: 'none',
                  margin: 0,
                },
                '& .ContentEditable__root': {
                  width: '100%',
                  maxWidth: 'none',
                  margin: 0,
                },
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
                            {isCollaborative && collaboration ? (
                              <LoroCollaborationPlugin
                                id={collaboration.roomId}
                                providerFactory={createWebsocketProvider}
                                websocketUrl={collaboration.websocketUrl}
                                shouldBootstrap
                                showCollaborators
                                username={collaborationName}
                                cursorColor={collaborationColor}
                                awarenessData={collaborationAwarenessData}
                              />
                            ) : null}
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
                            {!isCollaborative && (
                              <OnChangePlugin onChange={handleChange} />
                            )}
                            {!isCollaborative && <HistoryPlugin />}
                            <AutoFocusPlugin />
                            <ListPlugin />
                            <CheckListPlugin />
                            <LinkPlugin />
                            <AutoLinkPlugin />
                            <ListMaxIndentLevelPlugin maxDepth={7} />
                            <MarkdownShortcutPlugin
                              transformers={TRANSFORMERS}
                            />
                            {!isCollaborative && (
                              <LoadContentPlugin content={initialContent} />
                            )}
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
      ) : isRuntimeStarting ? (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            color: 'fg.muted',
          }}
        >
          <Spinner size="small" />
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
            Starting document...
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export default EphemeralDocument;
