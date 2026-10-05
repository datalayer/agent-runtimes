/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The answers of a conversation, heard as they are written (VOICE.md VO-20,
 * VO-21): the newest answer of the agent is cut into sentences as it grows,
 * and each is given to the speaker as soon as it is complete. The answers
 * already there when voice was turned on are not read.
 *
 * @module voice/useSpokenAnswers
 */

import { useEffect, useRef } from 'react';
import { SentenceCutter } from './sentences';

/** What the speaker is given. */
export interface SentenceSink {
  say: (sentence: string) => void;
  stop: () => void;
}

interface Item {
  id?: unknown;
  role?: unknown;
  toolName?: unknown;
  content?: unknown;
}

/** An item's text, when it is the agent's own answer and not a tool call. */
export function answerText(item: unknown): string | undefined {
  const message = item as Item | undefined;
  if (
    !message ||
    message.role !== 'assistant' ||
    typeof message.toolName === 'string'
  ) {
    return undefined;
  }
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map(part =>
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'text'
          ? String((part as { text?: unknown }).text ?? '')
          : '',
      )
      .join(' ');
  }
  return undefined;
}

/**
 * Speaks the newest answer of `items` while `on`; `writing` says whether the
 * agent is still writing it — once it stops, what is left is said.
 */
export function useSpokenAnswers(
  items: readonly unknown[],
  writing: boolean,
  on: boolean,
  sink: SentenceSink | undefined,
): void {
  const heard = useRef<Set<string>>(new Set());
  const current = useRef<
    { id: string; cutter: SentenceCutter; ended: boolean } | undefined
  >(undefined);
  const started = useRef(false);
  useEffect(() => {
    if (!on || !sink) {
      started.current = false;
      current.current = undefined;
      return;
    }
    const answers = items
      .map((item, index) => ({
        id: String((item as Item)?.id ?? index),
        text: answerText(item),
      }))
      .filter(answer => answer.text !== undefined);
    if (!started.current) {
      // What was there before voice was on is not read.
      started.current = true;
      answers.forEach(answer => heard.current.add(answer.id));
      return;
    }
    const newest = answers[answers.length - 1];
    if (
      !newest ||
      (heard.current.has(newest.id) && current.current?.id !== newest.id)
    ) {
      return;
    }
    if (current.current?.id !== newest.id) {
      heard.current.add(newest.id);
      current.current = {
        id: newest.id,
        cutter: new SentenceCutter(),
        ended: false,
      };
    }
    const reading = current.current;
    if (reading.ended) {
      return;
    }
    for (const sentence of reading.cutter.feed(newest.text ?? '')) {
      sink.say(sentence);
    }
    if (!writing) {
      for (const sentence of reading.cutter.end(newest.text ?? '')) {
        sink.say(sentence);
      }
      reading.ended = true;
    }
  }, [items, writing, on, sink]);
}
