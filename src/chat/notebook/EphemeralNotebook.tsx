/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * EphemeralNotebook — an in-memory Jupyter notebook rendered next to the chat.
 *
 * The notebook model lives purely in memory (the `nbformat` content below is
 * never persisted to a file) and is backed by a sandbox kernel obtained via
 * `useJupyter`. This mirrors the pattern used by the notebook editor and the
 * `NotebookNbformat` example, so the agent can drive the notebook through the
 * registered notebook frontend tools while nothing is written to disk.
 *
 * The container structure (relative wrapper + absolutely positioned inner box
 * + `#dla-Jupyter-Notebook` overrides) is copied from the notebook editor
 * (`NotebookEditorPanel`) so the cells get a resolved height and actually
 * render — a plain `height: 100%` collapses to zero inside a flex parent.
 *
 * @module chat/notebook/EphemeralNotebook
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import {
  DatalayerThemeProvider,
  getThemeConfig,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import { Box } from '@primer/react';
import {
  Notebook,
  NotebookToolbar,
  CellSidebarExtension,
  CellSidebarButton,
  JupyterReactTheme,
  notebookStore,
  disposeServiceManager,
} from '@datalayer/jupyter-react';
import type { ICollaborationProvider } from '@datalayer/jupyter-react';
import { useAgentsRuntimes } from '../../hooks/useAgentRuntimes';
import { registerSandboxServiceManager } from '../../services/sandboxServiceManagers';
import { useProgressTask } from '../../hooks/useProgressTask';
import type { EphemeralNotebookToolbarComponent } from '../../types/chat';

/**
 * Minimal in-memory notebook content. A single empty code cell is provided so
 * the notebook renders immediately and the agent can insert/update cells.
 */
const EPHEMERAL_NOTEBOOK_CONTENT: INotebookContent = {
  cells: [
    {
      cell_type: 'code',
      source: [''],
      metadata: {},
      outputs: [],
      execution_count: null,
    },
  ],
  metadata: {
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    },
    language_info: { name: 'python' },
  },
  nbformat: 4,
  nbformat_minor: 5,
};

/**
 * Explicit runtime endpoint used to bind an ephemeral notebook kernel without
 * resolving a pod from the user's runtimes list. Used to reach an agent node's
 * Jupyter server through the runtimes tunnel HTTP/WebSocket proxy.
 */
export interface EphemeralRuntimeOverride {
  /** REST base URL, e.g. `https://.../agent-nodes/{nodeId}/jupyter`. */
  baseUrl: string;
  /**
   * WebSocket base URL. Defaults to `baseUrl` with the http(s) scheme swapped
   * for ws(s). For the tunnel proxy this is the `/ws` sibling of `baseUrl`.
   */
  wsUrl?: string;
  /** Bearer/JWT token appended to requests (`appendToken`). */
  token?: string;
  /** Stable identifier used for the sandbox service-manager registry. */
  podName?: string;
}

export interface EphemeralNotebookProps {
  /**
   * Notebook identifier. Must match the id passed to `useNotebookTools` so the
   * agent's notebook frontend tools operate on this notebook instance.
   */
  notebookId: string;
  /** Preferred runtime pod name to bind the notebook kernel to. */
  runtimePodName?: string;
  /**
   * Explicit runtime endpoint override. When supplied, the notebook binds its
   * kernel to this endpoint directly instead of resolving a pod from the user's
   * runtimes list. This is how a SaaS browser reaches an agent node's Jupyter
   * server through the runtimes tunnel proxy: `baseUrl` points at
   * `.../agent-nodes/{nodeId}/jupyter` and `wsUrl` at its `/ws` sibling.
   */
  runtimeOverride?: EphemeralRuntimeOverride;
  /** Left margin reserved for the cell sidebar (default 120). */
  cellSidebarMargin?: number;
  /** Optional persisted notebook model to restore when mounting. */
  nbformat?: INotebookContent;
  /** Callback fired when the notebook model changes. */
  onNbformatChange?: (content: INotebookContent) => void;
  /** Optional toolbar component override. */
  toolbarComponent?: EphemeralNotebookToolbarComponent;
  /** Optional theme variant override from host chat context. */
  themeVariant?: string;
  /** Optional color mode override from host chat context. */
  colorMode?: 'light' | 'dark' | 'auto';
  /**
   * Optional real-time collaboration provider. When supplied, the notebook
   * joins a shared collaborative room (the ydoc becomes the source of truth)
   * and the local in-memory persistence poll is disabled. This is how a node's
   * notebook state transits to the SaaS UI (and back) over RTC instead of the
   * tunnel.
   */
  collaborationProvider?: ICollaborationProvider;
}

