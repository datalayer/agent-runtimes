/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A step of an application's code, shown in the conversation as it runs
 * (LOOP P-16): the chain of thought.
 *
 * AG-UI's `STEP_STARTED` and `STEP_FINISHED` carry a step's name only; the
 * session API says the step whole beside them, with a `CUSTOM` event named
 * `loop.step` — `{id, name, kind, parent_id, input, output, error,
 * started_at, ended_at}` — which the AG-UI adapter hands on as an
 * `activity`. A step is drawn as the chat draws a tool call: one row,
 * collapsed, its input and output inside, running until it ends; a nested
 * step says the step it is in.
 */

import type { DisplayItem, ToolCallMessage } from '../../types/chat';

/** The `CUSTOM` event's name. */
export const LOOP_STEP = 'loop.step';

/** A step, as the event says it. */
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

/** The step an activity says, or `null` when it says none. */
export function loopStepOf(
  activity: { type: string; data: unknown } | undefined,
): LoopStep | null {
  if (!activity || activity.type !== LOOP_STEP) return null;
  const data = activity.data as Record<string, unknown> | null;
  if (
    !data ||
    typeof data.id !== 'string' ||
    !data.id ||
    typeof data.name !== 'string'
  ) {
    return null;
  }
  return {
    id: data.id,
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
    ...(step.ended && !step.error && step.output !== null
      ? { result: step.output }
      : {}),
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
