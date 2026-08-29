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
  type ToolbarItem,
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
import { useResumeServerExecutions } from '../../jupyter/useResumeServerExecutions';
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
  runtimeName?: string;
}

export interface EphemeralNotebookProps {
  /**
   * Notebook identifier. Must match the id passed to `useNotebookTools` so the
   * agent's notebook frontend tools operate on this notebook instance.
   */
  notebookId: string;
  /** Preferred runtime pod name to bind the notebook kernel to. */
  runtimeName?: string;
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
  /**
   * Whether to draw a toolbar at all. Defaults to true.
   *
   * For a host where the toolbar is somebody's to provide — the LOOP
   * workspace, where a plugin owns it and can be switched off. `false` draws
   * no bar rather than an empty one: an empty bar still costs a row and a
   * border, and reads as broken rather than as absent.
   */
  showToolbar?: boolean;
  /**
   * Items added to the toolbar of the notebook.
   *
   * The notebook toolbar merges them with its own and orders the whole by the
   * `order` of each item, so a host adds what the notebook itself knows
   * nothing about — the status of the sandbox it runs on, a selector to
   * change it — without replacing the toolbar through `toolbarComponent`.
   */
  toolbarExtraItems?: ToolbarItem[];
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

  /**
   * A `ServiceManager` to bind to instead of resolving one from a runtime.
   *
   * For hosts that already own the connection — a browser (Pyodide) sandbox,
   * where the kernel runs in the page and there is no pod to look up. Binding
   * to the host's manager is what puts the agent's executions and the reader's
   * cells in the same kernel.
   */

  /**
   * Render without wrapping the content in a theme provider.
   *
   * For a host that already owns one — the LOOP workspace, where the entry
   * point provides the theme and the views inherit it. Nested providers fight
   * over `BaseStyles` and font tokens, and the inner one wins for the wrong
   * reasons.
   */
  inheritTheme?: boolean;
  serviceManager?: ServiceManager.IManager;

  /**
   * A kernel already running on that manager to bind to.
   *
   * Supplied with `serviceManager` when the host has a kernel of its own — a
   * browser sandbox, say. Without it the notebook starts a second kernel on the
   * same manager, which for Pyodide dies on arrival and, more importantly,
   * would put the reader's cells and the agent's executions in different
   * kernels.
   */
  kernelId?: string;
}

/**
 * Renders an in-memory notebook backed by a sandbox kernel.
 */

/**
 * The theme provider, or nothing.
 *
 * A host that already owns a theme root passes `inherit`; nested providers
 * fight over `BaseStyles` and font tokens, and the inner one wins for the wrong
 * reasons.
 */
function ThemeRoot({
  inherit,
  colorMode,
  themeConfig,
  children,
}: {
  inherit: boolean;
  colorMode: 'light' | 'dark' | 'auto';
  themeConfig: { primerTheme: unknown; themeStyles: unknown };
  children: React.ReactNode;
}): JSX.Element {
  if (inherit) {
    return <>{children}</>;
  }
  return (
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={themeConfig.primerTheme as never}
      themeStyles={themeConfig.themeStyles as never}
    >
      {children}
    </DatalayerThemeProvider>
  );
}

