/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Delegation, for an agent whose loop runs in the page.
 *
 * The server-side harness already has this: `subagents/capability.py`
 * contributes a `delegate_task` tool to a pydantic-ai agent, runs the named
 * subagent in a child run, and hands its final output back to the parent. This
 * is the same idea in the browser, and deliberately built the way the Vercel AI
 * SDK documents rather than reinvented:
 *
 * - a subagent is a {@link ToolLoopAgent}, the same class the parent is;
 * - the parent reaches it through an ordinary `tool()` whose `execute` calls
 *   `generate()` and returns the text;
 * - what the parent's model sees is trimmed with `toModelOutput`.
 *
 * The one thing that is ours is *which conversation the child is given*. The
 * SDK isolates by default and shows you how to pass `messages` instead; a
 * teamspec says which of those a team wants, so the choice is read from the
 * spec rather than decided here.
 *
 * One SDK constraint worth knowing: a subagent tool cannot take part in
 * approval flows. A subagent that must be approved has to be a plain tool.
 *
 * @module runtimes/browser/subagents
 */

import {
  ToolLoopAgent,
  stepCountIs,
  tool,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';

import type { AgentStreamSubagentPayload } from '../../types/stream';
import type { TeamContextSharing } from '../../types/teams';
import { createBrowserModel, type BrowserModelOptions } from './model';

/** How many turns a delegated task may take before it is stopped. */
export const DEFAULT_SUBAGENT_MAX_STEPS = 12;

/** One agent a parent may hand work to. */
export type BrowserSubagent = {
  /** The name the parent addresses it by. Becomes the tool name. */
  name: string;
  /** What it is for, and when to reach for it. Read by the parent's model. */
  description: string;
  /** Its instructions. */
  instructions?: string;
  /** Its model, as a spec spells it. Falls back to the parent's. */
  model?: string;
  /** Tools it may call in this page. Usually a narrower set than the parent's. */
  tools?: ToolSet;
  /**
   * The octicon name its spec asked for.
   *
   * Carried, not used: the harness has no interface. It is here so a menu
   * offering this subagent can draw it the same way it draws a team member,
   * rather than the two disagreeing about what the same agent looks like.
   */
  icon?: string;
};

export type SubagentToolsOptions = {
  subagents: BrowserSubagent[];
  /** Where to reach a model. */
  inference: Omit<BrowserModelOptions, 'model'>;
  /** The parent's model, for a subagent that names none. */
  model?: string;
  /**
   * What the child is told about the conversation so far.
   *
   * From the team's `context.sharing`. `shared` hands over the parent's
   * messages and appends the task; anything else starts the child on the task
   * alone — which is what the SDK does by default, and what a delegation model
   * wants.
   *
   * `own-turns` collapses to isolated here on purpose: a subagent has no turns
   * of its own to be given, so the honest reading of "only its own history" is
   * "no history".
   */
  sharing?: TeamContextSharing;
  /** Turn ceiling for one delegated task. */
  maxSteps?: number;
  /**
   * Told what a delegated run does, as it does it.
   *
   * The same events the server-side harness puts on its monitoring stream —
   * `start`, `text`, `tool_call`, `tool_result`, `end`, `error`, keyed by the
   * parent's tool call — so whatever draws a delegation's progress (the
   * side panel, the pulse in the composer) draws it the same whether the
   * loop turns on a server or in this page.
   */
  onEvent?: (event: AgentStreamSubagentPayload) => void;
  /**
   * The page's tools, for a member that declares none of its own.
   *
   * A team's members all work in the page the person has open — the Reviewer
   * re-runs the cells, Decks writes the deck — and a member reached by
   * delegation is still that member. Without this a delegated task ran with
   * no tools at all, and "ask the Reviewer to check this" came back as an
   * opinion about cells it could not run. A subagent that names a narrower
   * set of its own keeps it.
   */
  tools?: ToolSet;
  /**
   * The run's abort signal, read when a delegation starts.
   *
   * The SDK hands a tool the run's signal too, and the child listens to
   * both: a person pressing stop must stop the child as surely as the
   * parent, and a signal reached one way is as good as the other.
   */
  signal?: () => AbortSignal | undefined;
};

/** The input every delegation tool takes. */
const TASK_SCHEMA = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      description:
        'What to do, stated so that it can be carried out without the rest of this conversation.',
    },
  },
  required: ['task'],
} as const;

/**
 * The tools a parent needs in order to delegate.
 *
 * One per subagent, named after it, so the model reaches for `Compactor`
 * rather than for `delegate_task('Compactor', …)`. A name the model can read
 * is a name it picks correctly more often, and the description is what it
 * chooses on.
 */
