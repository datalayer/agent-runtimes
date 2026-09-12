/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Cells that keep running when the page goes away, for the editors of Datalayer.
 *
 * A cell run over the kernel websocket belongs to the page that sent it: close
 * or refresh that page mid-run and the kernel goes on, but every output from
 * that moment on is written to nobody. `jupyter-server-nbmodel` answers this
 * on the server — a cell posted to its REST endpoint runs there, its outputs
 * are kept there, and any page may read them back — and ships a JupyterLab
 * executor and restorer for it. Neither reaches the editors here:
 *
 * - the executor is built once, on the settings of THE Jupyter server of the
 *   application. The SaaS has none (it is serverless); the kernel of a
 *   notebook lives on a sandbox pod the browser talks to directly, and the
 *   REST endpoint it must post to is the pod's;
 * - the restorer walks the notebook tracker of JupyterLab, which never sees a
 *   React notebook.
 *
 * So this module does both, per notebook, against the server the notebook's
 * kernel actually runs on: {@link serverExecutorFor} finds out whether that
 * server has the extension and hands back an executor bound to it, and
 * {@link resumeServerExecutions} picks up, after a reload, whatever a
 * previous page left running — from the request recorded in the cell's
 * metadata when there is one, and from the server's own list of active
 * requests when there is not (the metadata is written a moment after the
 * request is accepted, and a refresh can land in between).
 *
 * Both editors that need it — the notebook of a space and the ephemeral
 * notebook beside an agent — keep their cells across a refresh (the one in
 * the collaboration room of the spacer, the other in the persisted model), so
 * the cells are there to resume into.
 *
 * @module jupyter/serverExecution
 */

import type { ISessionContext } from '@jupyterlab/apputils';
import { CodeCell } from '@jupyterlab/cells';
import { URLExt } from '@jupyterlab/coreutils';
import type { INotebookCellExecutor } from '@jupyterlab/notebook';
import { ServerConnection } from '@jupyterlab/services';
import type { Kernel } from '@jupyterlab/services';
import {
  getServerExecutionMetadata,
  isClientOwnedExecution,
  setServerExecutionMetadata,
} from '@datalayer/jupyter-server-nbmodel/lib/executionMetadata';
import {
  NotebookCellServerExecutor,
  resumeCellServerExecution,
} from '@datalayer/jupyter-server-nbmodel/lib/executor';

/**
 * The route `jupyter-server-nbmodel` answers on.
 *
 * It reports the executions the server holds for a kernel, and it answers
 * for any identifier — the nil one included, so no kernel has to exist to
 * learn whether the extension is installed. A server without it says 404.
 */
const NBMODEL_PROBE =
  'api/kernels/00000000-0000-0000-0000-000000000000/execute';

/** What a server said when asked, by the address it was asked at. */
const installed = new Map<string, Promise<boolean>>();

/**
 * Whether the server at these settings runs cells on the server.
 *
 * Asked once per server and remembered, including the answer "no": the
 * question is asked on the way to running a cell, and a cell must not wait
 * on a round trip every time. A server that could not be reached is not
 * remembered, so a sandbox still starting is asked again next time.
 */
export function hasServerExecution(
  settings: ServerConnection.ISettings,
): Promise<boolean> {
  const key = settings.baseUrl;
  const known = installed.get(key);
  if (known) {
    return known;
  }
  const asked = ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, NBMODEL_PROBE),
    { method: 'GET' },
    settings,
  )
    .then(response => response.ok)
    .catch(reason => {
      installed.delete(key);
      console.warn(
        `[agent-runtimes] Could not ask ${settings.baseUrl} whether it runs cells on the server.`,
        reason,
      );
      return false;
    });
  installed.set(key, asked);
  return asked;
}

/** The executors built so far, one per server and credential. */
const executors = new Map<string, INotebookCellExecutor>();

/**
 * The executor to run a cell of this session through, if its server has one.
 *
 * Bound to the server of the session's KERNEL — the sandbox pod — which is
 * where the REST endpoint lives and where the request is then kept; the
 * executor of the lab extension is bound to the application's own server,
 * which is not that one and, on the SaaS, is not at all.
 *
 * `null` when the session has no kernel yet, or its server does not run
 * cells: the caller then executes over the kernel connection as before.
 */
