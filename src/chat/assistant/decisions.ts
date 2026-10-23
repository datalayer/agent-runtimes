/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A decision asked from the floating assistant's balloon: a situation, a
 * question about it and its type — yes or no, a choice among options, a score
 * on a range — asked of Jev, the typed-decision model, through the runtime's
 * `POST /api/v1/configure/inference/decisions`: the route that asks as the
 * `decide` tool does, with the token the runtime calls its models with.
 *
 * The answer comes back in plain words with its confidence: "Urgent: yes
 * (0.87)", "Team: Billing (0.94)", "Score: 4 of 5 (0.5)".
 *
 * @module chat/assistant/decisions
 */

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

/** The balloon's asker: a request in, the route's answer out. */
export type DecisionAsker = (
  body: DecisionsRequestBody,
) => Promise<DecisionsResponseBody>;

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
 * with the person's token when there is one. A refusal of the route itself
 * comes back as a sentence, never a throw.
 */
export function decisionsAskerAt(
  serverUrl: string,
  token?: string,
): DecisionAsker {
  const base = serverUrl.replace(/\/+$/, '');
  return async body => {
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
}
