/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Ask a decision* in the floating assistant's balloon: the request it sends
 * to the runtime's `/api/v1/configure/inference/decisions`, and the answer's
 * words. The runtime is faked as it is written (`ask_decisions` →
 * `decide`): the route's body is turned into ai-inference's request, checked
 * against the shape ai-inference's README gives, and answered with the
 * answers that README shows, as the runtime passes them back.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { AssistantStage } from '../assistant/AssistantStage';
import { DECISION_WORDS } from '../assistant/DecisionAsk';
import {
  decisionAnswerWords,
  decisionsAskerAt,
  type DecisionAnswer,
  type DecisionsRequestBody,
} from '../assistant/decisions';

const SERVER = 'http://localhost:8765';
const ROUTE = `${SERVER}/api/v1/configure/inference/decisions`;

/** ai-inference's `POST /decisions` body, as `decide` builds it. */
function inferenceRequestOf(body: DecisionsRequestBody) {
  return {
    model: 'cloudflare:wrk/typesafe/jev',
    state: body.state,
    questions: Object.fromEntries(
      body.questions.map(question => [
        question.name,
        {
          type: question.type,
          instructions: question.instructions,
          ...(question.type === 'choice'
            ? {
                criteria: Object.fromEntries(
                  question.options.map(option => [option, option]),
                ),
              }
            : question.type === 'score'
              ? { criteria: [...question.options] }
              : {}),
        },
      ]),
    ),
  };
}

/** What Jev answers, by type, in ai-inference's README shapes. */
function inferenceAnswerOf(
  name: string,
  question: ReturnType<typeof inferenceRequestOf>['questions'][string],
): DecisionAnswer {
  if (question.type === 'noul') {
    return { type: 'noul', probability: 0.87 };
  }
  if (question.type === 'choice') {
    const options = Object.keys(
      (question as { criteria: Record<string, string> }).criteria,
    );
    return {
      type: 'choice',
      choice: options[0],
      confidence: 0.94,
      probabilities: Object.fromEntries(
        options.map((option, index) => [option, index === 0 ? 0.94 : 0.03]),
      ),
    };
  }
  const steps = (question as { criteria: string[] }).criteria;
  return {
    type: 'score',
    score: 3,
    confidence: 0.5,
    probabilities: Object.fromEntries(
      steps.map((_, index) => [String(index), index === 3 ? 0.5 : 0.125]),
    ),
    legend: Object.fromEntries(
      steps.map((step, index) => [String(index), step]),
    ),
  };
}

let sent: { url: string; init: RequestInit }[] = [];
let inference: ReturnType<typeof inferenceRequestOf>[] = [];
let refuse: string | undefined;