export async function serverExecutorFor(
  sessionContext: ISessionContext | undefined,
): Promise<INotebookCellExecutor | null> {
  const settings = sessionContext?.session?.kernel?.serverSettings;
  if (!settings?.baseUrl) {
    return null;
  }
  if (!(await hasServerExecution(settings))) {
    return null;
  }
  // The token is part of the key: a sandbox restarted with a new one must
  // not be posted to with the old.
  const key = `${settings.baseUrl}#${settings.token}`;
  let executor = executors.get(key);
  if (!executor) {
    executor = new NotebookCellServerExecutor({ serverSettings: settings });
    executors.set(key, executor);
  }
  return executor;
}

/** What the server says of one execution it holds. */
interface IActiveExecution {
  cell_id?: string;
  kernel_id: string;
  request_id: string;
  request_url: string;
}

/** The requests already picked up, so two sweeps never poll one twice. */
const resumed = new Set<string>();

/**
 * The absolute address of a recorded request, on the server that holds it.
 *
 * The server names the request by a path relative to its own base, and that
 * is what the cell remembers; joined here to the base of the server being
 * asked. An address recorded in full is kept when it already names that
 * server, and reduced to its path otherwise — a pod reached through an
 * ingress, or the same pod under another hostname, still holds the request
 * at the same path.
 */
function requestUrlOn(
  recorded: string,
  settings: ServerConnection.ISettings,
): string {
  if (recorded.startsWith(settings.baseUrl)) {
    return recorded;
  }
  const path = recorded.startsWith('http')
    ? new URL(recorded).pathname
    : recorded;
  return URLExt.join(settings.baseUrl, path);
}

/**
 * Resume, into this cell, a request a previous page left running.
 *
 * @returns whether a request was taken up
 */
function resumeCell(
  cell: CodeCell,
  settings: ServerConnection.ISettings,
): boolean {
  // A request this page started is polled by the executor that started it;
  // polling it here as well would race it for the same result.
  if (isClientOwnedExecution(cell)) {
    return false;
  }
  const execution = getServerExecutionMetadata(cell);
  if (!execution || resumed.has(execution.requestId)) {
    return false;
  }
  /*
   * A cell that is still here when the answers arrive.
   *
   * The notebook rebuilds its cells when its sandbox binds — the services
   * change under it and the model is made again — so a widget picked up a
   * moment earlier is disposed by the time the first response lands, and
   * writing to it throws on a model that is null.
   */
  if (cell.isDisposed || !cell.model) {
    return false;
  }
  resumed.add(execution.requestId);
  const requestUrl = requestUrlOn(execution.requestUrl, settings);
  console.info('[agent-runtimes] Resuming a server execution', {
    cellId: cell.model.sharedModel.getId(),
    requestId: execution.requestId,
    requestUrl,
  });
  void resumeCellServerExecution(cell, requestUrl, settings).catch(reason => {
    if (cell.isDisposed) {
      // The cell went away under the poll — the notebook was rebuilt. Let a
      // later sweep pick the request up with the new widget.
      resumed.delete(execution.requestId);
      return;
    }
    /*
     * Kept in `resumed`, not released.
     *
     * Releasing it on failure meant the next sweep tried again a second
     * later, and the one after that: a request the server does not have
     * produced a failing call every second for as long as the sweep ran. A
     * request is attempted once.
     */
    console.warn(
      `[agent-runtimes] Failed to resume the execution ${execution.requestId}.`,
      reason,
    );
  });
  return true;
}

/** The servers already asked for their active executions, by kernel. */
const discovered = new Set<string>();

/**
 * Ask the server which of this kernel's executions are still running, and
 * give the cells that started them their request back.
 *
 * The metadata a cell carries is written once the server has accepted the
 * request — a page refreshed in that instant, or whose persisted model
 * missed the write, has a running cell with nothing to resume from. The
 * server knows: it lists its active requests with the cell each was for.
 */
