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

        const child = new ToolLoopAgent({
          id: subagent.name,
          model: createBrowserModel({
            ...inference,
            model: subagent.model ?? model,
          }) as LanguageModel,
          instructions: subagent.instructions,
          tools: subagent.tools ?? {},
          stopWhen: stepCountIs(maxSteps),
        });

        try {
          // `messages` for a shared conversation, `prompt` for an isolated
          // one — the same two shapes the SDK documents, chosen by the team.
          const history =
            sharing === 'shared'
              ? ((executionOptions?.messages ?? []) as ModelMessage[])
              : [];
          const result = await child.generate({
            messages: [...history, { role: 'user' as const, content: task }],
            abortSignal: executionOptions?.abortSignal,
          });
          return { agent: subagent.name, result: result.text };
        } catch (reason) {
          // Returned rather than thrown: a failed delegation is a step the
          // parent can recover from — try another member, or tell the person
          // — and a throw would abort the whole run instead.
          return {
            agent: subagent.name,
            error: reason instanceof Error ? reason.message : String(reason),
          };
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