beforeEach(() => {
  sent = [];
  inference = [];
  refuse = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      const body = JSON.parse(String(init.body)) as DecisionsRequestBody;
      if (refuse) {
        return new Response(JSON.stringify({ refusal: refuse }), {
          status: 200,
        });
      }
      const asked = inferenceRequestOf(body);
      inference.push(asked);
      // ai-inference answers `{success, provider, model, answers, usage}`;
      // the route passes back `model` and `answers`.
      const answers = Object.fromEntries(
        Object.entries(asked.questions).map(([name, question]) => [
          name,
          inferenceAnswerOf(name, question),
        ]),
      );
      return new Response(JSON.stringify({ model: asked.model, answers }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render(withDecisions = true, insist = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <AssistantStage
          character="paperclip"
          state="idle"
          place={{ left: 10, top: 300 }}
          stageRef={createRef<HTMLDivElement>()}
          onDragStart={() => {}}
          open={false}
          onToggle={() => {}}
          onDismiss={() => {}}
          balloon={{ text: 'Click me to open the conversation.' }}
          insist={insist}
          decide={withDecisions ? decisionsAskerAt(SERVER) : undefined}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
  return container;
}

const field = (container: HTMLElement, name: string) =>
  container.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(`[name="${name}"]`)!;

/** Types into a field as a person does: React hears the input event. */
async function fill(container: HTMLElement, name: string, value: string) {
  const element = field(container, name);
  const prototype = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(
      new Event(element.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}

function buttonNamed(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    button => button.textContent?.trim() === label,
  )!;
}

async function openTheForm(container: HTMLElement) {
  const link = container.querySelector<HTMLElement>(
    '[data-balloon-ask-decision]',
  );
  expect(link?.textContent).toBe(DECISION_WORDS.ask);
  await act(async () => link!.click());
}

async function ask(container: HTMLElement) {
  await act(async () => buttonNamed(container, DECISION_WORDS.submit).click());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

const answerOf = (container: HTMLElement) =>
  container.querySelector('[data-decision-answer]')?.textContent;

const bodyOf = (index = 0) =>
  JSON.parse(String(sent[index].init.body)) as DecisionsRequestBody;

describe('Ask a decision, in the floating assistant’s balloon', () => {
  it('is not offered where no runtime is given to ask', async () => {
    const container = await render(false);
    expect(container.querySelector('[data-speech-balloon]')).not.toBeNull();
    expect(container.querySelector('[data-balloon-ask-decision]')).toBeNull();
  });

  it('asks a yes or no through the runtime route, and says it with its probability', async () => {
    // Shown on hover only: the form, then its answer, keep it up.
    const container = await render(true, false);
    const stage = container.querySelector('[data-assistant-state]')!;
    const pointer = async (type: 'mouseover' | 'mouseout') =>
      act(async () => {
        stage.dispatchEvent(
          new MouseEvent(type, { bubbles: true, relatedTarget: document.body }),
        );
      });
    expect(container.querySelector('[data-speech-balloon]')).toBeNull();
    await pointer('mouseover');
    await openTheForm(container);
    await pointer('mouseout');
    expect(container.querySelector('[data-balloon-decision]')).not.toBeNull();
    await fill(
      container,
      'situation',
      'Help! My payouts have been failing for 3 days.',
    );
    await fill(container, 'question', 'Does this convey urgency?');
    await fill(container, 'name', 'Urgent');
    await ask(container);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(ROUTE);
    expect(sent[0].init.method).toBe('POST');
    expect(bodyOf()).toEqual({
      state: 'Help! My payouts have been failing for 3 days.',
      questions: [
        {
          name: 'Urgent',
          type: 'noul',
          instructions: 'Does this convey urgency?',
          options: [],
        },
      ],
    });
    // What the runtime asks ai-inference: the README's request.
    expect(inference[0].questions).toEqual({
      Urgent: { type: 'noul', instructions: 'Does this convey urgency?' },
    });
    expect(answerOf(container)).toBe('Urgent: yes (0.87)');
    // The balloon stays with its answer, the pointer gone, until it is
    // put away.
    expect(answerOf(container)).toBe('Urgent: yes (0.87)');
    await act(async () =>
      buttonNamed(container, DECISION_WORDS.cancel).click(),
    );
    expect(container.querySelector('[data-speech-balloon]')).toBeNull();
  });

  it('asks a choice among the options listed, and says the one chosen', async () => {
    const container = await render();
    await openTheForm(container);
    await fill(container, 'situation', 'I was charged twice this month.');
    await fill(container, 'question', 'Which team takes it?');
    await fill(container, 'name', 'Team');
    await fill(container, 'type', 'choice');
    await fill(container, 'options', 'Billing\nTech\n\nSales');
    await ask(container);

    expect(bodyOf().questions).toEqual([
      {
        name: 'Team',
        type: 'choice',
        instructions: 'Which team takes it?',
        options: ['Billing', 'Tech', 'Sales'],
      },
    ]);
    expect(inference[0].questions.Team).toEqual({
      type: 'choice',
      instructions: 'Which team takes it?',
      criteria: { Billing: 'Billing', Tech: 'Tech', Sales: 'Sales' },
    });
    expect(answerOf(container)).toBe('Team: Billing (0.94)');
  });

  it('asks a score on its range, lowest first, and says the step of the range', async () => {
    const container = await render();
    await openTheForm(container);
    await fill(
      container,
      'situation',
      'Setup took an hour, but support answered fast and it works.',
    );
    await fill(container, 'question', 'How positive is this review?');
    await fill(container, 'name', 'Score');
    await fill(container, 'type', 'score');
    await ask(container);

    expect(bodyOf().questions[0]).toEqual({
      name: 'Score',
      type: 'score',
      instructions: 'How positive is this review?',
      options: ['1', '2', '3', '4', '5'],
    });
    expect(inference[0].questions.Score).toEqual({
      type: 'score',
      instructions: 'How positive is this review?',
      criteria: ['1', '2', '3', '4', '5'],
    });
    expect(answerOf(container)).toBe('Score: 4 of 5 (0.5)');
  });

  it('says why nothing was decided, in the runtime’s sentence', async () => {
    refuse =
      'Nothing was decided: no ai-inference is configured (DATALAYER_AI_INFERENCE_URL is unset).';
    const container = await render();
    await openTheForm(container);
    await fill(container, 'situation', 'Payouts failing.');
    await fill(container, 'question', 'Is it urgent?');
    await ask(container);
    expect(bodyOf().questions[0].name).toBe('Answer');
    expect(answerOf(container)).toBe(refuse);
  });

  it('refuses a choice of fewer than two options before asking anything', async () => {
    const container = await render();
    await openTheForm(container);
    await fill(container, 'situation', 'I was charged twice.');
    await fill(container, 'question', 'Which team?');
    await fill(container, 'type', 'choice');
    await fill(container, 'options', 'Billing');
    await ask(container);
    expect(sent).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'A choice needs at least two options.',
    );
  });
});

describe('a decision’s words', () => {
  it('says a no with the probability that the statement does not hold', () => {
    expect(
      decisionAnswerWords('Urgent', { type: 'noul', probability: 0.13 }),
    ).toBe('Urgent: no (0.87)');
  });

  it('says a score by its rubric’s step when the steps are words', () => {
    expect(
      decisionAnswerWords(
        'Severity',
        {
          type: 'score',
          score: 2,
          confidence: 0.7,
          legend: { '0': 'cosmetic', '1': 'degraded', '2': 'blocking' },
        },
        ['cosmetic', 'degraded', 'blocking'],
      ),
    ).toBe('Severity: blocking (0.7)');
  });

  it('asks with the person’s token when the runtime needs one', async () => {
    await decisionsAskerAt(
      `${SERVER}/`,
      'a-token',
    )({
      state: 'x',
      questions: [
        { name: 'A', type: 'noul', instructions: 'Does it hold?', options: [] },
      ],
    });
    expect(sent[0].url).toBe(ROUTE);
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer a-token',
    );
  });
});