async function discoverActiveExecutions(
  cells: readonly CodeCell[],
  kernel: Kernel.IKernelConnection,
  settings: ServerConnection.ISettings,
): Promise<number> {
  const key = `${settings.baseUrl}#${kernel.id}`;
  if (discovered.has(key)) {
    return 0;
  }
  const response = await ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, `api/kernels/${kernel.id}/execute`),
    { method: 'GET' },
    settings,
  );
  if (response.status === 404) {
    // This server does not offer server-side execution at all — a JupyterLite
    // kernel in the page, or a plain Jupyter server without the agent-runtimes
    // extension. That is a permanent answer, not a hiccup, so it is recorded
    // like a successful discovery: asking again on every sweep would fill the
    // console with a failure that is really just a feature this server lacks.
    discovered.add(key);
    return 0;
  }
  if (!response.ok) {
    // Not marked discovered: a server briefly unreachable, or one still
    // starting, is asked again by the next sweep rather than never.
    //
    // `ResponseError.create` reads the body to build its message, and throws a
    // `SyntaxError` of its own when there is no body — which replaces the
    // status the caller needed with a parse error from the error path. The
    // status is the useful part, so it survives either way.
    throw await ServerConnection.ResponseError.create(response).catch(
      () =>
        new Error(
          `Invalid response: ${response.status} ${response.statusText}`.trim(),
        ),
    );
  }
  discovered.add(key);
  const payload = (await response.json()) as { requests?: IActiveExecution[] };
  let restored = 0;
  for (const execution of payload.requests ?? []) {
    if (!execution.cell_id || resumed.has(execution.request_id)) {
      continue;
    }
    const cell = cells.find(
      candidate => candidate.model?.sharedModel.getId() === execution.cell_id,
    );
    if (!cell || cell.isDisposed || getServerExecutionMetadata(cell)) {
      continue;
    }
    setServerExecutionMetadata(cell, {
      kernelId: execution.kernel_id,
      requestId: execution.request_id,
      requestUrl: execution.request_url,
    });
    restored += 1;
  }
  return restored;
}

/** A notebook widget, as much of it as the sweep reads. */
export interface ISweepableNotebook {
  content: { widgets: readonly unknown[] };
  sessionContext?: ISessionContext;
  isDisposed?: boolean;
}

/**
 * Resume, once, the server executions of the cells of this notebook.
 *
 * @param panel The notebook panel of the editor
 * @param settings The server the executions were posted to — the one of the
 *   notebook's kernel
 * @returns how many requests were taken up in this pass
 */
export async function resumeServerExecutions(
  panel: ISweepableNotebook,
): Promise<number> {
  if (panel.isDisposed) {
    return 0;
  }
  /*
   * The kernel is the gate, and its server is the address.
   *
   * A request lives on the server of the kernel that runs it — the sandbox
   * pod — and is read back from there. An editor that has not bound its
   * sandbox yet stands on a placeholder service manager pointing at the
   * application's own origin; a sweep that polled THAT would ask the wrong
   * server, get a 404, and — because a request is attempted once — never
   * ask the right one. So nothing is swept until the kernel is here, and
   * everything is asked of the kernel's own server.
   */
  const kernel = panel.sessionContext?.session?.kernel;
  const settings = kernel?.serverSettings;
  if (!kernel || !settings) {
    return 0;
  }
  const cells = panel.content.widgets.filter(
    (widget): widget is CodeCell => widget instanceof CodeCell,
  );
  if (cells.length === 0) {
    return 0;
  }
  try {
    await discoverActiveExecutions(cells, kernel, settings);
  } catch (reason) {
    console.warn(
      '[agent-runtimes] Failed to discover the active executions of the kernel.',
      reason,
    );
  }
  let taken = 0;
  for (const cell of cells) {
    if (resumeCell(cell, settings)) {
      taken += 1;
    }
  }
  return taken;
}

/**
 * Forget what was asked and resumed — for tests, which build servers anew.
 */
export function resetServerExecutionState(): void {
  installed.clear();
  executors.clear();
  resumed.clear();
  discovered.clear();
}