export function EphemeralNotebook({
  notebookId,
  runtimeName,
  runtimeOverride,
  serviceManager: externalServiceManager,
  inheritTheme = false,
  kernelId: externalKernelId,
  cellSidebarMargin = 120,
  nbformat,
  onNbformatChange,
  toolbarComponent,
  toolbarExtraItems,
  showToolbar = true,
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
  const resolvedRuntime = useMemo(() => {
    const preferredRuntime = String(runtimeName || '').trim();
    if (!preferredRuntime) {
      return undefined;
    }
    return runtimes.find(
      rt => String(rt?.runtime_name || '') === preferredRuntime,
    );
  }, [runtimeName, runtimes]);

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
        runtime_name:
          String(runtimeOverride?.runtimeName || '').trim() ||
          'agent-node-proxy',
      };
    }
    return resolvedRuntime;
  }, [runtimeOverride, resolvedRuntime]);

  // While the assigned pod has not yet appeared in the runtimes list, poll the
  // list quickly instead of waiting for the default (10s) refresh interval.
  // This is what makes the "Starting notebook…" state clear promptly once the
  // agent runtime is ready, rather than lingering for several seconds. The
  // override path binds immediately, so no polling is needed there.
  const needsRuntimeLookup = Boolean(
    !runtimeOverride?.baseUrl &&
    String(runtimeName || '').trim() &&
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
        const pending = new ServiceManager({ serverSettings });
        manager = pending;
        // Central sandbox registry: runtime terminate/pause disposes this
        // manager immediately so its pollers cannot hit the dead pod ingress.
        unregisterManager = registerSandboxServiceManager(
          String(selectedRuntime?.runtime_name || ''),
          manager,
        );
        // The cleanup below may already have run: it captured `manager` while
        // it was still null, because this function is async and assigns it
        // after the first await the caller does not wait for. Switching
        // sandboxes quickly is exactly that race, and the manager it orphans
        // polls the abandoned server for the life of the page.
        if (cancelled) {
          release(pending);
          return;
        }
        await pending.ready;
        await pending.kernels.refreshRunning();
        const runningKernel = [...pending.kernels.running()][0];

        if (cancelled) {
          release(pending);
          return;
        }
        setRuntimeServiceManager(pending);
        setRuntimeKernelId(runningKernel?.id);
        setRuntimeStartDefaultKernel(!runningKernel);
      } catch (reason) {
        // Give up the manager, do not merely stop looking at it.
        //
        // A `ServiceManager` starts polling `/api/kernels` and `/api/sessions`
        // the moment it is constructed, on its own schedule. Abandoning one
        // whose `ready` rejected left those polls running against a server
        // that had gone — a switch away from a restarted sandbox produced an
        // endless run of ERR_CONNECTION_REFUSED, one every few seconds,
        // forever.
        if (manager) {
          release(manager);
          manager = null;
        }
        if (!cancelled) {
          console.warn(
            `[agent-runtimes] Could not reach the sandbox at ${baseUrl}.`,
            reason,
          );
          setRuntimeServiceManager(null);
          setRuntimeKernelId(undefined);
          setRuntimeStartDefaultKernel(false);
        }
      }
    };

    /** Unregister and dispose one manager, once. */
    const release = (target: ServiceManager) => {
      unregisterManager?.();
      unregisterManager = null;
      disposeServiceManager(target);
    };

    connectRuntime();

    return () => {
      cancelled = true;
      if (manager) {
        release(manager);
        manager = null;
      } else {
        unregisterManager?.();
        unregisterManager = null;
      }
    };
  }, [
    selectedRuntime?.runtime_name,
    selectedRuntime?.url,
    selectedRuntime?.token,
    (selectedRuntime as { wsUrl?: string })?.wsUrl,
  ]);

  // Bind strictly to the agent runtime sandbox; there is NO local fallback
  // kernel. The notebook executes on the agent's runtime or shows a waiting
  // state until the runtime is ready.
  // A host that already owns a `ServiceManager` — a browser (Pyodide) sandbox,
  // where the kernel runs in the page and there is no pod to resolve — passes
  // it in. Binding to *that* manager is what puts the agent's executions and
  // the reader's cells in the same kernel.
  const activeServiceManager = externalServiceManager ?? runtimeServiceManager;
  const activeKernelId = externalKernelId ?? runtimeKernelId;
  // Join the host's kernel when there is one; only start a kernel of our own
  // when the host handed us a manager without one. Starting a second kernel
  // beside the host's would split the reader's cells from the agent's
  // executions — and for Pyodide the second one dies on arrival.
  const activeStartDefaultKernel = externalServiceManager
    ? !externalKernelId
    : runtimeStartDefaultKernel;
  // The toolbar of the notebook, with the items of the host merged in. A host
  // replacing the toolbar altogether receives them as well, as every toolbar
  // built on the notebook one takes `extraItems`.
  const ToolbarComponent = useMemo(() => {
    if (!showToolbar) {
      // Undefined, not a component that renders null. `Notebook` guards with
      // `{Toolbar && <Toolbar/>}`, so this removes it from the tree entirely —
      // which matters for the sibling selectors below.
      return undefined;
    }
    const Base = toolbarComponent || NotebookToolbar;
    if (!toolbarExtraItems?.length) {
      return Base;
    }
    return function EphemeralNotebookToolbar(props: any) {
      return <Base {...props} extraItems={toolbarExtraItems} />;
    };
  }, [showToolbar, toolbarComponent, toolbarExtraItems]);

  const isRuntimeStarting = Boolean(
    (String(runtimeName || '').trim() ||
      String(runtimeOverride?.baseUrl || '').trim()) &&
    !activeServiceManager,
  );
  useProgressTask(`ephemeral-notebook-start-${notebookId}`, isRuntimeStarting);

  /*
   * What a previous page left running on the sandbox.
   *
   * The cells come back from the persisted model, each carrying the request
   * the server accepted for it; once the sandbox is bound again, those
   * requests are polled back into the cells, so a refresh mid-run finds the
   * outputs that kept arriving while it was away.
   */
  useResumeServerExecutions(notebookId, activeServiceManager ?? undefined);

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

  /*
   * A session path under `.datalayer/`, so the server executor recovers outputs.
   *
   * `jupyter-server-nbmodel` streams a cell's outputs into the shared document
   * of the server when the session names a file of it, and turns on HTTP
   * output recovery when it does not — the case for every editor of Datalayer.
   * Left to default, Jupyter React names the session `kernel-<id>`, which the
   * executor reads as a real server document, so it keeps recovery OFF and an
   * ephemeral notebook (which has no shared document on the pod at all) shows
   * no outputs and loses a running cell on refresh. A `.datalayer/` path is
   * how the executor is told there is no file here; the notebook id keeps two
   * ephemeral notebooks on one sandbox from sharing a session.
   */
  const sessionPath = useMemo(
    () => `.datalayer/${notebookId}.ipynb`,
    [notebookId],
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
        <ThemeRoot
          inherit={inheritTheme}
          colorMode={effectiveColorMode}
          themeConfig={themeConfig}
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
                backgroundColor: themeBackground,
                // Give the notebook a resolved height so cells render. The
                // Jupyter Notebook component renders its outer container with
                // id "dla-Jupyter-Notebook"; pin its toolbar and let the cell
                // area grow to fill the remaining space.
                '& #dla-Jupyter-Notebook': {
                  display: 'flex',
                  flexDirection: 'column',
                },
                // Pin the toolbar — but only while there is one. This targets
                // the first child, and with the toolbar gone that is the
                // notebook body: it would be made sticky and painted with the
                // toolbar's own background.
                ...(showToolbar
                  ? {
                      '& #dla-Jupyter-Notebook > :first-of-type': {
                        position: 'sticky' as const,
                        top: 0,
                        zIndex: 2,
                        flex: '0 0 auto',
                        backgroundColor: themeBackground,
                      },
                    }
                  : {
                      // `Notebook` gives the panel header `min-height: 50px` to
                      // reserve room for a toolbar. With no toolbar that room
                      // is a white band under nothing.
                      '& .datalayer-NotebookPanel-header': {
                        display: 'none',
                        minHeight: 0,
                      },
                    }),
                '& #dla-Jupyter-Notebook > .dla-Box-Notebook': {
                  flex: '1 1 auto',
                  minHeight: 0,
                },
                '& [role="toolbar"][aria-label="Notebook toolbar"]': {
                  backgroundColor: themeBackground,
                },
              }}
            >
              <Notebook
                nbformat={initialNbformat}
                id={notebookId}
                path={sessionPath}
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
        </ThemeRoot>
      ) : null}
    </Box>
  );
}

export default EphemeralNotebook;
