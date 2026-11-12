/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A decision asked from the floating assistant's balloon: a situation, a
 * question about it and its type — yes or no, a choice among options, a score
 * on a range — asked of the agent's decision model through the runtime's
 * `POST /api/v1/configure/inference/decisions`: the route that asks as the
 * `decide` tool does, with the token the runtime calls its models with.
 *
 * Not every agent decides: only one whose agentspec names a decisions spec
 * (`decisions: jev:0.0.1`). The runtime says it of each agent
 * (`agentDecisionsAt`), and *Ask a decision* is offered only then, saying
 * which model decides.
 *
 * The answer comes back in plain words with its confidence: "Urgent: yes
 * (0.87)", "Team: Billing (0.94)", "Score: 4 of 5 (0.5)".
 *
 * @module chat/assistant/decisions
 */

import type { AgentDecisions } from '../../types/decisions';

/** The three types of a question, as ai-inference names them. */
export type DecisionType = 'noul' | 'choice' | 'score';

/** What the balloon's form asks. */
export interface DecisionAsk {
  /** The text the question is about: a ticket, a message, a review. */
  situation: string;
  /** The question: a statement (yes or no) or a question (choice, score). */
  question: string;
  /** Its type. */
  type: DecisionType;
  /** A short name the answer is said under ("Urgent", "Team"). */
  name?: string;
  /** A choice's options, at least two. */
  options?: string[];
  /** A score's range, lowest first: from 1 to 5 by default. */
  range?: { from: number; to: number };
}

/** One question as the runtime's route takes it (`DecisionQuestion`). */
export interface DecisionQuestionBody {
  name: string;
  type: DecisionType;
  instructions: string;
  options: string[];
}

/** The body of `POST /configure/inference/decisions`. */
export interface DecisionsRequestBody {
  state: string;
  questions: DecisionQuestionBody[];
  /** The agent asking: its spec says whether it decides, and with which model. */
  agent_id?: string;
}

/** One typed answer, as ai-inference gives it. */
export interface DecisionAnswer {
  type?: DecisionType;
  /** noul: the probability that the statement holds. */
  probability?: number;
  /** choice: the option chosen. */
  choice?: string;
  /** score: the step, from 0. */
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  /** score: each step's label, by its index. */
  legend?: Record<string, string>;
}

/** What the route answers: the answers by name, or why nothing was decided. */
export interface DecisionsResponseBody {
  model?: string;
  answers?: Record<string, DecisionAnswer>;
  refusal?: string;
}

/**
 * The balloon's asker: a request in, the route's answer out. It carries the
 * decisions of the agent it asks for, when the runtime said them: the form
 * says which model decides and offers the question types it answers.
 */
export type DecisionAsker = ((
  body: DecisionsRequestBody,
) => Promise<DecisionsResponseBody>) & { decisions?: AgentDecisions };

/** Where decisions are asked: a runtime, the token to ask with, the agent asking. */
export interface DecisionsTarget {
  serverUrl: string;
  token?: string;
  /** The agent asking; unsaid, the runtime's only agent. */
  agentId?: string;
}

/** Who decides, in a line: "Jev (cloudflare:wrk/typesafe/jev)". */
export function decidedByWords(decisions: AgentDecisions): string {
  return `${decisions.name} (${decisions.model})`;
}

/** What a runtime says of an agent's decisions (`decisions` of its agent route), read. */
function readAgentDecisions(said: unknown): AgentDecisions | null {
  if (!said || typeof said !== 'object') {
    return null;
  }
  const row = said as Record<string, unknown>;
  return {
    spec: String(row.spec),
    name: String(row.name),
    model: String(row.model),
    modelName: String(row.model_name ?? row.model),
    questions: (Array.isArray(row.questions)
      ? row.questions
      : []) as DecisionType[],
    maxQuestions: Number(row.max_questions),
    maxTextLength: Number(row.max_text_length),
  };
}

/**
 * Whether an agent of a runtime decides, and with which model: the
 * `decisions` of `GET {serverUrl}/api/v1/agents/{agentId}` — of the runtime's
 * only agent when none is named. `null`: its spec names no decisions, it
 * does not decide. `undefined`: the runtime could not be read, or does not
 * say (it is older).
 */
export async function agentDecisionsAt(
  target: DecisionsTarget,
): Promise<AgentDecisions | null | undefined> {
  const base = target.serverUrl.replace(/\/+$/, '');
  const headers = target.token
    ? { Authorization: `Bearer ${target.token}` }
    : undefined;
  try {
    const response = await fetch(
      target.agentId
        ? `${base}/api/v1/agents/${encodeURIComponent(target.agentId)}`
        : `${base}/api/v1/agents`,
      { headers },
    );
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as Record<string, unknown>;
    const agents = body.agents as Record<string, unknown>[] | undefined;
    const agent = target.agentId
      ? body
      : agents?.length === 1
        ? agents[0]
        : undefined;
    if (!agent || !('decisions' in agent)) {
      return undefined;
    }
    return readAgentDecisions(agent.decisions);
  } catch {
    return undefined;
  }
}

/** The name an answer is said under when the form gave none. */
export const DEFAULT_DECISION_NAME = 'Answer';

/** The default range of a score. */
export const DEFAULT_SCORE_RANGE = { from: 1, to: 5 } as const;

/** The longest range a score may have, in steps. */
const MAX_SCORE_STEPS = 11;

/** The steps of a score's range, lowest first: `1..5` is `["1", …, "5"]`. */
export function scoreSteps(range: { from: number; to: number }): string[] {
  const steps: string[] = [];
  for (let step = range.from; step <= range.to; step += 1) {
    steps.push(String(step));
  }
  return steps;
}

