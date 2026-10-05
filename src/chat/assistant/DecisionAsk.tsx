/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Ask a decision* in the floating assistant's balloon: a small form — the
 * situation, the question, its type (yes or no; a choice with its options
 * listed; a score with its range) — asked of Jev through the runtime, and
 * the answer said back in the balloon in plain words with its confidence.
 *
 * @module chat/assistant/DecisionAsk
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  FormControl,
  Select,
  Text,
  Textarea,
  TextInput,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  DEFAULT_SCORE_RANGE,
  decisionAskProblem,
  decisionRequest,
  decisionResponseWords,
  type DecisionAsker,
  type DecisionType,
} from './decisions';

/** The balloon's words for a decision. */
export const DECISION_WORDS = {
  ask: 'Ask a decision',
  asking: 'Asking…',
  submit: 'Ask',
  cancel: 'Cancel',
  again: 'Ask another',
  types: {
    noul: 'Yes or no',
    choice: 'A choice',
    score: 'A score',
  } satisfies Record<DecisionType, string>,
} as const;

export interface DecisionAskProps {
  /** Asks the runtime. */
  ask: DecisionAsker;
  /** The form or its answer is on screen: the balloon must stay. */
  onActiveChange?: (active: boolean) => void;
}

const LINK_SX = {
  mt: 1,
  p: 0,
  border: 0,
  bg: 'transparent',
  color: 'accent.fg',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 1,
} as const;

export function DecisionAsk({
  ask,
  onActiveChange,
}: DecisionAskProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [situation, setSituation] = useState('');
  const [question, setQuestion] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DecisionType>('noul');
  const [options, setOptions] = useState('');
  const [from, setFrom] = useState(String(DEFAULT_SCORE_RANGE.from));
  const [to, setTo] = useState(String(DEFAULT_SCORE_RANGE.to));
  const [problem, setProblem] = useState<string | undefined>();
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | undefined>();

  // Gone from the screen — the conversation opened, the balloon closed — it
  // no longer holds the balloon up.
  const activeChange = useRef(onActiveChange);
  activeChange.current = onActiveChange;
  useEffect(() => () => activeChange.current?.(false), []);

  const show = (active: boolean) => {
    setOpen(active);
    onActiveChange?.(active);
  };
  const close = () => {
    setAnswer(undefined);
    setProblem(undefined);
    show(false);
  };

  if (!open) {
    return (
      <Box
        as="button"
        type="button"
        data-balloon-ask-decision=""
        onClick={() => show(true)}
        sx={{ ...LINK_SX, display: 'block' }}
      >
        {DECISION_WORDS.ask}
      </Box>
    );
  }

  if (answer !== undefined) {
    return (
      <Box data-balloon-decision="answered" sx={{ mt: 2 }}>
        <Text
          as="p"
          data-decision-answer=""
          sx={{ m: 0, fontWeight: 'semibold' }}
        >
          {answer}
        </Text>
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button size="small" onClick={() => setAnswer(undefined)}>
            {DECISION_WORDS.again}
          </Button>
          <Button size="small" variant="invisible" onClick={close}>
            {DECISION_WORDS.cancel}
          </Button>
        </Box>
      </Box>
    );
  }

  const submit = async () => {
    const asked = {
      situation,
      question,
      type,
      name,
      options: options.split('\n'),
      range: { from: Number(from), to: Number(to) },
    };
    const refused = decisionAskProblem(asked);
    setProblem(refused);
    if (refused) {
      return;
    }
    const request = decisionRequest(asked);
    setAsking(true);
    try {
      setAnswer(decisionResponseWords(request, await ask(request)));
    } catch (error) {
      setAnswer(
        `Nothing was decided: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setAsking(false);
    }
  };

  return (
    <Box
      as="form"
      data-balloon-decision="asking"
      aria-label={DECISION_WORDS.ask}
      onSubmit={(event: React.FormEvent) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
          close();
        }
      }}
      sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <FormControl>
        <FormControl.Label>Situation</FormControl.Label>
        <Textarea
          block
          rows={3}
          resize="vertical"
          name="situation"
          placeholder="Help! My payouts have been failing for 3 days."
          value={situation}
          onChange={event => setSituation(event.target.value)}
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>Question</FormControl.Label>
        <TextInput
          block
          size="small"
          name="question"
          placeholder="Is it urgent?"
          value={question}
          onChange={event => setQuestion(event.target.value)}
        />
      </FormControl>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Type</FormControl.Label>
          <Select
            block
            size="small"
            name="type"
            value={type}
            onChange={event => setType(event.target.value as DecisionType)}
          >
            {(Object.keys(DECISION_WORDS.types) as DecisionType[]).map(
              option => (
                <Select.Option key={option} value={option}>
                  {DECISION_WORDS.types[option]}
                </Select.Option>
              ),
            )}
          </Select>
        </FormControl>
        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Name</FormControl.Label>
          <TextInput
            block
            size="small"
            name="name"
            placeholder="Answer"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </FormControl>
      </Box>
      {type === 'choice' && (
        <FormControl>
          <FormControl.Label>Options, one per line</FormControl.Label>
          <Textarea
            block
            rows={3}
            resize="vertical"
            name="options"
            placeholder={'Billing\nTech\nSales'}
            value={options}
            onChange={event => setOptions(event.target.value)}
          />
        </FormControl>
      )}
      {type === 'score' && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl sx={{ flex: 1 }}>
            <FormControl.Label>From</FormControl.Label>
            <TextInput
              block
              size="small"
              type="number"
              name="from"
              value={from}
              onChange={event => setFrom(event.target.value)}
            />
          </FormControl>
          <FormControl sx={{ flex: 1 }}>
            <FormControl.Label>To</FormControl.Label>
            <TextInput
              block
              size="small"
              type="number"
              name="to"
              value={to}
              onChange={event => setTo(event.target.value)}
            />
          </FormControl>
        </Box>
      )}
      {problem ? (
        <Text
          as="p"
          role="alert"
          sx={{ m: 0, color: 'danger.fg', fontSize: 0 }}
        >
          {problem}
        </Text>
      ) : null}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button size="small" variant="primary" type="submit" disabled={asking}>
          {asking ? DECISION_WORDS.asking : DECISION_WORDS.submit}
        </Button>
        <Button size="small" type="button" onClick={close} disabled={asking}>
          {DECISION_WORDS.cancel}
        </Button>
      </Box>
    </Box>
  );
}

export default DecisionAsk;