export function subagentTools(options: SubagentToolsOptions): ToolSet {
  const {
    subagents,
    inference,
    model,
    sharing = 'shared',
    maxSteps = DEFAULT_SUBAGENT_MAX_STEPS,
    tools: shared,
    onEvent,
    signal: runSignal,
  } = options;

  const tools: ToolSet = {};

  for (const subagent of subagents) {
    tools[subagent.name] = tool({
      description: subagent.description,
      inputSchema: jsonSchema(TASK_SCHEMA as never),
      execute: async (input, executionOptions) => {
        const { task } = (input ?? {}) as { task?: string };
        if (!task?.trim()) {
          return { error: 'A delegated task needs to say what to do.' };
        }
        // Keyed by the parent's tool call, as the server keys its events:
        // one delegation, one timeline, whichever side ran it. A run ends
        // once: a stream that reports an error and then rejects would
        // otherwise say so twice.
        const toolCallId = executionOptions?.toolCallId ?? null;
        let ended = false;
        const emit = (
          event: Omit<
            AgentStreamSubagentPayload,
            'subagentName' | 'toolCallId'
          >,
        ) => {
          if (event.phase === 'end' || event.phase === 'error') {
            if (ended) {
              return;
            }
            ended = true;
          }
          onEvent?.({ subagentName: subagent.name, toolCallId, ...event });
        };

        const child = new ToolLoopAgent({
          id: subagent.name,
          model: createBrowserModel({
            ...inference,
            model: subagent.model ?? model,
          }) as LanguageModel,
          instructions: subagent.instructions,
          tools: subagent.tools ?? shared ?? {},
          stopWhen: stepCountIs(maxSteps),
        });

        // Stopped when either the run or this tool call is: the two signals

        // are one to the child.

        const signal = anySignal([
          executionOptions?.abortSignal,

          runSignal?.(),
        ]);

        emit({ phase: 'start', task });
        try {
          // `messages` for a shared conversation, `prompt` for an isolated
          // one — the same two shapes the SDK documents, chosen by the team.
          const history =
            sharing === 'shared'
              ? ((executionOptions?.messages ?? []) as ModelMessage[])
              : [];
          // Streamed rather than generated, so the run can be watched: each
          // part becomes an event as it arrives, and the text is what the
          // parent is handed at the end.
          const result = await child.stream({
            messages: [...history, { role: 'user' as const, content: task }],
            abortSignal: signal,
          });
          const streamed = await relaySubagentRun(
            result.fullStream,
            emit,
            signal,
          );
          if (signal?.aborted) {
            emit({ phase: 'error', error: STOPPED });
            return { agent: subagent.name, error: STOPPED };
          }
          const output = streamed || (await result.text);
          emit({ phase: 'end', output });
          return { agent: subagent.name, result: output };
        } catch (reason) {
          // Returned rather than thrown: a failed delegation is a step the
          // parent can recover from — try another member, or tell the person
          // — and a throw would abort the whole run instead.
          // A stop is said as a stop, not as whatever the aborted fetch threw.
          const error = signal?.aborted
            ? STOPPED
            : reason instanceof Error
              ? reason.message
              : String(reason);
          emit({ phase: 'error', error });
          return { agent: subagent.name, error };
        }
      },
      // What the parent's model reads. The person can see the whole delegated
      // run in the transcript; the parent only needs its conclusion, and
      // paying for the rest in context is how a delegation model runs out of
      // room three hand-offs in.
      toModelOutput: ({ output }) => {
        const value = output as { result?: string; error?: string };
        return {
          type: 'text',
          value: value?.error
            ? `${subagent.name} could not finish: ${value.error}`
            : (value?.result ?? 'Done.'),
        };
      },
    });
  }

  return tools;
}

/** What a delegation says when the person stopped it. */
export const STOPPED = 'Stopped.';

/** One signal for several, or the one there is. */
function anySignal(
  signals: (AbortSignal | undefined)[],
): AbortSignal | undefined {
  const present = signals.filter((entry): entry is AbortSignal =>
    Boolean(entry),
  );
  if (present.length <= 1) {
    return present[0];
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(present);
  }
  // Older runtimes: a controller that follows whichever fires first.
  const controller = new AbortController();
  for (const entry of present) {
    if (entry.aborted) {
      controller.abort(entry.reason);
      break;
    }
    entry.addEventListener('abort', () => controller.abort(entry.reason), {
      once: true,
    });
  }
  return controller.signal;
}

/** The parts of a streamed run this relays; the SDK's stream has more, which pass. */
export type SubagentStreamPart = {
  type: string;
  text?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
};

/** A tool's result as a line the timeline can show. */
function preview(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/**
 * Turn a delegated run's stream into subagent events, and return its text.
 *
 * Text and reasoning deltas, tool calls and their results, and errors — the
 * phases the server-side harness reports — each emitted as the part arrives.
 * Everything else the SDK streams (step and finish markers, sources, files)
 * is not a phase and passes in silence.
 */
export async function relaySubagentRun(
  stream: AsyncIterable<SubagentStreamPart>,
  emit: (
    event: Omit<AgentStreamSubagentPayload, 'subagentName' | 'toolCallId'>,
  ) => void,
  signal?: AbortSignal,
): Promise<string> {
  let text = '';
  for await (const part of stream) {
    // Stopped: whatever is still in the pipe is not worth relaying.
    if (signal?.aborted) {
      break;
    }
    switch (part.type) {
      case 'text-delta':
        text += part.text ?? '';
        emit({ phase: 'text', text: part.text ?? '' });
        break;
      case 'reasoning-delta':
        emit({ phase: 'thinking', text: part.text ?? '' });
        break;
      case 'tool-call':
        emit({
          phase: 'tool_call',
          toolName: part.toolName,
          toolArgs: (part.input ?? {}) as Record<string, unknown>,
        });
        break;
      case 'tool-result':
        emit({
          phase: 'tool_result',
          toolName: part.toolName,
          result: preview(part.output),
        });
        break;
      case 'tool-error':
        emit({
          phase: 'tool_result',
          toolName: part.toolName,
          result: preview(part.error),
        });
        break;
      case 'error':
        emit({
          phase: 'error',
          error:
            part.error instanceof Error
              ? part.error.message
              : String(part.error),
        });
        break;
      default:
        break;
    }
  }
  return text;
}
