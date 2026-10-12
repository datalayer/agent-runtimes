/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A step of an application's code, shown in the conversation as it runs
 * (LOOP P-16): the chain of thought.
 *
 * AG-UI's `STEP_STARTED` and `STEP_FINISHED` carry a step's name only; the
 * session API shows the step whole beside them as a `reactor.ui` display of
 * type `application/vnd.datalayer.loop.step+json` (REACTOR_UI RU-3) — its
 * data `{name, kind, parent_id, input, output, error, started_at,
 * ended_at}`, its id the step's — shown as it starts and again as it ends,
 * its output patched in as it streams (LOOP P-31). A step is drawn as the
 * chat draws a tool call: one row, collapsed, its input and output inside,
 * running until it ends; a nested step says the step it is in.
 */

import type { Display } from '@datalayer/reactor/ui';
import type { DisplayItem, ToolCallMessage } from '../../types/chat';

/** The display type of a step. */
export const STEP_DISPLAY_TYPE = 'application/vnd.datalayer.loop.step+json';

/** A step, as its display says it. */
export type LoopStep = {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  input: unknown;
  output: unknown;
  error: string;
  ended: boolean;
};

/** Whether a display is a step's. */
export const isStepDisplay = (display: Display): boolean =>
  display.type === STEP_DISPLAY_TYPE;

/** The step a step's display says. Throws for one that is not a step's. */
export function stepOfDisplay(display: Display): LoopStep {
  const data = display.data ?? {};
  if (!isStepDisplay(display) || typeof data.name !== 'string') {
    throw new Error(`Display ${display.id} is not a step`);
  }
  return {
    id: display.id,
    name: data.name,
    kind: typeof data.kind === 'string' ? data.kind : 'run',
    parentId:
      typeof data.parent_id === 'string' && data.parent_id
        ? data.parent_id
        : null,
    input: data.input ?? null,
    output: data.output ?? null,
    error: typeof data.error === 'string' ? data.error : '',
    ended: typeof data.ended_at === 'string' && data.ended_at !== '',
  };
}

/** The id of the row a step is drawn as. */
export const stepCallId = (id: string): string => `step-${id}`;

/** A step as the row the chat draws a tool call as. */
export function stepItem(step: LoopStep, inside?: string): ToolCallMessage {
  const callId = stepCallId(step.id);
  const kind = `${step.kind} step`;
  return {
    id: callId,
    type: 'tool-call',
    toolCallId: callId,
    toolName: step.name,
    args: {
      kind: step.kind,
      ...(step.input !== null ? { input: step.input } : {}),
    },
    // Running, what it wrote so far — a step that streams (LOOP P-31).
    ...(!step.error && step.output !== null ? { result: step.output } : {}),
    status: !step.ended ? 'executing' : step.error ? 'error' : 'complete',
    ...(step.error ? { error: step.error } : {}),
    summary: inside ? `${kind}, inside ${inside}` : kind,
  };
}

/**
 * The conversation with the step drawn: its row changed in place when it is
 * there (a step ending), else added after the rest.
 */
export function withLoopStep(
  items: DisplayItem[],
  step: LoopStep,
): DisplayItem[] {
  const parent = step.parentId
    ? items.find(
        item =>
          'toolCallId' in item &&
          item.toolCallId === stepCallId(step.parentId as string),
      )
    : undefined;
  const row = stepItem(
    step,
    parent && 'toolName' in parent ? parent.toolName : undefined,
  );
  let found = false;
  const changed = items.map(item => {
    if ('toolCallId' in item && item.toolCallId === row.toolCallId) {
      found = true;
      return row;
    }
    return item;
  });
  return found ? changed : [...items, row];
}
