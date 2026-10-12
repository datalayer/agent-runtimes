/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's code asks, drawn from its display (REACTOR_UI
 * RU-4): `application/vnd.datalayer.loop.question+json`, shown under the
 * message that asks it in words. A choice is its buttons — a rule's prompt
 * is Allow and Refuse — the words a field, a form its fields; each press of
 * it is `reactor.answer`, through the display's `act`, which the chat sends
 * up the conversation's ui socket. A file is chosen here, uploaded first
 * through the display's `upload`, and its ref is the answer (RU-6): its
 * bytes never ride in the press. Answered, it says what answered it, and
 * offers nothing.
 *
 * @module apps/plugins/app-elements/QuestionView
 */

import type { JSX } from 'react';
import { lazy, Suspense, useState } from 'react';
import { Box, Button, Text, TextInput } from '@primer/react';
import { ANSWER_ACTION, type Display } from '@datalayer/reactor/ui';
import type { RendererProps } from '@datalayer/reactor/ui/react';

/** The display type of what an application's code asks (`QuestionShown`). */
export const QUESTION_DISPLAY_TYPE =
  'application/vnd.datalayer.loop.question+json';

const SchemaForm = lazy(
  () => import('../../../components/a2ui/datalayer/SchemaForm'),
);

/** A question as its display says it. Throws for a display that is not one. */
export function questionOf(display: Display): {
  kind: 'text' | 'choice' | 'file' | 'form';
  prompt: string;
  options: string[];
  accept: string[];
  form: Record<string, unknown>;
  answered: string | null;
  answerable: boolean;
} {
  const data = display.data ?? {};
  const kind = data.kind;
  if (
    display.type !== QUESTION_DISPLAY_TYPE ||
    (kind !== 'text' &&
      kind !== 'choice' &&
      kind !== 'file' &&
      kind !== 'form') ||
    typeof data.prompt !== 'string'
  ) {
    throw new Error(`Display ${display.id} is not a question`);
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  return {
    kind,
    prompt: data.prompt,
    options: strings(data.options),
    accept: strings(data.accept),
    form:
      data.form && typeof data.form === 'object'
        ? (data.form as Record<string, unknown>)
        : {},
    answered: typeof data.answered === 'string' ? data.answered : null,
    answerable: (display.actions ?? []).some(
      offer => offer.name === ANSWER_ACTION,
    ),
  };
}

export function QuestionView({
  display,
  act,
  upload,
}: RendererProps): JSX.Element {
  const question = questionOf(display);
  const [words, setWords] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const answer = (value: unknown): void => {
    if (!act) {
      setSaid('The chat cannot take an answer here.');
      return;
    }
    setSaid(null);
    void Promise.resolve(
      act({ action: ANSWER_ACTION, payload: { value } }),
    ).catch((failure: unknown) =>
      setSaid(failure instanceof Error ? failure.message : String(failure)),
    );
  };
  if (question.answered !== null) {
    return (
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}>
        Answered: {question.answered}
      </Text>
    );
  }
  const live = question.answerable && !!act;
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={2}
      data-question-kind={question.kind}
    >
      {question.kind === 'choice' ? (
        <Box display="flex" gap={2} flexWrap="wrap">
          {question.options.map(option => (
            <Button
              key={option}
              size="small"
              disabled={!live}
              onClick={() => answer(option)}
            >
              {option}
            </Button>
          ))}
        </Box>
      ) : null}
      {question.kind === 'text' ? (
        <Box
          as="form"
          display="flex"
          gap={2}
          onSubmit={(event: { preventDefault: () => void }) => {
            event.preventDefault();
            if (words.trim()) answer(words.trim());
          }}
        >
          <TextInput
            aria-label={question.prompt}
            value={words}
            disabled={!live}
            onChange={event => setWords(event.target.value)}
          />
          <Button type="submit" size="small" disabled={!live || !words.trim()}>
            Answer
          </Button>
        </Box>
      ) : null}
      {question.kind === 'form' ? (
        <Suspense fallback={null}>
          <SchemaForm
            schema={question.form as never}
            disabled={!live}
            onSubmit={({ formData }: { formData?: unknown }) =>
              answer(formData ?? {})
            }
          />
        </Suspense>
      ) : null}
      {question.kind === 'file' ? (
        <input
          type="file"
          aria-label={question.prompt}
          accept={question.accept.join(',') || undefined}
          disabled={!live || !upload}
          onChange={event => {
            const chosen = event.target.files?.[0];
            if (!chosen) return;
            if (!upload) {
              setSaid('The chat cannot take a file here.');
              return;
            }
            setSaid(null);
            // Uploaded first: the answer is its ref (REACTOR_UI RU-6).
            void upload(chosen)
              .then(ref => answer(ref))
              .catch((failure: unknown) =>
                setSaid(
                  failure instanceof Error ? failure.message : String(failure),
                ),
              );
          }}
        />
      ) : null}
      {said ? (
        <Text as="p" sx={{ color: 'danger.fg', fontSize: 1, m: 0 }}>
          {said}
        </Text>
      ) : null}
    </Box>
  );
}

export default QuestionView;
