/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Notebook tool results, shown in the transcript as surfaces.
 *
 * A chat whose agent works a notebook the reader cannot see — the Loop Shell
 * mounts one hidden; any headless-notebook host is in the same position —
 * used to leave the tool row as the only trace: "ran cell 3" with nothing to
 * look at. This renders the trace itself. A cell that was inserted, updated
 * or run appears under its tool row in two parts, the change first (the
 * cell's source, read-only) and the outputs after, bound to the live model's
 * own output area so a run that prints as it goes streams into the
 * transcript. An `executeCode` shows only its outputs: the code was the
 * agent's means, the output is the result.
 *
 * Part of the chat rather than of any workspace: `ChatBase` turns it on for
 * a given notebook via `notebookToolSurfacesId`, and the LOOP chat sets that
 * only while no editor is on screen — with the notebook open beside the
 * chat, the change is already visible where it happened.
 *
 * @module chat/messages/NotebookToolSurfaces
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@primer/react';
import {
  Cell,
  Output,
  OutputViewer,
  notebookStore,
} from '@datalayer/jupyter-react';
import type { ICellModel, ICodeCellModel } from '@jupyterlab/cells';
import type { IOutputAreaModel } from '@jupyterlab/outputarea';
import type { ICell, IOutput } from '@jupyterlab/nbformat';
import { decode } from '@toon-format/toon';
import type { RenderToolResult, ToolCallRenderContext } from '../../types/chat';

/**
 * The notebook tools whose result is a cell worth showing, by the reference
 * names the adapter registers them under (with the raw `datalayer_` names
 * kept as aliases, since both spellings exist in the definitions).
 */
export const CELL_TOOLS = new Set([
  'insertCell',
  'updateCell',
  'runCell',
  'datalayer_insertCell',
  'datalayer_updateCell',
  'datalayer_runCell',
]);

export const EXECUTE_TOOLS = new Set(['executeCode', 'datalayer_executeCode']);

/**
 * The tool's result, as the structure it was before serialisation.
 *
 * The result the agent gets is a TOON *string* — human-readable, exactly so
 * the model can read it — and TOON round-trips: `decode` gives the operation
 * result back. A result that is already an object passes through; one that
 * decodes to nothing (an error message, free text) yields nothing rather
 * than a guess.
 */
export function decodedResult(
  context: ToolCallRenderContext,
): Record<string, unknown> | undefined {
  const result = context.result;
  if (result && typeof result === 'object') {
    return result as Record<string, unknown>;
  }
  if (typeof result === 'string') {
    try {
      const decoded = decode(result);
      if (decoded && typeof decoded === 'object') {
        return decoded as Record<string, unknown>;
      }
    } catch {
      // Not TOON. The default row already shows the raw text.
    }
  }
  return undefined;
}

/**
 * Which cell a completed tool call touched: the argument when the call named
 * one, the result when the operation chose — an insert with no index appends,
 * and only the result says where it landed.
 */
export function touchedCellIndex(
  context: ToolCallRenderContext,
): number | undefined {
  const args = context.args ?? {};
  if (typeof args.index === 'number') {
    return args.index as number;
  }
  const decoded = decodedResult(context);
  if (decoded && typeof decoded.index === 'number') {
    return decoded.index;
  }
  return undefined;
}

/**
 * The live model of the cell a tool call touched, or nothing.
 *
 * The *live* model rather than a serialised snapshot, because the outputs
 * hang off it as an `IOutputAreaModel` the output area can follow — which is
 * what makes a long-running cell stream into the transcript instead of
 * appearing all at once when it finishes.
 */
export function touchedCellModel(
  documentId: string,
  context: ToolCallRenderContext,
): ICellModel | null {
  const index = touchedCellIndex(context);
  if (index === undefined) {
    return null;
  }
  const model = notebookStore.getState().notebooks.get(documentId)?.model;
  return model?.cells?.get(index) ?? null;
}

/** Best-effort nbformat outputs from an `executeCode` result. */
export function executionOutputs(context: ToolCallRenderContext): IOutput[] {
  const result = (decodedResult(context) ?? {}) as {
    outputs?: Array<{ type?: string; content?: unknown }>;
  };
  const outputs: IOutput[] = [];
  for (const entry of result.outputs ?? []) {
    const content = entry.content;
    if (content && typeof content === 'object') {
      const record = content as Record<string, unknown>;
      if ('output_type' in record) {
        outputs.push(record as unknown as IOutput);
        continue;
      }
      if ('data' in record || 'text' in record || 'ename' in record) {
        outputs.push({
          output_type: entry.type ?? 'display_data',
          ...record,
        } as unknown as IOutput);
        continue;
      }
    }
    // A plain value: shown the way a kernel would print it.
    outputs.push({
      output_type: 'stream',
      name: 'stdout',
      text: String(content ?? ''),
    } as unknown as IOutput);
  }
  return outputs;
}

/*
 * Live models already spoken for by a finished row.
 *
 * The adapter exposes only "the last execution's outputs" — `executeCode`
 * has no cell, so there is nothing better to address one by. Tool calls run
 * one at a time, so the model an *executing* row reads is its own — unless
 * it renders in the instant before its handler starts, when the previous
 * call's model is still standing. Each completed row claims its model here,
 * and an executing row refuses a claimed one rather than replaying somebody
 * else's outputs.
 */
const claimedModels = new WeakSet<IOutputAreaModel>();

/** What the surface's caption says the tool did. */
const TOOL_VERBS: Record<string, string> = {
  insertCell: 'inserted',
  updateCell: 'updated',
  runCell: 'ran',
  executeCode: 'executed',
};

export function NotebookToolSurfaces({
  documentId,
  context,
}: {
  documentId: string;
  context: ToolCallRenderContext;
}): JSX.Element {
  const { name, status, defaultUI } = context;
  const shortName = name.replace(/^datalayer_/, '');

  /*
   * What each tool leaves on the transcript.
   *
   * The cell tools show the change in two parts, the way the A2UI Jupyter
   * Output example splits its panels: the cell's *source* first — the change
   * itself — and its outputs after, drawn from the live model's own output
   * area so a run that prints as it goes streams into the transcript rather
   * than appearing all at once. `executeCode` runs in the kernel without
   * touching any cell — the code was the agent's means, the output is the
   * result — so it shows only what came back.
   *
   * Rendered from `executing` onwards, not just on completion: with the
   * index already named in the arguments (update, run) the cell is on
   * screen while it works, which is where the streaming is worth watching.
   */
  /* This row's live execution outputs, held once found — see the claim
     registry above for how a row avoids capturing its predecessor's. */
  const liveExecution = useRef<{
    id: string | null;
    model: IOutputAreaModel | null;
  }>({ id: null, model: null });

  /*
   * The claim is a race this row loses on its first render: the executor
   * creates `lastExecuteOutputs` only once the kernel call actually starts,
   * which is *after* the transcript has drawn the row as `executing` — and a
   * long silent run gives React no reason to render again, so the model was
   * only ever claimed at completion and the whole stream painted at once.
   * While executing and unclaimed, probe on a short timer; the state bump
   * re-renders the row and the claim below picks the model up. Once bound,
   * the output area follows the model on its own.
   */
  const [, setClaimTick] = useState(0);
  useEffect(() => {
    if (!EXECUTE_TOOLS.has(name) || status !== 'executing') {
      return undefined;
    }
    if (
      liveExecution.current.id === context.toolCallId &&
      liveExecution.current.model
    ) {
      return undefined;
    }
    let cancelled = false;
    let timer: number | undefined;
    const probe = () => {
      if (cancelled) {
        return;
      }
      const candidate =
        notebookStore.getState().notebooks.get(documentId)?.adapter
          ?.lastExecuteOutputs ?? null;
      if (candidate && !claimedModels.has(candidate)) {
        setClaimTick(tick => tick + 1);
        return;
      }
      timer = window.setTimeout(probe, 250);
    };
    probe();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [name, status, context.toolCallId, documentId]);

  let cellModel: ICellModel | null = null;
  let outputs: IOutput[] | null = null;
  let liveOutputs: IOutputAreaModel | null = null;
  let index: number | undefined;
  /*
   * `error` included deliberately: an interrupted or failed run still *ran*,
   * and whatever it printed before the stop is the state worth seeing. The
   * surface used to vanish the moment a reader pressed stop — the one moment
   * they were looking straight at it.
   */
  if (status === 'executing' || status === 'complete' || status === 'error') {
    if (CELL_TOOLS.has(name)) {
      index = touchedCellIndex(context);
      cellModel = touchedCellModel(documentId, context);
    } else if (EXECUTE_TOOLS.has(name)) {
      if (liveExecution.current.id !== context.toolCallId) {
        const candidate =
          notebookStore.getState().notebooks.get(documentId)?.adapter
            ?.lastExecuteOutputs ?? null;
        if (candidate && !claimedModels.has(candidate)) {
          liveExecution.current = { id: context.toolCallId, model: candidate };
        }
      }
      liveOutputs =
        liveExecution.current.id === context.toolCallId
          ? liveExecution.current.model
          : null;
      // A finished row — completed or stopped — owns its model for good.
      if (liveOutputs && status !== 'executing') {
        claimedModels.add(liveOutputs);
      }
      if (!liveOutputs && status === 'complete') {
        // No live model to show — an older build of the adapter, or the row
        // arrived after another call replaced it. The serialised outputs are
        // still the truth, just not a stream.
        const produced = executionOutputs(context);
        outputs = produced.length > 0 ? produced : null;
      }
    }
  }
  const cellOutputsModel =
    cellModel?.type === 'code'
      ? (cellModel as ICodeCellModel).outputs
      : undefined;

  // Compose, never replace: the tool row stays, and every other tool keeps
  // its default rendering untouched.
  return (
    <>
      {defaultUI}
      {liveOutputs || outputs ? (
        /* An execution's outputs, and nothing else — see above. */
        <Box
          sx={{
            mt: 1,
            // The full column, not the content's own width: a surface sized
            // to its longest line reads as a fragment.
            width: '100%',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            overflow: 'hidden',
            bg: 'canvas.default',
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1,
              bg: 'canvas.subtle',
              borderBottom: '1px solid',
              borderColor: 'border.muted',
            }}
          >
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              Output ·{' '}
              {status === 'executing'
                ? 'executing…'
                : status === 'error'
                  ? 'stopped'
                  : 'executed'}
            </Text>
          </Box>
          <Box sx={{ p: 2 }}>
            {liveOutputs ? (
              /* The adapter's live mirror of the run: the area follows the
                 model, so each line lands here the moment the kernel prints
                 it — mounted from the first render of `executing`, before
                 anything has arrived, or there would be nothing to watch. */
              <Output
                id={`${context.toolCallId}-execute-outputs`}
                model={liveOutputs}
                showControl={false}
                showEditor={false}
                autoRun={false}
              />
            ) : (
              <OutputViewer
                cell={{ cell_type: 'code', outputs, metadata: {} } as ICell}
              />
            )}
          </Box>
        </Box>
      ) : null}
      {cellModel ? (
        /*
          Drawn as a surface, the way the A2UI example presents an execution:
          a captioned card, the change first, the outputs after.
        */
        <Box
          sx={{
            mt: 1,
            // The full column, not the content's own width: a surface sized
            // to its longest line reads as a fragment.
            width: '100%',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            overflow: 'hidden',
            bg: 'canvas.default',
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1,
              bg: 'canvas.subtle',
              borderBottom: '1px solid',
              borderColor: 'border.muted',
            }}
          >
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {index !== undefined ? `Cell ${index}` : 'Cell'}
              {' · '}
              {TOOL_VERBS[shortName] ?? shortName}
            </Text>
          </Box>
          {/* The change: the cell's source, read-only, without its outputs. */}
          <Cell
            readOnly
            type={(cellModel.type as 'code' | 'markdown' | 'raw') ?? 'code'}
            source={cellModel.sharedModel.getSource()}
            outputs={[]}
          />
          {/* The result: the live output area, which follows the model — a
              cell that prints as it goes streams here, exactly as it would
              in the notebook. Mounted while the tool is still executing even
              with nothing printed yet: the area has to be on screen *before*
              the first line for the streaming to be seen, and React will not
              re-render on the model's account. */}
          {cellOutputsModel &&
          (status === 'executing' || cellOutputsModel.length > 0) ? (
            <Box
              sx={{
                borderTop: '1px solid',
                borderColor: 'border.muted',
                p: 2,
              }}
            >
              <Output
                id={`${context.toolCallId}-outputs`}
                model={cellOutputsModel}
                showControl={false}
                showEditor={false}
                autoRun={false}
              />
            </Box>
          ) : null}
        </Box>
      ) : null}
    </>
  );
}

/**
 * The renderer `ChatBase` mounts when a host names a notebook: the default
 * row composed with this module's surfaces.
 */
export function notebookToolSurfacesRenderer(
  documentId: string,
): RenderToolResult {
  return context => (
    <NotebookToolSurfaces documentId={documentId} context={context} />
  );
}

export default NotebookToolSurfaces;