/**
 * Renders an in-memory notebook backed by a sandbox kernel.
 */
export function EphemeralNotebook({
  notebookId,
  runtimePodName,
  runtimeOverride,
  cellSidebarMargin = 120,
  nbformat,
  onNbformatChange,
  toolbarComponent,
  themeVariant,
  colorMode,
  collaborationProvider,
}: EphemeralNotebookProps) {
  // The `nbformat` passed to the `Notebook` component MUST stay a stable
  // reference for the lifetime of a given `notebookId`: the underlying
  // `useNotebookModel` hook rebuilds the notebook model (and its context /
  // adapter) every time the `nbformat` reference changes. Feeding the live
  // model back into this prop would thrash the notebook and can persist
  // transient/empty content. So we capture the initial/restore content ONCE
  // per `notebookId` and never mutate it from the live model.
  const initialNbformatRef = useRef<INotebookContent>(
    nbformat ?? EPHEMERAL_NOTEBOOK_CONTENT,
  );
  const initialNotebookIdRef = useRef<string>(notebookId);
  if (initialNotebookIdRef.current !== notebookId) {
    // Notebook scope changed (e.g. switching agents) — reset the restore seed.
    initialNotebookIdRef.current = notebookId;
    initialNbformatRef.current = nbformat ?? EPHEMERAL_NOTEBOOK_CONTENT;
  }
  const initialNbformat = initialNbformatRef.current;

  // Hash of the last content we persisted, so the poll only writes on change.
  const lastSavedHashRef = useRef<string>(JSON.stringify(initialNbformat));

  // Resolve the runtime sandbox strictly by its assigned pod name. There is
  // deliberately NO fallback to "first running" or `runtimes[0]`: the ephemeral
  // notebook must bind to exactly the runtime assigned to this agent, or to
  // none at all (straight path).
  const { runtimes, refetchRuntimes } = useAgentsRuntimes();
  const podResolvedRuntime = useMemo(() => {
    const preferredPod = String(runtimePodName || '').trim();
    if (!preferredPod) {
      return undefined;
    }
    return runtimes.find(rt => String(rt?.pod_name || '') === preferredPod);
  }, [runtimePodName, runtimes]);

  // An explicit endpoint override wins over the pod lookup: it lets a SaaS
  // browser bind the kernel through the runtimes tunnel proxy (the node's
  // Jupyter server is not directly reachable, so no pod exists in the list).
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
    return podResolvedRuntime;
  }, [runtimeOverride, podResolvedRuntime]);

  // While the assigned pod has not yet appeared in the runtimes list, poll the
  // list quickly instead of waiting for the default (10s) refresh interval.
  // This is what makes the "Starting notebook…" state clear promptly once the
  // agent runtime is ready, rather than lingering for several seconds. The
  // override path binds immediately, so no polling is needed there.
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
  const [runtimeKernelId, setRuntimeKernelId] = useState<string | undefined>(
    undefined,
  );
  const [runtimeStartDefaultKernel, setRuntimeStartDefaultKernel] =
    useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let manager: ServiceManager | null = null;
    let unregisterManager: (() => void) | null = null;

    const connectRuntime = async () => {
      const baseUrl = String(selectedRuntime?.url || '').trim();
      if (!baseUrl) {
        if (!cancelled) {
          setRuntimeServiceManager(null);
          setRuntimeKernelId(undefined);
          setRuntimeStartDefaultKernel(false);
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
        await manager.kernels.refreshRunning();
        const runningKernel = [...manager.kernels.running()][0];

        if (!cancelled) {
          setRuntimeServiceManager(manager);
          setRuntimeKernelId(runningKernel?.id);
          setRuntimeStartDefaultKernel(!runningKernel);
        }
      } catch {
        if (!cancelled) {
          setRuntimeServiceManager(null);
          setRuntimeKernelId(undefined);
          setRuntimeStartDefaultKernel(false);
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
  }, [
    selectedRuntime?.pod_name,
    selectedRuntime?.url,
    selectedRuntime?.token,
    (selectedRuntime as { wsUrl?: string })?.wsUrl,
  ]);

  // Bind strictly to the agent runtime sandbox; there is NO local fallback
  // kernel. The notebook executes on the agent's runtime or shows a waiting
  // state until the runtime is ready.
  const activeServiceManager = runtimeServiceManager;
  const activeKernelId = runtimeKernelId;
  const activeStartDefaultKernel = runtimeStartDefaultKernel;
  const ToolbarComponent = toolbarComponent || NotebookToolbar;

  const isRuntimeStarting = Boolean(
    (String(runtimePodName || '').trim() ||
      String(runtimeOverride?.baseUrl || '').trim()) &&
    !activeServiceManager,
  );
  useProgressTask(`ephemeral-notebook-start-${notebookId}`, isRuntimeStarting);

  useEffect(() => {
    // When a collaboration provider is active the shared ydoc is the single
    // source of truth and is synced remotely; the local in-memory persistence
    // poll would fight it, so it is disabled in that mode.
    if (collaborationProvider) {
      return;
    }
    // Read the CURRENT live notebook model straight from the notebook store.
    // The `NotebookAdapter` exposes `notebook` (the widget, whose `.model` is
    // the `INotebookModel`) and `panel` (`panel.content.model`). There is NO
    // `notebookPanel` getter, so we read through those real accessors.
    const readLiveModel = (): INotebookContent | null => {
      const notebook = notebookStore.getState().selectNotebook(notebookId);
      const adapter = notebook?.adapter as
        | {
            notebook?: { model?: { toJSON?: () => unknown } | null };
            panel?: { content?: { model?: { toJSON?: () => unknown } | null } };
          }
        | undefined;
      const model =
        adapter?.notebook?.model ?? adapter?.panel?.content?.model ?? null;
      const modelJson = model?.toJSON?.() as INotebookContent | undefined;
      return modelJson ?? null;
    };

    // Persist the current model to the store, but only when it actually
    // changed. This never feeds back into the `nbformat` prop, so the live
    // notebook is not rebuilt.
    const persistLiveModel = () => {
      const model = readLiveModel();
      if (!model || !Array.isArray(model.cells)) {
        return;
      }
      const nextHash = JSON.stringify(model);
      if (nextHash === lastSavedHashRef.current) {
        return;
      }
      lastSavedHashRef.current = nextHash;
      onNbformatChange?.(model);
    };

    const intervalId = window.setInterval(persistLiveModel, 500);

    return () => {
      window.clearInterval(intervalId);
      // Capture the final model on unmount (navigating away) so the very last
      // edits are persisted before the notebook adapter is disposed.
      persistLiveModel();
    };
  }, [activeServiceManager, notebookId, onNbformatChange]);

  // Resolve the active theme/color-mode exactly like the notebook editor
  // (NotebookEditorPanel) so the notebook honours dark / branded themes
  // instead of always rendering light.
  const { colorMode: storeColorMode, theme: storeThemeVariant } =
    useThemeStore();
  const effectiveColorMode = colorMode ?? storeColorMode;
  const effectiveThemeVariant = themeVariant ?? storeThemeVariant;
  const systemMode = useSystemColorMode();
  const themeConfig = getThemeConfig(effectiveThemeVariant as any);
  const resolvedMode =
    effectiveColorMode === 'auto' ? systemMode : effectiveColorMode;
  const modeStyles =
    resolvedMode === 'dark'
      ? themeConfig.themeStyles.dark
      : themeConfig.themeStyles.light;
  const themeBackground =
    (modeStyles as Record<string, string>).backgroundColor ?? '';

  const extensions = useMemo(
    () => [new CellSidebarExtension({ factory: CellSidebarButton })],
    [],
  );

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
          colorMode={effectiveColorMode}
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
                overflow: 'hidden',
                overscrollBehaviorY: 'contain',
                overflowAnchor: 'none',
                padding: 2,
                // Give the notebook a resolved height so cells render. The
                // Jupyter Notebook component renders its outer container with
                // id "dla-Jupyter-Notebook"; pin its toolbar and let the cell
                // area grow to fill the remaining space.
                '& #dla-Jupyter-Notebook': {
                  display: 'flex',
                  flexDirection: 'column',
                },
                '& #dla-Jupyter-Notebook > :first-of-type': {
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  flex: '0 0 auto',
                  background: 'var(--jp-layout-color0, transparent)',
                },
                '& #dla-Jupyter-Notebook > .dla-Box-Notebook': {
                  flex: '1 1 auto',
                  minHeight: 0,
                },
              }}
            >
              <Notebook
                nbformat={initialNbformat}
                id={notebookId}
                serviceManager={activeServiceManager}
                startDefaultKernel={activeStartDefaultKernel}
                kernelId={activeKernelId}
                height="100%"
                cellSidebarMargin={cellSidebarMargin}
                extensions={extensions}
                Toolbar={ToolbarComponent}
                collaborationProvider={collaborationProvider}
              />
            </Box>
          </JupyterReactTheme>
        </DatalayerThemeProvider>
      ) : null}
    </Box>
  );
}

export default EphemeralNotebook;