/**
 * Why the form cannot be asked as it is, in a sentence, or `undefined`.
 */
export function decisionAskProblem(ask: DecisionAsk): string | undefined {
  if (!ask.situation.trim()) {
    return 'Say the situation the question is about.';
  }
  if (!ask.question.trim()) {
    return 'Ask a question.';
  }
  if (ask.type === 'choice') {
    const options = (ask.options ?? []).filter(option => option.trim());
    if (options.length < 2) {
      return 'A choice needs at least two options.';
    }
    if (new Set(options.map(option => option.trim())).size !== options.length) {
      return 'Two options are the same.';
    }
  }
  if (ask.type === 'score') {
    const range = ask.range ?? DEFAULT_SCORE_RANGE;
    if (!Number.isInteger(range.from) || !Number.isInteger(range.to)) {
      return 'A score goes from a whole number to another.';
    }
    if (range.to <= range.from) {
      return 'A score goes from a lower number to a higher one.';
    }
    if (range.to - range.from + 1 > MAX_SCORE_STEPS) {
      return `A score has at most ${MAX_SCORE_STEPS} steps.`;
    }
  }
  return undefined;
}

/** The form's ask as the runtime's route takes it: one named question. */
export function decisionRequest(ask: DecisionAsk): DecisionsRequestBody {
  const options =
    ask.type === 'choice'
      ? (ask.options ?? []).map(option => option.trim()).filter(Boolean)
      : ask.type === 'score'
        ? scoreSteps(ask.range ?? DEFAULT_SCORE_RANGE)
        : [];
  return {
    state: ask.situation.trim(),
    questions: [
      {
        name: ask.name?.trim() || DEFAULT_DECISION_NAME,
        type: ask.type,
        instructions: ask.question.trim(),
        options,
      },
    ],
  };
}

/** A probability or a confidence as said: two places at most, `0.5`, `0.87`. */
export function confidenceWords(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * One answer in plain words with its confidence: "Urgent: yes (0.87)" — a
 * no is said with the probability that it does not hold — "Team: Billing
 * (0.94)", "Score: 4 of 5 (0.5)" — a rubric of words by its step,
 * "Severity: blocking (0.7)".
 */
export function decisionAnswerWords(
  name: string,
  answer: DecisionAnswer,
  options: readonly string[] = [],
): string {
  if (typeof answer.probability === 'number' && answer.choice === undefined) {
    const holds = answer.probability >= 0.5;
    return `${name}: ${holds ? 'yes' : 'no'} (${confidenceWords(
      holds ? answer.probability : 1 - answer.probability,
    )})`;
  }
  const confidence =
    typeof answer.confidence === 'number'
      ? ` (${confidenceWords(answer.confidence)})`
      : '';
  if (typeof answer.score === 'number') {
    const steps = options.length
      ? options
      : Object.keys(answer.legend ?? {})
          .sort((a, b) => Number(a) - Number(b))
          .map(key => answer.legend?.[key] ?? key);
    const said = answer.legend?.[String(answer.score)] ?? steps[answer.score];
    const last = steps[steps.length - 1];
    // A range of numbers says where on it ("4 of 5"); a rubric of words says
    // its step ("blocking").
    const numeric =
      steps.length > 0 && steps.every(step => /^-?\d+$/.test(step.trim()));
    return `${name}: ${said ?? answer.score + 1}${
      numeric && last !== undefined ? ` of ${last}` : ''
    }${confidence}`;
  }
  if (typeof answer.choice === 'string') {
    return `${name}: ${answer.choice}${confidence}`;
  }
  return `${name}: no answer`;
}

/**
 * What the route answered, in the balloon's words: the one answer, or the
 * sentence saying why nothing was decided.
 */
export function decisionResponseWords(
  request: DecisionsRequestBody,
  response: DecisionsResponseBody,
): string {
  if (response.refusal) {
    return response.refusal;
  }
  const [question] = request.questions;
  const answer = response.answers?.[question.name];
  if (!answer) {
    return 'Nothing was decided: the answer did not come back.';
  }
  return decisionAnswerWords(question.name, answer, question.options);
}

/**
 * Ask at a runtime: `POST {serverUrl}/api/v1/configure/inference/decisions`,
 * with the person's token when there is one, for the agent named (`agentId`;
 * the runtime's only agent when unsaid). A refusal of the route itself comes
 * back as a sentence, never a throw. `decisions` is what the runtime said of
 * that agent's decisions, carried for the form.
 */
export function decisionsAskerAt(
  serverUrl: string,
  token?: string,
  agentId?: string,
  decisions?: AgentDecisions,
): DecisionAsker {
  const base = serverUrl.replace(/\/+$/, '');
  const ask: DecisionAsker = async asked => {
    const body = agentId ? { ...asked, agent_id: agentId } : asked;
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1/configure/inference/decisions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      return {
        refusal: 'Nothing was decided: the runtime could not be reached.',
      };
    }
    if (!response.ok) {
      let detail = '';
      try {
        const said = (await response.json()) as { detail?: unknown };
        detail = typeof said.detail === 'string' ? said.detail : '';
      } catch {
        // No body worth saying.
      }
      return {
        refusal: `Nothing was decided: the runtime refused it (${response.status})${
          detail ? `: ${detail}` : '.'
        }`,
      };
    }
    return (await response.json()) as DecisionsResponseBody;
  };
  ask.decisions = decisions;
  return ask;
}
